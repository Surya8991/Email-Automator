'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Wand2, Link as LinkIcon, FileText, MessageSquare, Sparkles, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aiGenerateAction } from '@/server/actions/ai'
import { cn } from '@/lib/utils'
import { purify } from '@/lib/sanitize-html'

// New "Generate" pane on Templates: paste a Job Description / LinkedIn
// post / URL / free-form text and get back a subject + body draft. The
// brief sits next to the result so you can refine + regenerate without
// losing context. Accept lifts the draft into the editor (caller
// handles the lift via onAccept).

type Kind = 'jd' | 'post' | 'url' | 'text'
type Length = 'short' | 'medium' | 'long'
type Cta = 'none' | 'soft' | 'direct'

const KIND_META: Record<Kind, { label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string }> = {
  jd:   { label: 'Job description', icon: FileText,       placeholder: 'Paste the full JD — title, requirements, company blurb. The more, the better.' },
  post: { label: 'Post / content',  icon: MessageSquare,  placeholder: 'Paste a LinkedIn / X / blog post body so the AI can react to its substance instead of saying "I saw your post".' },
  url:  { label: 'URL',             icon: LinkIcon,       placeholder: 'https://… — only https in production; private IPs blocked. We fetch and extract the page text server-side.' },
  text: { label: 'Free text',       icon: FileText,       placeholder: 'Anything — a brief, a paragraph about the role, a few bullet points the email should hit.' },
}

const LENGTHS: Length[] = ['short', 'medium', 'long']
const CTAS: Cta[] = ['none', 'soft', 'direct']

export function GenerateFromContext({
  onAccept,
}: {
  /** Caller receives the accepted subject + html and lifts it into the editor. */
  onAccept: (subject: string, html: string) => void
}) {
  const [kind, setKind] = useState<Kind>('jd')
  const [input, setInput] = useState('')
  const [goal, setGoal] = useState('')
  const [recName, setRecName] = useState('')
  const [recRole, setRecRole] = useState('')
  const [recCompany, setRecCompany] = useState('')
  const [length, setLength] = useState<Length>('medium')
  const [cta, setCta] = useState<Cta>('soft')
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState<{ subject: string; html: string; reasoning: string; fromUrl?: boolean } | null>(null)

  function generate() {
    if (!input.trim()) { toast.error('Paste something to generate from'); return }
    start(async () => {
      const r = await aiGenerateAction({
        kind, input,
        recipient: (recName || recRole || recCompany) ? {
          name: recName || undefined,
          role: recRole || undefined,
          company: recCompany || undefined,
        } : undefined,
        length, cta,
        goal: goal.trim() || undefined,
      })
      if ('error' in r && r.error) { toast.error(r.error); return }
      if ('draft' in r && r.draft) setDraft(r.draft)
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Left: the brief ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(KIND_META) as Array<[Kind, typeof KIND_META[Kind]]>).map(([k, meta]) => {
              const Icon = meta.icon
              const on = kind === k
              return (
                <button
                  key={k} type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={on}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ea-transition',
                    on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="gen-input" className="text-xs">Paste / type here</Label>
          {kind === 'url' ? (
            <Input
              id="gen-input"
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={KIND_META[kind].placeholder} type="url"
            />
          ) : (
            <textarea
              id="gen-input"
              value={input} onChange={(e) => setInput(e.target.value)}
              rows={10}
              placeholder={KIND_META[kind].placeholder}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="gen-goal" className="text-xs">Goal (optional)</Label>
          <Input
            id="gen-goal" value={goal} onChange={(e) => setGoal(e.target.value)}
            placeholder='e.g. "introduce myself and ask for a 15-min chat"'
          />
        </div>

        <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs" open>
          <summary className="cursor-pointer font-medium">Recipient context (optional, increases accuracy)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Input value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="Name" aria-label="Recipient name" />
            <Input value={recRole} onChange={(e) => setRecRole(e.target.value)} placeholder="Role" aria-label="Recipient role" />
            <Input value={recCompany} onChange={(e) => setRecCompany(e.target.value)} placeholder="Company" aria-label="Recipient company" />
          </div>
        </details>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Length</Label>
            <div className="flex gap-1">
              {LENGTHS.map((l) => (
                <button
                  key={l} type="button" onClick={() => setLength(l)}
                  className={cn('rounded-md border px-2 py-1 text-xs capitalize ea-transition', length === l ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}
                >{l}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">CTA</Label>
            <div className="flex gap-1">
              {CTAS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCta(c)}
                  className={cn('rounded-md border px-2 py-1 text-xs capitalize ea-transition', cta === c ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}
                >{c}</button>
              ))}
            </div>
          </div>
          <Button onClick={generate} disabled={pending || !input.trim()} className="ml-auto">
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            {draft ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </div>

      {/* ── Right: the result ───────────────────────────────────── */}
      <div className="space-y-2 rounded-md border bg-card/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> AI draft
          </div>
          {draft ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} title="Discard">
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={() => { onAccept(draft.subject, draft.html); toast.success('Loaded into the editor') }}>
                <Check className="mr-1 h-3.5 w-3.5" /> Accept into editor
              </Button>
            </div>
          ) : null}
        </div>
        {draft ? (
          <div className="space-y-2 text-sm">
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Subject</div>
              <div className="rounded-md border bg-background px-3 py-2 font-medium">{draft.subject}</div>
            </div>
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Body preview</div>
              <div
                className="prose prose-sm dark:prose-invert max-h-96 max-w-none overflow-auto rounded-md border bg-background px-3 py-2"
                suppressHydrationWarning
                dangerouslySetInnerHTML={{ __html: purify(draft.html) }}
              />
            </div>
            {draft.reasoning ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">What the AI assumed:</strong> {draft.reasoning}
              </div>
            ) : null}
            {draft.fromUrl ? (
              <p className="text-[11px] text-muted-foreground">Drafted from fetched URL content. We strip HTML before passing to the AI.</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-1.5 px-1 py-8 text-center text-xs text-muted-foreground">
            <Sparkles className="mx-auto h-5 w-5 opacity-50" />
            <p>Pick a source, paste your content, then hit <em>Generate</em>.</p>
            <p>The longer + more specific your source + recipient context, the better the draft.</p>
          </div>
        )}
      </div>
    </div>
  )
}
