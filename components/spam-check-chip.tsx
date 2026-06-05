'use client'
import { useMemo, useState } from 'react'
import { ShieldAlert, ShieldCheck, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { checkSpamRisk, spamRiskBand } from '@/lib/spam-check'
import { pluralWord } from '@/lib/pluralize'

// Chip that surfaces the result of lib/spam-check on the active
// (subject, body) pair. Click to expand the list of triggered rules
// with a short remediation hint for each.
//
// Designed to be cheap to render — `checkSpamRisk` is pure + fast,
// memoize against the two strings.

const BAND_STYLE = {
  clean: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  mild:  'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  loud:  'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
} as const

const BAND_ICON = {
  clean: ShieldCheck,
  mild:  AlertTriangle,
  loud:  ShieldAlert,
} as const

const BAND_LABEL = {
  clean: 'Deliverability: looks clean',
  mild:  'Deliverability: minor flags',
  loud:  'Deliverability: high risk',
} as const

export function SpamCheckChip({ subject, body }: { subject: string; body: string }) {
  const [open, setOpen] = useState(false)
  const result = useMemo(() => checkSpamRisk(subject, body), [subject, body])
  const band = spamRiskBand(result.score)
  const Icon = BAND_ICON[band]
  const style = BAND_STYLE[band]

  // Don't even render when clean AND there's nothing to say — keeps
  // the editor chrome quiet by default. Power users can still expand
  // a "clean" chip when curious by checking everything is OK; we keep
  // the chip visible whenever the body has content.
  if (band === 'clean' && result.hits.length === 0 && body.trim().length === 0) return null

  return (
    <div className={`rounded-md border ${style} text-xs`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{BAND_LABEL[band]}</span>
        {result.hits.length > 0 ? (
          <span className="rounded-full bg-background/40 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
            {pluralWord(result.hits.length, 'flag')}: {result.hits.length}
          </span>
        ) : null}
        <span className="ml-auto opacity-70">
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-current/20 px-3 py-2">
          {result.hits.length === 0 ? (
            <li className="opacity-80">No rules fired. Subject + body look reasonable.</li>
          ) : result.hits.map((h) => (
            <li key={h.rule} className="flex gap-2">
              <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
              <span className="opacity-90">{h.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
