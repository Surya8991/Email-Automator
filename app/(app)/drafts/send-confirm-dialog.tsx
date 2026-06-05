'use client'
import { Send, AlertTriangle, Mail } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Friendly replacement for the browser confirm() that used to gate
// "Send all" / "Send selected". Confirm() is jarring on mobile, can be
// disabled per-site by some browsers, and gives no preview of what's
// about to ship. This dialog lists the first 5 recipients + count so
// the user has a real chance to catch a wrong-template / wrong-audience
// mistake before SMTP fires.

interface DraftPreview { id: number; subject: string; toEmail: string }

export function SendConfirmDialog({
  open,
  onOpenChange,
  drafts,
  totalCount,
  pending = false,
  scope,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** First-5 preview rows. */
  drafts: DraftPreview[]
  /** Total count (may exceed drafts.length when only a sample is passed). */
  totalCount: number
  pending?: boolean
  /** Wording cue — "all" sends everything pending; "selected" only the picks. */
  scope: 'all' | 'selected'
  onConfirm: () => void
}) {
  const sample = drafts.slice(0, 5)
  const remaining = Math.max(0, totalCount - sample.length)
  const big = totalCount > 25
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send {totalCount} draft{totalCount === 1 ? '' : 's'} now?
          </DialogTitle>
          <DialogDescription>
            {scope === 'all'
              ? "Every pending draft will hit your SMTP server back-to-back. There's no schedule — they're sent immediately."
              : `Sending only the ${totalCount} draft${totalCount === 1 ? '' : 's'} you selected. The rest stay pending.`}
          </DialogDescription>
        </DialogHeader>

        {big ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>That&apos;s a lot at once.</strong> Consider <em>Schedule…</em> instead — stagger over minutes so your SMTP / Gmail doesn&apos;t flag the burst as spam.
            </div>
          </div>
        ) : null}

        <div className="rounded-md border bg-card">
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            First {sample.length} of {totalCount}
          </div>
          <ul className="divide-y text-sm">
            {sample.map((d) => (
              <li key={d.id} className="flex items-start gap-2 px-3 py-2">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.subject}</div>
                  <div className="truncate text-xs text-muted-foreground">to {d.toEmail}</div>
                </div>
              </li>
            ))}
            {remaining > 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">…and {remaining} more</li>
            ) : null}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={onConfirm} disabled={pending || totalCount === 0}>
            <Send className="mr-1.5 h-4 w-4" /> Send {totalCount} now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
