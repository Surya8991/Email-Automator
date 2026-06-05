'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { BookmarkPlus, Bookmark, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSavedViewAction, deleteSavedViewAction } from '@/server/actions/saved-views'

// Saved-views bar on /contacts. Renders chips for the user's saved
// filter combos + a "Save view" trigger that captures the current
// URLSearchParams.

interface View { id: number; name: string; filters: string }

export function SavedViewsBar({ views }: { views: View[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [pending, start] = useTransition()

  function applyView(filters: string) {
    let parsed: Record<string, string> = {}
    try { parsed = JSON.parse(filters) } catch { /* corrupt blob — ignore */ }
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v) next.set(k, v)
    }
    // Always reset to page 1 when switching views — the previous page
    // index is meaningless under a different filter set.
    next.delete('page')
    router.push(`/contacts?${next.toString()}`)
  }

  function save() {
    if (!name.trim()) { toast.error('Name required'); return }
    // Snapshot only the filter keys (not page/pageSize/etc).
    const filters: Record<string, string> = {}
    const KEYS = ['search', 'tag', 'status', 'company', 'location', 'platform']
    for (const k of KEYS) {
      const v = sp.get(k)
      if (v) filters[k] = v
    }
    start(async () => {
      const r = await createSavedViewAction({ name: name.trim(), filters })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(`Saved view "${name.trim()}"`)
      setName(''); setCreating(false)
      router.refresh()
    })
  }

  function remove(id: number) {
    if (!confirm('Delete this saved view?')) return
    start(async () => {
      await deleteSavedViewAction(id)
      router.refresh()
    })
  }

  if (views.length === 0 && !creating) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Bookmark className="h-3.5 w-3.5" />
        <span>No saved views yet.</span>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Save current view
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs">
          <button
            type="button"
            onClick={() => applyView(v.filters)}
            className="font-medium hover:text-primary"
            title="Apply this view"
          >
            {v.name}
          </button>
          <button
            type="button"
            onClick={() => remove(v.id)}
            aria-label={`Delete saved view ${v.name}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            disabled={pending}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {creating ? (
        <div className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              else if (e.key === 'Escape') { setCreating(false); setName('') }
            }}
            placeholder='Name this view…'
            className="h-7 w-44 text-xs"
            aria-label="Saved view name"
          />
          <Button size="sm" onClick={save} disabled={pending || !name.trim()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setName('') }}>Cancel</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Save current view
        </Button>
      )}
    </div>
  )
}
