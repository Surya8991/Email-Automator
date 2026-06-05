'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Palette } from 'lucide-react'
import { ACCENTS, type AccentKey } from '@/components/accent-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { saveAccentAction } from '@/server/actions/profile'

// Picker for the 5 accent colors in /profile. Each swatch previews
// itself when hovered/focused (sets --primary inline so the user sees
// the change live before committing). Selecting and saving persists
// to user_settings.ACCENT and reloads the page so the layout-level
// AccentProvider picks it up.

export function AccentPicker({ current }: { current: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picked, setPicked] = useState<AccentKey | ''>((current as AccentKey) || '')

  function preview(k: AccentKey | '') {
    // Live preview — write --primary directly to documentElement so the
    // user sees the swap without re-rendering the tree. Reset on
    // mouseleave so the visible state matches the actually-saved value.
    if (!k) {
      document.documentElement.style.removeProperty('--primary')
      return
    }
    const cfg = ACCENTS[k]
    const isDark = document.documentElement.classList.contains('dark')
    document.documentElement.style.setProperty('--primary', isDark ? cfg.dark : cfg.light)
  }

  function save() {
    start(async () => {
      const r = await saveAccentAction(picked)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Accent saved — reloading…')
      // Hard refresh so the layout's <style> tag updates with the new accent.
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4" /> Accent color
        </CardTitle>
        <CardDescription>
          Tints buttons, links, focus rings, and the primary CTA across the app. Picks survive themes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.entries(ACCENTS) as Array<[AccentKey, typeof ACCENTS[AccentKey]]>).map(([k, cfg]) => {
            const isPicked = picked === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={isPicked}
                aria-label={`Use ${cfg.label} accent`}
                onClick={() => { setPicked(k); preview(k) }}
                onMouseEnter={() => preview(k)}
                onMouseLeave={() => preview(picked)}
                onFocus={() => preview(k)}
                onBlur={() => preview(picked)}
                className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm ea-transition hover:bg-muted ${isPicked ? 'border-foreground' : ''}`}
              >
                <span aria-hidden className="h-4 w-4 rounded-full ring-2 ring-background"
                  style={{ background: cfg.hex }} />
                <span>{cfg.label}</span>
                {isPicked ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={pending || picked === current}>
            {pending ? 'Saving…' : 'Save accent'}
          </Button>
          {current ? (
            <Button variant="ghost" onClick={() => { setPicked(''); preview('') }}>
              Reset to default
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
