'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Save, Sparkles, Eye, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { personalize } from '@/lib/escape'
import { activateTemplateAction, saveTemplateAction } from '@/server/actions/templates'
import { aiDraftAction, aiSuggestSubjectsAction } from '@/server/actions/ai'
import type { Template } from '@/server/db/schema'

type Tone = 'professional' | 'friendly' | 'concise' | 'enthusiastic' | 'formal'
const TONES: Tone[] = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal']

const VARS = ['name', 'company', 'role_name', 'email', 'location', 'platform'] as const

const SAMPLE = { name: 'Jane Doe', company: 'Acme Corp', role_name: 'Senior Marketer', email: 'jane@acme.com', location: 'Remote', platform: 'LinkedIn' }

export function TemplateEditor({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [pickedId, setPickedId] = useState<number | null>(templates[0]?.id ?? null)
  const [draft, setDraft] = useState<Partial<Template>>({
    key: templates[0]?.key ?? 'default',
    label: templates[0]?.label ?? '',
    subject: templates[0]?.subject ?? 'Hi {{name}} — interested in {{role_name}}',
    initialMsg: templates[0]?.initialMsg ?? '<p>Hi {{name}},</p><p>I came across your work at {{company}}…</p>',
  })
  // AI controls (kept local so each user can experiment without saving)
  const [tone, setTone] = useState<Tone>('professional')
  const [aiGoal, setAiGoal] = useState('')
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[] | null>(null)

  // Insert {{var}} at the cursor of whichever field was last focused. Keeps the
  // focus in that field so the user can chain insertions without re-clicking.
  function insertVar(v: string) {
    const token = `{{${v}}}`
    const subjectActive = document.activeElement === subjectRef.current
    if (subjectActive && subjectRef.current) {
      const el = subjectRef.current
      const s = el.selectionStart ?? el.value.length
      const e = el.selectionEnd ?? el.value.length
      const next = el.value.slice(0, s) + token + el.value.slice(e)
      setDraft({ ...draft, subject: next })
      // Restore cursor position after React re-renders.
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
      return
    }
    const el = bodyRef.current
    if (!el) return
    const s = el.selectionStart ?? el.value.length
    const e = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, s) + token + el.value.slice(e)
    setDraft({ ...draft, initialMsg: next })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
  }

  function load(t: Template) {
    setPickedId(t.id)
    setDraft({ key: t.key, label: t.label, subject: t.subject, initialMsg: t.initialMsg })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px,1fr,1fr]">
      {/* On mobile + tablet: dropdown picker. On desktop: full list rail. */}
      <aside>
        <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Your templates</div>
        <select className="block w-full h-9 rounded-md border bg-background px-2 text-sm lg:hidden"
          value={pickedId ?? ''} onChange={(e) => {
            const t = templates.find((x) => x.id === Number(e.target.value))
            if (t) load(t)
          }}>
          {templates.length === 0 ? <option value="">— save to create —</option> : null}
          {templates.map((t) => (<option key={t.id} value={t.id}>{(t.active ? '★ ' : '') + (t.label || t.key)}</option>))}
        </select>
        <div className="hidden lg:block space-y-1">
          {templates.length === 0 ? <p className="text-sm text-muted-foreground">None yet — save to create.</p> : null}
          {templates.map((t) => (
            <button key={t.id} onClick={() => load(t)}
              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent ${pickedId === t.id ? 'border-primary' : ''}`}>
              <span className="truncate">{t.label || t.key}</span>
              {t.active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="key">Key</Label>
          <Input id="key" value={draft.key ?? ''} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="label">Label</Label>
          <Input id="label" value={draft.label ?? ''} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="subject">Subject</Label>
            <Button type="button" variant="ghost" size="sm" disabled={pending}
              onClick={() => start(async () => {
                const r = await aiSuggestSubjectsAction({ topic: draft.label || draft.subject || aiGoal || 'cold outreach to a recruiter', count: 5 })
                if ('error' in r && r.error) { toast.error(r.error); return }
                if ('subjects' in r && r.subjects) setSubjectSuggestions(r.subjects)
              })}>
              <Wand2 className="mr-1 h-3 w-3" /> Suggest
            </Button>
          </div>
          <Input ref={subjectRef} id="subject" value={draft.subject ?? ''} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          {subjectSuggestions && subjectSuggestions.length > 0 ? (
            <div className="space-y-1 rounded-md border bg-muted/40 p-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Click one to use:</span>
                <button type="button" onClick={() => setSubjectSuggestions(null)} className="hover:text-foreground">dismiss</button>
              </div>
              <ul className="space-y-1">
                {subjectSuggestions.map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => { setDraft({ ...draft, subject: s }); setSubjectSuggestions(null) }}
                      className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="initialMsg">Body (HTML)</Label>
          <textarea ref={bodyRef} id="initialMsg" rows={14}
            className="flex w-full rounded-md border bg-background px-3 py-2 font-mono text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={draft.initialMsg ?? ''} onChange={(e) => setDraft({ ...draft, initialMsg: e.target.value })} />
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">Insert:</span>
            {VARS.map((v) => (
              <button key={v} type="button" onClick={() => insertVar(v)}
                className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-accent">{`{{${v}}}`}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await saveTemplateAction(draft as never)
            if ('error' in r && r.error) { toast.error(r.error); return }
            toast.success(`Saved (v${(r as { version?: number }).version ?? '?'})`)
            router.refresh()
          })}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          {pickedId ? (
            <Button variant="outline" disabled={pending} onClick={() => start(async () => {
              await activateTemplateAction(pickedId)
              toast.success('Template activated')
              router.refresh()
            })}>Activate</Button>
          ) : null}
        </div>

        {/* AI panel — tone + goal + Improve/Draft buttons */}
        <div className="space-y-2 rounded-md border bg-card/40 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="ai-tone" className="text-xs">Tone</Label>
              <select id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}
                className="h-8 rounded-md border bg-background px-2 text-sm capitalize">
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid gap-1 flex-1 min-w-[200px]">
              <Label htmlFor="ai-goal" className="text-xs">Goal (optional — for Draft only)</Label>
              <Input id="ai-goal" value={aiGoal} onChange={(e) => setAiGoal(e.target.value)}
                placeholder="reach out about the Senior Marketer role" />
            </div>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
              const r = await aiDraftAction({
                goal: `Improve this outreach email for ${draft.label || 'a recruiter'}.`,
                existing: draft.initialMsg ?? '', tone,
              })
              if ('error' in r && r.error) { toast.error(r.error); return }
              if ('html' in r && r.html) { setDraft({ ...draft, initialMsg: r.html }); toast.success(`Rewrote in ${tone} tone`) }
            })}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Improve
            </Button>
            <Button variant="outline" size="sm" disabled={pending || !aiGoal} onClick={() => start(async () => {
              const r = await aiDraftAction({ goal: aiGoal, tone })
              if ('error' in r && r.error) { toast.error(r.error); return }
              if ('html' in r && r.html) { setDraft({ ...draft, initialMsg: r.html }); toast.success(`Drafted in ${tone} tone`) }
            })}>
              <Wand2 className="mr-1.5 h-4 w-4" /> Draft from goal
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <strong>Improve</strong> rewrites the current body. <strong>Draft</strong> generates new copy from your goal — useful for a blank template.
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" /> Live preview</div>
        <div className="rounded-md border bg-background p-4">
          <div className="text-xs text-muted-foreground">To: {SAMPLE.name} &lt;{SAMPLE.email}&gt;</div>
          <div className="mt-1 font-medium">{personalize(draft.subject ?? '', SAMPLE, 'subject')}</div>
          <div className="prose prose-sm dark:prose-invert mt-3 max-w-none"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: personalize(draft.initialMsg ?? '', SAMPLE, 'html') }} />
        </div>
      </section>
    </div>
  )
}
