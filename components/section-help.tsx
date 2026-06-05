'use client'
import { useState } from 'react'
import { HelpCircle, ExternalLink, Lightbulb, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Per-page help button. Lives next to the PageHeader title. Click
// opens a dialog explaining: what this page does, the key actions,
// common pitfalls, and a deep link to the matching /guide section.
//
// Content is authored per page (not auto-generated) — generic help is
// worse than no help. Pass a `guideAnchor` to link to the relevant
// /guide#section so users get one-click access to the full reference.

export interface SectionHelpProps {
  title: string
  what: React.ReactNode
  actions?: Array<{ label: string; hint: string }>
  pitfalls?: Array<{ label: string; hint: string }>
  guideAnchor?: string
  /** Pre-mount in `open` state — exposed for tests / programmatic open. */
  initialOpen?: boolean
  className?: string
}

export function SectionHelp({
  title, what, actions = [], pitfalls = [], guideAnchor, initialOpen = false, className,
}: SectionHelpProps) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`What is ${title}?`}
        title={`What is ${title}?`}
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground ea-transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
          className,
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" /> {title}
            </DialogTitle>
            <DialogDescription>What this page does, what to try, and what to watch out for.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overview</div>
              <div className="leading-relaxed text-foreground">{what}</div>
            </div>

            {actions.length > 0 ? (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Lightbulb className="h-3 w-3" /> Try
                </div>
                <ul className="space-y-1.5">
                  {actions.map((a, i) => (
                    <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      <span className="font-medium text-foreground">{a.label}</span>
                      <span className="text-muted-foreground">{a.hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {pitfalls.length > 0 ? (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" /> Watch out
                </div>
                <ul className="space-y-1.5">
                  {pitfalls.map((p, i) => (
                    <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      <span className="font-medium text-foreground">{p.label}</span>
                      <span className="text-muted-foreground">{p.hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {guideAnchor ? (
              <a
                href={`/guide${guideAnchor.startsWith('#') ? guideAnchor : `#${guideAnchor}`}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Full reference in the User guide <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
