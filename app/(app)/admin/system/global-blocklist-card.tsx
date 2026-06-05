'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { addGlobalBlockAction, removeGlobalBlockAction } from '@/server/actions/admin'

interface Row { id: number; pattern: string; type: 'email' | 'domain' | string; createdAt: Date | string }

export function GlobalBlocklistCard({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [pattern, setPattern] = useState('')
  const [type, setType] = useState<'email' | 'domain'>('email')
  const [err, setErr] = useState<string | null>(null)

  function add() {
    if (!pattern.trim()) return
    start(async () => {
      setErr(null)
      const r = await addGlobalBlockAction(pattern.trim(), type)
      if ('error' in r) { setErr(r.error ?? 'Failed'); return }
      setPattern('')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldOff className="h-4 w-4" /> Global blocklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Global entries apply to <strong>every user</strong>. Per-user blocklists are managed by each user from{' '}
          <code>/blocklist</code>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)}
            placeholder={type === 'email' ? 'name@example.com' : 'example.com'}
            className="h-8 max-w-xs" />
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
            className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="email">Email</option>
            <option value="domain">Domain</option>
          </select>
          <Button size="sm" disabled={pending || !pattern.trim()} onClick={add}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
          {err && <span className="text-xs text-destructive">{err}</span>}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No global blocklist entries.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                <span className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{r.type}</span>
                  <span className="font-mono text-xs">{r.pattern}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label="Remove" disabled={pending}
                  onClick={() => start(async () => {
                    setErr(null)
                    const res = await removeGlobalBlockAction(r.id)
                    if ('error' in res) { setErr(res.error ?? 'Failed'); return }
                    router.refresh()
                  })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
