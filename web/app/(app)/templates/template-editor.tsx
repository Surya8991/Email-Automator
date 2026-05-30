'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Save, Sparkles, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { personalize } from '@/lib/escape'
import { activateTemplateAction, saveTemplateAction } from '@/server/actions/templates'
import { aiDraftAction } from '@/server/actions/ai'
import type { Template } from '@/server/db/schema'

const SAMPLE = { name: 'Jane Doe', company: 'Acme Corp', role_name: 'Senior Marketer', email: 'jane@acme.com', location: 'Remote', platform: 'LinkedIn' }

export function TemplateEditor({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [pickedId, setPickedId] = useState<number | null>(templates[0]?.id ?? null)
  const [draft, setDraft] = useState<Partial<Template>>({
    key: templates[0]?.key ?? 'default',
    label: templates[0]?.label ?? '',
    subject: templates[0]?.subject ?? 'Hi {{name}} — interested in {{role_name}}',
    initialMsg: templates[0]?.initialMsg ?? '<p>Hi {{name}},</p><p>I came across your work at {{company}}…</p>',
  })

  function load(t: Template) {
    setPickedId(t.id)
    setDraft({ key: t.key, label: t.label, subject: t.subject, initialMsg: t.initialMsg })
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px,1fr,1fr]">
      <aside className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">Your templates</div>
        {templates.length === 0 ? <p className="text-sm text-muted-foreground">None yet — save to create.</p> : null}
        {templates.map((t) => (
          <button key={t.id} onClick={() => load(t)}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent ${pickedId === t.id ? 'border-primary' : ''}`}>
            <span className="truncate">{t.label || t.key}</span>
            {t.active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
          </button>
        ))}
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
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={draft.subject ?? ''} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="initialMsg">Body (HTML)</Label>
          <textarea id="initialMsg" rows={14}
            className="flex w-full rounded-md border bg-background px-3 py-2 font-mono text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={draft.initialMsg ?? ''} onChange={(e) => setDraft({ ...draft, initialMsg: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await saveTemplateAction(draft as never)
            if ('error' in r && r.error) alert(r.error)
            router.refresh()
          })}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          {pickedId ? (
            <Button variant="outline" disabled={pending} onClick={() => start(async () => {
              await activateTemplateAction(pickedId)
              router.refresh()
            })}>Activate</Button>
          ) : null}
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await aiDraftAction({ goal: `Improve this outreach email for ${draft.label || 'a recruiter'}.`, existing: draft.initialMsg ?? '' })
            if ('error' in r && r.error) { alert(r.error); return }
            if ('html' in r && r.html) setDraft({ ...draft, initialMsg: r.html })
          })}><Sparkles className="mr-1.5 h-4 w-4" /> AI improve</Button>
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
