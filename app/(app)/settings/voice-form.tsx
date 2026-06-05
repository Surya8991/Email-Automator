'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { saveVoiceAction } from '@/server/actions/voice'

// Persists AI_VOICE_SAMPLES — a free-form text blob the AI prompt
// builder injects into every generation. Persisted as a single setting
// so the per-row GDPR export can apply a clean clamp/redact pass on it.
//
// Hard char cap mirrors what the server clamps to (2_400). The UI
// shows a live counter so the user knows when truncation kicks in.

const MAX = 2_400

export function VoiceForm({ initial }: { initial: string }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [pending, start] = useTransition()
  const dirty = v !== initial
  const overflow = v.length > MAX

  function save() {
    start(async () => {
      const r = await saveVoiceAction({ samples: v.slice(0, MAX) })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(overflow ? 'Saved (truncated to 2,400 chars)' : 'Brand voice saved')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="voice">Samples</Label>
          <span className={`text-xs tabular-nums ${overflow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {v.length} / {MAX}
          </span>
        </div>
        <textarea
          id="voice"
          value={v} onChange={(e) => setV(e.target.value)}
          rows={8}
          placeholder={`Paste 1–3 of your own emails. The AI will pick up your sentence length, opening style, and vocabulary.

Example:

Hey Sam — quick one. I noticed your team is hiring for a Growth lead. I led a similar function at Acme (took the funnel from 1.2% to 4.5% in 9 months). Are you taking external candidates? Happy to share the deck either way.

— Jane`}
          className="w-full rounded-md border bg-background px-3 py-2 font-sans text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending || !dirty}>
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
        {initial ? (
          <Button variant="ghost" disabled={pending || v === ''} onClick={() => setV('')}>Clear</Button>
        ) : null}
      </div>
    </div>
  )
}
