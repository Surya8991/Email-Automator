'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Shield, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteUserAction } from '@/server/actions/admin'
import { useFormatDate } from '@/components/timezone-provider'

interface Row {
  id: string; email: string; name: string; createdAt: string
  isAdmin: boolean; isMe: boolean
  contacts: number; drafts: number; events: number
}

export function AdminTable({ rows }: { rows: Row[] }) {
  const formatDate = useFormatDate()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <>
      {err ? <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</p> : null}
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Contacts</th>
            <th className="px-3 py-2">Drafts</th>
            <th className="px-3 py-2">Events</th>
            <th className="px-3 py-2">Joined</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5">
                  {r.isAdmin ? <Shield className="h-3 w-3 text-amber-500" /> : <User className="h-3 w-3 text-muted-foreground" />}
                  {r.email}
                  {r.isMe ? <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">you</span> : null}
                </span>
              </td>
              <td className="px-3 py-2">{r.name || '—'}</td>
              <td className="px-3 py-2">{r.contacts}</td>
              <td className="px-3 py-2">{r.drafts}</td>
              <td className="px-3 py-2">{r.events}</td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-2 text-right">
                {r.isMe || r.isAdmin ? (
                  <span className="text-xs text-muted-foreground">read-only</span>
                ) : (
                  <Button variant="ghost" size="icon" aria-label="Delete user" disabled={pending}
                    onClick={() => {
                      if (!confirm(`Delete ${r.email}? Their contacts/templates/drafts/sessions/events all go too.`)) return
                      start(async () => {
                        setErr(null)
                        const res = await deleteUserAction(r.id)
                        if ('error' in res && res.error) setErr(res.error)
                        router.refresh()
                      })
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
