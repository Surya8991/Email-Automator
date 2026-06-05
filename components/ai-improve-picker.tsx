'use client'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Tone catalog — kept in sync with the server-side TONE_LIST in
// server/actions/{drafts,schedule,campaigns}.ts. Adding a new tone here
// also requires adding it to the server validators.
export const TONES = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'] as const
export type Tone = (typeof TONES)[number]

const TONE_LABELS: Record<Tone, string> = {
  professional: 'Professional',
  friendly: 'Friendly',
  concise: 'Concise',
  enthusiastic: 'Enthusiastic',
  formal: 'Formal',
}

/**
 * Reusable tone-picker popover for AI Improve features. Caller controls
 * `open` (the row id triggering the popover) and provides an `onApply`
 * handler that receives the selected tone. The popover handles its own
 * tone state and Cancel/Improve buttons.
 *
 * Usage:
 *   {aiRowId === d.id ? (
 *     <AiImprovePicker
 *       busy={aiBusy === d.id}
 *       onCancel={() => setAiRowId(null)}
 *       onApply={(tone) => start(async () => { ... })}
 *     />
 *   ) : null}
 */
export interface AiImprovePickerProps {
  busy: boolean
  onCancel: () => void
  onApply: (tone: Tone) => void
  initialTone?: Tone
}

export function AiImprovePicker({ busy, onCancel, onApply, initialTone = 'professional' }: AiImprovePickerProps) {
  const [tone, setTone] = useState<Tone>(initialTone)
  return (
    <div className="absolute right-0 top-9 z-10 w-56 space-y-2 rounded-md border bg-popover p-2 text-sm shadow-md">
      <label className="block text-xs font-medium text-muted-foreground">Tone</label>
      <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}
        className="block w-full rounded-md border bg-background px-2 py-1 text-xs">
        {TONES.map((t) => (
          <option key={t} value={t}>{TONE_LABELS[t]}</option>
        ))}
      </select>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={busy} onClick={() => onApply(tone)}>
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Improve
        </Button>
      </div>
    </div>
  )
}
