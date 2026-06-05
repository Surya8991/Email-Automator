'use client'
import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// PWA install banner. Listens for `beforeinstallprompt` (Chrome/Edge),
// shows a small dismissible banner, calls prompt() on user click.
// Dismissal is sticky for 30 days via localStorage so we don't pester.
//
// Safari iOS doesn't fire beforeinstallprompt — we fall back to a
// gentle hint with the manual "Share → Add to Home Screen" path.

interface DeferredPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const SUPPRESS_KEY = 'ea-pwa-install-dismissed-until'
const SUPPRESS_DAYS = 30

function isSuppressed(): boolean {
  try {
    const v = localStorage.getItem(SUPPRESS_KEY)
    if (!v) return false
    const until = Number(v)
    return Number.isFinite(until) && until > Date.now()
  } catch { return true }
}

function suppress() {
  try { localStorage.setItem(SUPPRESS_KEY, String(Date.now() + SUPPRESS_DAYS * 24 * 60 * 60 * 1000)) } catch { /* localStorage may be disabled */ }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isSuppressed()) return
    // Already installed? matchMedia hint, doesn't fire on every browser.
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as DeferredPrompt)
      setOpen(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener)

    // iOS Safari heuristic — UA-based, not perfect but the only signal.
    const ua = navigator.userAgent
    const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)
    if (isIos && !window.matchMedia('(display-mode: standalone)').matches) {
      // Delay so it doesn't pop on first paint — wait 8 s of "real use".
      const t = setTimeout(() => { setIosHint(true); setOpen(true) }, 8_000)
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener)
        clearTimeout(t)
      }
    }
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener)
  }, [])

  if (!open) return null

  function dismiss() {
    suppress()
    setOpen(false)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const result = await deferred.userChoice
    if (result.outcome === 'accepted') {
      setOpen(false)
    } else {
      // Dismissed — respect the user's choice for the suppression window.
      suppress()
      setOpen(false)
    }
  }

  return (
    <div
      role="dialog" aria-label="Install Email Automator"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md rounded-lg border bg-card p-4 shadow-lg ea-pop sm:left-auto sm:right-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Email Automator</p>
          {iosHint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              On iOS: tap <strong>Share</strong> → <strong>Add to Home Screen</strong> for a fullscreen app feel.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add it to your home screen for one-tap access — no app store, no extra account.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!iosHint && deferred ? (
              <Button size="sm" onClick={install}>
                <Download className="mr-1 h-3.5 w-3.5" /> Install
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
          </div>
        </div>
        <button
          type="button" onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
