'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveCompanyAction, deleteCompanyAction } from '@/server/actions/companies'
import { aiEnrichCompanyAction } from '@/server/actions/ai'

interface Initial {
  id?: number
  name: string; industry: string; hq: string; size: string; funding: string
  glassdoor: string; techStack: string; salaryRange: string; hiringFreq: string
  notes: string; sourceUrl: string
}

const EMPTY: Initial = {
  name: '', industry: '', hq: '', size: '', funding: '',
  glassdoor: '', techStack: '', salaryRange: '', hiringFreq: '',
  notes: '', sourceUrl: '',
}

export function CompanyForm({ initial }: { initial?: Initial }) {
  const router = useRouter()
  const [state, setState] = useState<Initial>(initial ?? EMPTY)
  const [pending, start] = useTransition()
  const set = (k: keyof Initial) => (v: string) =>
    setState((s) => ({ ...s, [k]: v }))

  function submit() {
    if (!state.name.trim()) { toast.error('Name required'); return }
    start(async () => {
      const r = await saveCompanyAction(state)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(initial?.id ? 'Updated' : 'Added')
      router.push('/companies')
    })
  }

  function aiEnrich() {
    if (!state.name.trim()) { toast.error('Type the company name first.'); return }
    start(async () => {
      const r = await aiEnrichCompanyAction({ name: state.name })
      if ('error' in r) { toast.error(r.error ?? 'AI failed'); return }
      // Only fill in empty fields — never overwrite the user's edits.
      // Banner-style toast prompts a manual verify since the model can
      // hallucinate.
      const filled: string[] = []
      const next = { ...state }
      for (const k of ['industry', 'hq', 'size', 'funding', 'glassdoor', 'techStack', 'salaryRange', 'hiringFreq', 'notes'] as const) {
        const v = r.data?.[k]
        if (typeof v === 'string' && v.trim() && !next[k].trim()) {
          next[k] = v
          filled.push(k)
        }
      }
      setState(next)
      if (filled.length === 0) toast('AI had nothing new — fields look complete already.')
      else toast.success(`AI filled ${filled.length} field${filled.length === 1 ? '' : 's'} — verify before saving.`)
    })
  }

  function destroy() {
    if (!initial?.id) return
    if (!confirm(`Delete ${state.name}? This removes the research record, not the contact rows.`)) return
    start(async () => {
      await deleteCompanyAction(initial.id!)
      toast.success('Deleted')
      router.push('/companies')
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Company name *</Label>
        <div className="flex gap-2">
          <Input id="name" value={state.name} onChange={(e) => set('name')(e.target.value)} placeholder="Acme Corp" required />
          <Button type="button" variant="outline" disabled={pending || !state.name.trim()}
            onClick={aiEnrich}
            title="Use AI (Groq) to fill in industry, HQ, size, tech stack, etc.">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI fill
          </Button>
        </div>
      </div>
      <Field id="industry" label="Industry" value={state.industry} onChange={set('industry')} placeholder="SaaS · Fintech · Health" />
      <Field id="hq" label="HQ" value={state.hq} onChange={set('hq')} placeholder="Bengaluru, India" />
      <Field id="size" label="Size" value={state.size} onChange={set('size')} placeholder="50-200 / 1000+ / etc." />
      <Field id="funding" label="Funding" value={state.funding} onChange={set('funding')} placeholder="Series B · Bootstrapped" />
      <Field id="glassdoor" label="Glassdoor rating" value={state.glassdoor} onChange={set('glassdoor')} placeholder="4.2 / 5" />
      <Field id="techStack" label="Tech stack" value={state.techStack} onChange={set('techStack')} placeholder="React, Postgres, AWS" />
      <Field id="salaryRange" label="Salary range" value={state.salaryRange} onChange={set('salaryRange')} placeholder="₹40-60L" />
      <Field id="hiringFreq" label="Hiring frequency" value={state.hiringFreq} onChange={set('hiringFreq')} placeholder="Always / Rolling / Quarterly" />
      <Field id="sourceUrl" label="Source URL" value={state.sourceUrl} onChange={set('sourceUrl')} placeholder="https://..." />
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={state.notes}
          onChange={(e) => set('notes')(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Anything else worth remembering — values, interview format, pay band, etc."
        />
      </div>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            <Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {initial?.id ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={destroy}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function Field({
  id, label, value, onChange, placeholder, required,
}: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
    </div>
  )
}
