'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DevSignInButton({ email }: { email: string }) {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null)
            const r = await fetch('/api/dev-signin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            })
            const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; redirect?: string }
            if (!r.ok || !body.ok) {
              setErr(body.error ?? `Sign-in failed (${r.status})`)
              return
            }
            router.push(body.redirect ?? '/dashboard')
            router.refresh()
          })
        }
      >
        <Sparkles className="mr-1.5 h-4 w-4" />
        {pending ? 'Signing in…' : `Sign in as ${email} (dev)`}
      </Button>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  )
}
