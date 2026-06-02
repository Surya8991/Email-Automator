'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createKeyAction, revokeKeyAction } from '@/server/actions/api-keys'
import { useFormatDate } from '@/components/timezone-provider'

type Scope = 'read:contacts' | 'write:contacts'
const ALL_SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: 'read:contacts', label: 'Read contacts', hint: 'GET /api/v1/contacts' },
  { value: 'write:contacts', label: 'Write contacts', hint: 'POST /api/v1/contacts' },
]

interface Row {
  id: number; name: string; prefix: string; scopes: string
  lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date
}

export function ApiKeysForm({ rows }: { rows: Row[] }) {
  const formatDate = useFormatDate()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<Scope>>(new Set<Scope>(['read:contacts', 'write:contacts']))
  // Plaintext key shown ONCE right after creation, then forgotten.
  const [revealed, setRevealed] = useState<{ raw: string; name: string; scopes: string } | null>(null)

  function toggleScope(s: Scope) {
    const next = new Set(scopes)
    if (next.has(s)) next.delete(s); else next.add(s)
    setScopes(next)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5 flex-1 min-w-[200px]">
            <Label htmlFor="key-name">Name for this key</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zapier integration" />
          </div>
          <Button disabled={pending || !name || scopes.size === 0} onClick={() => start(async () => {
            const r = await createKeyAction({ name, scopes: Array.from(scopes) })
            if ('error' in r && r.error) { toast.error(r.error); return }
            if ('raw' in r && r.raw && r.name) {
              setRevealed({ raw: r.raw, name: r.name, scopes: r.scopes ?? '' }); setName(''); router.refresh()
            }
          })}>
            <Plus className="mr-1.5 h-4 w-4" /> Create key
          </Button>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase text-muted-foreground">Scopes</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            {ALL_SCOPES.map((s) => (
              <label key={s.value} className="inline-flex items-start gap-2 rounded-md border bg-background px-2 py-1.5">
                <input type="checkbox" checked={scopes.has(s.value)} onChange={() => toggleScope(s.value)} />
                <span>
                  <span className="block">{s.label}</span>
                  <span className="block text-[11px] font-mono text-muted-foreground">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {scopes.size === 0 ? <p className="text-xs text-destructive">Pick at least one scope.</p> : null}
        </div>
      </div>

      {revealed ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-primary" /> Your new key — copy it now, it's shown only this once
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{revealed.raw}</code>
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(revealed.raw); toast.success('Copied')
            }}><Copy className="h-3 w-3" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>Dismiss</Button>
          </div>
          <p className="text-xs text-muted-foreground">Scopes: <code>{revealed.scopes || 'all (legacy)'}</code></p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys yet. Create one to authenticate against <code>/api/v1/*</code>.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-1">Name</th>
              <th className="p-1">Prefix</th>
              <th className="p-1">Scopes</th>
              <th className="p-1">Last used</th>
              <th className="p-1">Created</th>
              <th className="p-1">Status</th>
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="p-1">{k.name}</td>
                <td className="p-1 font-mono text-xs text-muted-foreground">{k.prefix}…</td>
                <td className="p-1 text-xs text-muted-foreground">{k.scopes || <span title="No scopes recorded — legacy key, has full access">all (legacy)</span>}</td>
                <td className="p-1 text-xs text-muted-foreground">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'never'}</td>
                <td className="p-1 text-xs text-muted-foreground">{formatDate(k.createdAt)}</td>
                <td className="p-1">
                  {k.revokedAt
                    ? <span className="rounded bg-muted px-1.5 py-0.5 text-xs">revoked</span>
                    : <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-600">active</span>}
                </td>
                <td className="p-1 text-right">
                  {k.revokedAt ? null : (
                    <Button variant="ghost" size="icon" aria-label="Revoke" disabled={pending}
                      onClick={() => {
                        if (!confirm(`Revoke "${k.name}"? Anything using this key will get 401.`)) return
                        start(async () => { await revokeKeyAction(k.id); toast('Revoked'); router.refresh() })
                      }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Using your API key</summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>Pass it as a Bearer token on requests to <code>/api/v1/*</code>. The route checks each call against your key's scopes — a key without <code>write:contacts</code> gets 403 on a POST.</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs font-mono text-foreground">{`curl -H "Authorization: Bearer ea_..." \\
  https://your-app.vercel.app/api/v1/contacts

curl -H "Authorization: Bearer ea_..." \\
  -H "Content-Type: application/json" \\
  -d '{"recruiterEmail":"jane@acme.com","recruiterName":"Jane","company":"Acme"}' \\
  https://your-app.vercel.app/api/v1/contacts`}</pre>
          <p>Rate limit: 120 GET / 60 POST per minute per user.</p>
        </div>
      </details>
    </div>
  )
}
