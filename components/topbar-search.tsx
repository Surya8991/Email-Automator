'use client'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

// Persistent search "field" in the topbar that triggers the existing
// ⌘K command palette. It's not a real input, clicking it dispatches
// the same keydown the shortcut listens for (Ctrl/Cmd+K). Keeps the
// palette as single source of truth for search logic.
//
// Hidden on small screens to give the topbar room for the user menu.

export function TopbarSearch() {
  // Detect OS for the ⌘ vs Ctrl hint. Avoids a hydration mismatch by
  // resolving client-side after mount.
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.userAgent))
  }, [])

  function open() {
    // Dispatch the same shortcut the palette listens for. This re-uses
    // the palette's open logic and stays consistent with the
    // keyboard path.
    const evt = new KeyboardEvent('keydown', {
      key: 'k', code: 'KeyK',
      metaKey: true, ctrlKey: true,
      bubbles: true, cancelable: true,
    })
    window.dispatchEvent(evt)
  }

  return (
    <button
      type="button" onClick={open}
      aria-label="Open command palette"
      className="hidden h-9 min-w-[14rem] items-center gap-2 rounded-md border bg-card/70 px-3 text-xs text-muted-foreground ea-transition hover:bg-card hover:text-foreground sm:inline-flex"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search, jump anywhere</span>
      <kbd className="ml-2 rounded border bg-background px-1 font-mono text-[10px]">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  )
}
