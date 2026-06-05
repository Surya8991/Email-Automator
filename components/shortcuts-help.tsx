'use client'
import { useEffect, useState } from 'react'
import { Keyboard, Search, Send, FileText, Sparkles } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface Shortcut { keys: string[]; desc: string; group?: string }

// Single source of truth for all keyboard shortcuts in the app. Open
// via `?` from anywhere (suppressed when the user is typing in an
// input/textarea/contenteditable, see useEffect below).
const SHORTCUTS: Shortcut[] = [
  // Global
  { keys: ['⌘/Ctrl', 'K'], desc: 'Open command palette (jump or search)', group: 'Global' },
  { keys: ['?'],            desc: 'Show this shortcut help', group: 'Global' },
  { keys: ['Esc'],          desc: 'Close palette, dialog, or focused popover', group: 'Global' },

  // Palette
  { keys: ['↑', '↓'],       desc: 'Move highlight', group: 'Command palette' },
  { keys: ['↵'],            desc: 'Open the highlighted item', group: 'Command palette' },
  { keys: ['Type'],         desc: 'Search contacts / templates / drafts / campaigns by name + email', group: 'Command palette' },

  // Rich-text editor
  { keys: ['⌘/Ctrl', 'B'],  desc: 'Bold', group: 'Editor' },
  { keys: ['⌘/Ctrl', 'I'],  desc: 'Italic', group: 'Editor' },
  { keys: ['⌘/Ctrl', 'K'],  desc: 'Link selection', group: 'Editor' },

  // Forms, most table pages support these
  { keys: ['/'],            desc: 'Focus the page search input (where present)', group: 'Forms' },
]

const GROUPS = ['Global', 'Command palette', 'Editor', 'Forms'] as const

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Suppress when typing, `?` shifts to `Shift+/` on most layouts and
    // we don't want to steal a slash from someone composing an email.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      // Also bail when a modal is open, Esc-to-close is the right
      // escape hatch, not a stacked help dialog.
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Faster than the mouse, especially the command palette. Press <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">?</kbd> from anywhere to see this list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {GROUPS.map((g) => {
            const items = SHORTCUTS.filter((s) => s.group === g)
            if (items.length === 0) return null
            return (
              <div key={g}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
                <div className="grid gap-y-1.5 grid-cols-[auto_1fr] gap-x-4 text-sm">
                  {items.map((s, i) => (
                    <KeyRow key={i} keys={s.keys} desc={s.desc} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            The palette searches your data too, try typing a recipient name or template label.
          </p>
          <p className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Looking for AI? Templates and Drafts both have <em>Improve</em> + tone picker.
          </p>
          <p className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            <em>Send all</em> and <em>Send selected</em> now show a recipient preview before SMTP fires.
          </p>
          <p className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Full feature reference is in the <a href="/guide" className="underline">User guide</a>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KeyRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono">{k}</kbd>
            {i < keys.length - 1 ? <span className="text-muted-foreground">+</span> : null}
          </span>
        ))}
      </div>
      <span className="text-muted-foreground">{desc}</span>
    </>
  )
}
