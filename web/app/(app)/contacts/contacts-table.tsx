'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Trash2, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Contact } from '@/server/db/schema'
import { deleteContactAction, deleteContactsBulkAction } from '@/server/actions/contacts'

export function ContactsTable({ rows, page, pages, search }: { rows: Contact[]; page: number; pages: number; search: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [q, setQ] = useState(search)

  function go(updates: Record<string, string>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) v ? next.set(k, v) : next.delete(k)
    router.push(`?${next.toString()}`)
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go({ search: q, page: '1' })}
            placeholder="Search by name, company, email…" className="pl-8" />
        </div>
        {selected.size > 0 ? (
          <Button variant="destructive" size="sm" disabled={pending} onClick={() => {
            const ids = Array.from(selected)
            start(async () => { await deleteContactsBulkAction(ids); setSelected(new Set()); router.refresh() })
          }}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete {selected.size}
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          No contacts yet. Add one above or import a CSV from <Link className="underline" href="/contacts/import">/contacts/import</Link>.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Select ${c.recruiterEmail}`}
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        const n = new Set(selected)
                        e.target.checked ? n.add(c.id) : n.delete(c.id)
                        setSelected(n)
                      }} />
                  </td>
                  <td className="px-3 py-2">{c.recruiterName || '—'}</td>
                  <td className="px-3 py-2">{c.company || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.jobTitle || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.recruiterEmail}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.emailStatus || 'Pending'}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" aria-label="Delete contact" disabled={pending}
                      onClick={() => start(async () => { await deleteContactAction(c.id); router.refresh() })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">Page {page} of {pages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
