'use client'
import { useEffect, useRef } from 'react'

// Cmd+S / Ctrl+S to save in editor pages. We attach a window-level
// keydown listener and call back to the caller. preventDefault stops
// the browser's "Save Page As" dialog.
//
// Suppressed when:
//   - `enabled` is false (e.g. while a pending request is in-flight)
//   - The focused element is a text input INSIDE a dialog (we don't
//     want Cmd+S to fire from a modal form)
//
// Pair with useUnsavedGuard for the "warn before leaving" half of the
// editor pattern.

export function useSaveShortcut(onSave: () => void, enabled = true) {
  // Latest callback ref so the listener doesn't re-attach on every render.
  const cbRef = useRef(onSave)
  useEffect(() => { cbRef.current = onSave }, [onSave])

  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd || e.key.toLowerCase() !== 's') return
      // Skip when inside a dialog so modal forms don't co-opt save.
      const t = e.target as HTMLElement | null
      if (t?.closest('[role="dialog"]')) return
      e.preventDefault()
      cbRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/**
 * Cmd+Enter / Ctrl+Enter to fire a send / submit action. Used for
 * "Send this draft now" when the user is focused inside the draft's
 * edit body. Same dialog-suppression rules.
 */
export function useSendShortcut(onSend: () => void, enabled = true) {
  const cbRef = useRef(onSend)
  useEffect(() => { cbRef.current = onSend }, [onSend])

  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd || e.key !== 'Enter') return
      const t = e.target as HTMLElement | null
      if (t?.closest('[role="dialog"]')) return
      e.preventDefault()
      cbRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
