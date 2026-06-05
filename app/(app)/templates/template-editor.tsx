'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Save, Sparkles, Eye, Wand2, Copy, Send, AlertTriangle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GenerateFromContext } from './generate-from-context'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { useSaveShortcut } from '@/components/use-save-shortcut'
import { useUnsavedGuard } from '@/components/use-unsaved-guard'
import { personalize } from '@/lib/escape'
import { activateTemplateAction, saveTemplateAction, cloneTemplateAction, sendTemplateTestAction } from '@/server/actions/templates'
import { aiDraftAction, aiSuggestSubjectsAction } from '@/server/actions/ai'
import type { Template } from '@/server/db/schema'

// Tokens always available per recipient (see buildEmail() in
// server/services/drafts.ts). Used by the variable validator to flag
// unknown {{names}} typed in the editor before the user sends to anyone.
const BUILTIN_VARS = new Set(['name', 'email', 'company', 'role_name', 'location', 'platform'])

type Tone = 'professional' | 'friendly' | 'concise' | 'enthusiastic' | 'formal'
const TONES: Tone[] = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal']
type Length = 'short' | 'medium' | 'long'
const LENGTHS: Length[] = ['short', 'medium', 'long']
type Cta = 'none' | 'soft' | 'direct'
const CTAS: Cta[] = ['none', 'soft', 'direct']

// Variables exposed in the editor's clickable palette. Anything mapped
// in server/services/drafts.ts buildEmail() can be inserted — keep the
// two lists in sync. Grouped so the UI can render them in sections.
const VAR_GROUPS = [
  {
    label: 'Recipient',
    vars: [
      { key: 'name',      hint: 'Recruiter or contact name' },
      { key: 'email',     hint: 'Email address' },
      { key: 'company',   hint: 'Company / organization' },
      { key: 'role_name', hint: 'Job title / role' },
      { key: 'location',  hint: 'City or "Remote"' },
      { key: 'platform',  hint: 'Where you found them (LinkedIn, Naukri…)' },
    ],
  },
  {
    label: 'Common HTML',
    vars: [
      { key: 'salutation_hi',     hint: 'Inserts "Hi {{name}},"', literal: '<p>Hi {{name}},</p>' },
      { key: 'salutation_dear',   hint: 'Inserts "Dear {{name}},"', literal: '<p>Dear {{name}},</p>' },
      { key: 'paragraph',         hint: 'Inserts an empty paragraph', literal: '<p></p>' },
      { key: 'bullet_list',       hint: 'Inserts a 3-bullet list', literal: '<ul><li></li><li></li><li></li></ul>' },
      { key: 'signoff_best',      hint: 'Sign-off "Best regards,"', literal: '<p>Best regards,</p>' },
      { key: 'signoff_thanks',    hint: 'Sign-off "Thanks,"', literal: '<p>Thanks,</p>' },
      { key: 'divider',           hint: 'Horizontal divider', literal: '<hr />' },
    ],
  },
] as const

const SAMPLE = { name: 'Jane Doe', company: 'Acme Corp', role_name: 'Senior Marketer', email: 'jane@acme.com', location: 'Remote', platform: 'LinkedIn' }

interface TemplateStat { sent: number; openRate: number; replyRate: number }

export function TemplateEditor({
  templates, customFieldKeys = [], stats = {},
}: {
  templates: Template[]
  customFieldKeys?: string[]
  stats?: Record<number, TemplateStat>
}) {
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
  const [aiLength, setAiLength] = useState<Length>('medium')
  const [aiCta, setAiCta] = useState<Cta>('soft')
  const [aiGoal, setAiGoal] = useState('')
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[] | null>(null)
  // Tab strip across the editor: 'edit' shows the rich form; 'generate'
  // swaps in the JD/URL/post → draft flow. Both share the same `draft`
  // state so accepting a generated draft drops you back into 'edit'
  // with the new subject + body in place.
  const [mode, setMode] = useState<'edit' | 'generate'>('edit')

  // ── Editor lifecycle hooks ─────────────────────────────────────
  // Dirty when the in-memory draft diverges from the currently-loaded
  // template. Compared on the 4 round-tripped fields (key/label/subject/
  // initialMsg) — version/active aren't user-editable here.
  const original = templates.find((t) => t.id === pickedId)
  const dirty = original
    ? (original.key !== (draft.key ?? '') ||
       original.label !== (draft.label ?? '') ||
       original.subject !== (draft.subject ?? '') ||
       original.initialMsg !== (draft.initialMsg ?? ''))
    : Boolean(draft.key || draft.label || draft.subject || draft.initialMsg)
  useUnsavedGuard(dirty)
  // ⌘S / Ctrl+S triggers save when in the Edit pane. Suppressed
  // while pending so a stuck request can't queue up duplicates.
  useSaveShortcut(() => {
    if (mode !== 'edit') return
    start(async () => {
      const r = await saveTemplateAction(draft as never)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(`Saved (v${(r as { version?: number }).version ?? '?'})`)
      router.refresh()
    })
  }, !pending && mode === 'edit')

  // Insert a token at the cursor of whichever field was last focused.
  // Tokens are either {{var}} (variables — substituted per recipient by
  // the personalize() helper) or raw HTML snippets (literal). Keeps focus
  // in the field so the user can chain insertions without re-clicking.
  function insertVar(v: string, literal?: string) {
    const token = literal ?? `{{${v}}}`
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

  // Variable validator — scan subject + body for every {{token}} the
  // user typed, flag any that aren't in BUILTIN_VARS or the user's
  // custom-field list. Catches typos like {{compny}} or {{rolename}}
  // before send instead of after — those would otherwise pass through
  // literally and the recipient sees "Hi {{compny}}".
  const knownVars = new Set([...BUILTIN_VARS, ...customFieldKeys])
  const unknownVars = (() => {
    const found = new Set<string>()
    const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    const haystack = `${draft.subject ?? ''}\n${draft.initialMsg ?? ''}`
    let m: RegExpExecArray | null
    while ((m = re.exec(haystack)) !== null) {
      const tok = m[1]!
      if (!knownVars.has(tok)) found.add(tok)
    }
    return Array.from(found)
  })()

  // Template list filters — useful once you have the 20 seeded templates
  // plus your own clones. Categories come from the templates themselves.
  const [tplQ, setTplQ] = useState('')
  const [tplCat, setTplCat] = useState('')
  const categories = Array.from(new Set(templates.map((t) => t.category).filter(Boolean))).sort()
  const visibleTemplates = templates.filter((t) => {
    if (tplCat && t.category !== tplCat) return false
    if (tplQ.trim()) {
      const n = tplQ.toLowerCase()
      if (!(t.label || '').toLowerCase().includes(n) && !(t.key || '').toLowerCase().includes(n) && !(t.category || '').toLowerCase().includes(n)) return false
    }
    return true
  })

  return (
    <div className="grid gap-4 lg:grid-cols-[240px,minmax(0,1fr)]">
      {/* On mobile + tablet: dropdown picker. On desktop: full list rail. */}
      <aside>
        <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Your templates</div>
        <div className="mb-2 space-y-1.5">
          <Input value={tplQ} onChange={(e) => setTplQ(e.target.value)}
            placeholder="Search templates…" className="h-8 text-xs" />
          {categories.length > 0 ? (
            <select value={tplCat} onChange={(e) => setTplCat(e.target.value)}
              className="block w-full h-8 rounded-md border bg-background px-2 text-xs">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : null}
        </div>
        <select className="block w-full h-9 rounded-md border bg-background px-2 text-sm lg:hidden"
          value={pickedId ?? ''} onChange={(e) => {
            const t = templates.find((x) => x.id === Number(e.target.value))
            if (t) load(t)
          }}>
          {visibleTemplates.length === 0 ? <option value="">— no matches —</option> : null}
          {visibleTemplates.map((t) => (<option key={t.id} value={t.id}>{(t.active ? '★ ' : '') + (t.label || t.key)}</option>))}
        </select>
        <div className="hidden lg:block space-y-1">
          {templates.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
              None yet — fill in the form on the right and hit <strong>Save</strong> to create your first template.
            </p>
          ) : null}
          {templates.length > 0 && visibleTemplates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No templates match the filter.</p>
          ) : null}
          {visibleTemplates.map((t) => {
            const s = stats[t.id]
            return (
              <button key={t.id} onClick={() => load(t)}
                className={`flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent ${pickedId === t.id ? 'border-primary' : ''}`}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-medium">{t.label || t.key}</span>
                  {t.active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}
                </div>
                {/* 30-day stats. Suppressed when no sends yet — empty pill
                    row reads as "broken analytics" rather than "no data". */}
                {s && s.sent > 0 ? (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{s.sent} sent</span>
                    <span>·</span>
                    <span className="tabular-nums">{(s.openRate * 100).toFixed(0)}% open</span>
                    <span>·</span>
                    <span className="tabular-nums">{(s.replyRate * 100).toFixed(0)}% reply</span>
                  </div>
                ) : t.category ? (
                  <span className="text-[10px] text-muted-foreground">{t.category}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right region — tab strip + conditional pane. */}
      <div className="min-w-0 space-y-4">
        <Segmented<'edit' | 'generate'>
          ariaLabel="Template view"
          value={mode} onChange={setMode}
          options={[
            { value: 'edit',     label: 'Edit',         icon: Pencil },
            { value: 'generate', label: 'Generate (AI)', icon: Sparkles },
          ]}
        />

        {mode === 'generate' ? (
          <GenerateFromContext
            onAccept={(subject, html) => {
              // Hand off to the editor + switch back so the user can
              // tweak right away. Subject keeps its placeholder vars
              // intact since the prompt asks the model to prefer {{name}}.
              setDraft({ ...draft, subject, initialMsg: html })
              setMode('edit')
            }}
          />
        ) : (
        <div className="grid gap-4 lg:grid-cols-2 min-w-0">
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
          {/* Clickable insertion palette. Groups: per-recipient variables
              (substituted on send), HTML snippets (raw markup), and any
              user-declared custom fields (Settings → Custom contact fields).
              Click a chip → token lands at cursor of last-focused field. */}
          <div className="space-y-1.5 text-xs">
            {VAR_GROUPS.map((g) => (
              <div key={g.label} className="flex flex-wrap items-center gap-1">
                <span className="min-w-[80px] text-muted-foreground">{g.label}:</span>
                {g.vars.map((v) => (
                  <button
                    key={v.key} type="button"
                    onClick={() => insertVar(v.key, 'literal' in v ? v.literal : undefined)}
                    title={v.hint}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-accent"
                  >
                    {'literal' in v ? v.key : `{{${v.key}}}`}
                  </button>
                ))}
              </div>
            ))}
            {customFieldKeys.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="min-w-[80px] text-muted-foreground">Custom:</span>
                {customFieldKeys.map((k) => (
                  <button key={k} type="button" onClick={() => insertVar(k)}
                    title={`Custom field ${k} — set per-contact in Contacts`}
                    className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary hover:bg-primary/20">
                    {`{{${k}}}`}
                  </button>
                ))}
              </div>
            ) : null}
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
          {pickedId ? (
            <Button variant="outline" disabled={pending} onClick={() => start(async () => {
              const r = await cloneTemplateAction(pickedId)
              if ('error' in r && r.error) { toast.error(r.error); return }
              toast.success(`Cloned as "${(r as { key?: string }).key ?? 'copy'}"`)
              router.refresh()
            })}>
              <Copy className="mr-1.5 h-4 w-4" /> Clone
            </Button>
          ) : null}
          {/* Test-send — fires the current editor state to your own
              address with sample data so you catch broken HTML / variable
              typos before mass-send. Rate-limited 6/min server-side. */}
          <Button variant="outline" disabled={pending || !draft.subject || !draft.initialMsg}
            title="Send a personalized test to your own address"
            onClick={() => start(async () => {
              const r = await sendTemplateTestAction({
                subject: draft.subject ?? '',
                initialMsg: draft.initialMsg ?? '',
              })
              if ('error' in r && r.error) { toast.error(r.error); return }
              if ('to' in r) toast.success(`Test sent to ${r.to}`)
            })}>
            <Send className="mr-1.5 h-4 w-4" /> Test send
          </Button>
        </div>

        {/* Variable validator — silent when everything matches; loud
            warning when the editor contains {{foo}} that isn't a built-in
            variable or one of the user's declared custom fields. */}
        {unknownVars.length > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <div>
                <strong>Unknown variable{unknownVars.length === 1 ? '' : 's'}:</strong>{' '}
                {unknownVars.map((v) => <code key={v} className="mx-0.5 rounded bg-amber-500/20 px-1 py-0.5 font-mono">{`{{${v}}}`}</code>)}
              </div>
              <div className="opacity-80">
                These won&apos;t substitute on send — recipients see them literally. Fix typos or declare them in <a href="/settings" className="underline">Settings → Custom fields</a>.
              </div>
            </div>
          </div>
        ) : null}

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
            <div className="grid gap-1">
              <Label htmlFor="ai-length" className="text-xs">Length</Label>
              <select id="ai-length" value={aiLength} onChange={(e) => setAiLength(e.target.value as Length)}
                className="h-8 rounded-md border bg-background px-2 text-sm capitalize">
                {LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ai-cta" className="text-xs">CTA</Label>
              <select id="ai-cta" value={aiCta} onChange={(e) => setAiCta(e.target.value as Cta)}
                className="h-8 rounded-md border bg-background px-2 text-sm capitalize">
                {CTAS.map((c) => <option key={c} value={c}>{c}</option>)}
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
                existing: draft.initialMsg ?? '', tone, length: aiLength, cta: aiCta,
              })
              if ('error' in r && r.error) { toast.error(r.error); return }
              if ('html' in r && r.html) { setDraft({ ...draft, initialMsg: r.html }); toast.success(`Rewrote in ${tone} tone`) }
            })}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Improve
            </Button>
            <Button variant="outline" size="sm" disabled={pending || !aiGoal} onClick={() => start(async () => {
              const r = await aiDraftAction({ goal: aiGoal, tone, length: aiLength, cta: aiCta })
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
        )}
      </div>
    </div>
  )
}
