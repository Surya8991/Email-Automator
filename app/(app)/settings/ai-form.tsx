'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clearAiAction, saveAiAction } from '@/server/actions/credentials'

interface Props {
  initial: { GROQ_API_KEY?: string; GROQ_MODEL?: string }
  source: 'user' | 'env' | 'none'
  // True when an encrypted API key already exists server-side. Form shows
  // the placeholder and lets the user save other fields without re-typing.
  keySaved?: boolean
}

const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
] as const

export function AiForm({ initial, source, keySaved = false }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [show, setShow] = useState(false)
  const [s, setS] = useState({
    GROQ_API_KEY: initial.GROQ_API_KEY ?? '',
    GROQ_MODEL: initial.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  })
  const set = (k: keyof typeof s) => (v: string) => setS((x) => ({ ...x, [k]: v }))

  return (
    <form className="grid gap-4 sm:grid-cols-2" action={() => start(async () => {
      // Same "leave blank to keep current" pattern as SmtpForm — omit
      // the key field when blank and a saved one exists.
      const payload = { ...s }
      if (keySaved && !s.GROQ_API_KEY) delete (payload as Partial<typeof s>).GROQ_API_KEY
      const r = await saveAiAction(payload as typeof s)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Groq key saved')
      router.refresh()
    })}>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="GROQ_API_KEY">Groq API key</Label>
        <div className="relative">
          <Input id="GROQ_API_KEY" type={show ? 'text' : 'password'} autoComplete="off"
            value={s.GROQ_API_KEY} onChange={(e) => set('GROQ_API_KEY')(e.target.value)}
            placeholder={keySaved ? '••••••• (saved — leave blank to keep)' : 'gsk_…'} />
          <button type="button" onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" aria-label="Toggle visibility">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Get a free key at <a className="underline" href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a>. Free tier covers light usage.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="GROQ_MODEL">Model</Label>
        <select id="GROQ_MODEL" value={s.GROQ_MODEL} onChange={(e) => set('GROQ_MODEL')(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm">
          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}><Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : 'Save'}</Button>
        {source === 'user' ? (
          <Button type="button" variant="ghost" className="ml-auto text-destructive" disabled={pending}
            onClick={() => start(async () => {
              await clearAiAction(); toast('Cleared'); router.refresh()
            })}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        ) : null}
      </div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">
        Currently using: <code className="rounded bg-muted px-1.5 py-0.5">{source === 'user' ? 'your per-user key' : source === 'env' ? '.env (process)' : 'nothing — AI Improve disabled'}</code>
      </p>
    </form>
  )
}
