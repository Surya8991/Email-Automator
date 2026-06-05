'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Users, FileText, CalendarClock, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markOnboardingSeenAction } from '@/server/actions/onboarding'

/**
 * The CURRENT_VERSION constant, bump this to re-trigger the modal for
 * every user on their next sign-in. Useful when shipping a major UX
 * change you want everyone to see. Persisted per-user in settings as
 * `ONBOARDING_SEEN_VERSION`.
 */
export const ONBOARDING_CURRENT_VERSION = 1

interface Slide {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

const SLIDES: Slide[] = [
  {
    icon: <Users className="h-8 w-8 text-primary" />,
    title: 'Bring your contacts',
    body: (
      <>
        <p>Go to <Link href="/contacts" className="underline">/contacts</Link> and either add rows one-at-a-time or paste a CSV.
        Each row needs a name + email. Tags (e.g. <code>vc, priority-a</code>) help you slice later.</p>
      </>
    ),
  },
  {
    icon: <FileText className="h-8 w-8 text-primary" />,
    title: 'Pick a template',
    body: (
      <>
        <p>15 curated starter templates live at <Link href="/templates" className="underline">/templates</Link> (5 universal + 10 role-targeted for admins). Edit, clone, or write your own. Variables like <code>{'{{name}}'}</code>, <code>{'{{company}}'}</code>, and <code>{'{{role_name|fallback}}'}</code> are substituted per recipient at send time.</p>
        <p>Click <strong>Activate</strong> on one to make it the default for the next round of drafts.</p>
      </>
    ),
  },
  {
    icon: <Send className="h-8 w-8 text-primary" />,
    title: 'Generate + review drafts',
    body: (
      <>
        <p><Link href="/drafts" className="underline">/drafts</Link> generates personalized emails from your active template for every eligible contact. Edit any one inline with the rich-text editor.</p>
        <p>Admins get an <strong>AI Improve</strong> button on each row to rewrite tone. Don't like the rewrite? Click <strong>Undo</strong> in the success toast within an hour.</p>
      </>
    ),
  },
  {
    icon: <CalendarClock className="h-8 w-8 text-primary" />,
    title: 'Schedule or campaign',
    body: (
      <>
        <p><Link href="/schedule" className="underline">/schedule</Link> stages every draft out at staggered times. The worker fires them off in the background, pause/resume from the same page.</p>
        <p><Link href="/campaigns" className="underline">/campaigns</Link> chains multi-step sequences (intro → bump → final follow-up) with delays between steps and auto-stop on reply.</p>
      </>
    ),
  },
]

export function OnboardingModal({ initialOpen }: { initialOpen: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(initialOpen)
  const [step, setStep] = useState(0)
  const [pending, start] = useTransition()
  if (!open) return null
  const slide = SLIDES[step]!
  const last = step === SLIDES.length - 1

  function dismiss() {
    setOpen(false)
    // Persist the version on dismiss so we don't show it again until the
    // operator bumps ONBOARDING_CURRENT_VERSION.
    start(async () => {
      await markOnboardingSeenAction(ONBOARDING_CURRENT_VERSION)
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Quick tour ({step + 1} / {SLIDES.length})
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground" aria-label="Skip onboarding">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-6 flex items-start gap-4">
          {slide.icon}
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">{slide.title}</h2>
            <div className="space-y-2 text-sm text-muted-foreground">{slide.body}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={dismiss}>Skip</Button>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setStep(step - 1)}>Back</Button>
            ) : null}
            {last ? (
              <Button size="sm" disabled={pending} onClick={dismiss}>Get started</Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => setStep(step + 1)}>Next</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
