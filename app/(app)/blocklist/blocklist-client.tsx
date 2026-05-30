'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addBlocklistAction, removeBlocklistAction } from '@/server/actions/blocklist'
import { formatDate } from '@/lib/utils'

interface Row { id: number; userId: string | null; pattern: string; type: string; createdAt: Date }

export function BlocklistClient({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pattern, setPattern] = useState('')
  const [type, setType] = useState<'email' | 'domain'>('email')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="email@example.com or example.com" className="max-w-sm" />
        <select value={type} onChange={(e) => setType(e.target.value as 'email' | 'domain')}
          className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="email">Email</option>
          <option value="domain">Domain</option>
        </select>
        <Button disabled={pending || !pattern} onClick={() => start(async () => {
          setErr(null)
          const r = await addBlocklistAction({ pattern, type })
          if ('error' in r && r.error) { setErr(r.error); return }
          setPattern(''); router.refresh()
        })}>Block</Button>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">No blocked patterns yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pattern</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Added</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{r.pattern}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.userId === null ? 'global' : 'you'}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  {r.userId !== null ? (
                    <Button variant="ghost" size="icon" aria-label="Remove" disabled={pending}
                      onClick={() => start(async () => { await removeBlocklistAction(r.id); router.refresh() })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
