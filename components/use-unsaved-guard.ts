'use client'
import { useEffect } from 'react'

// Generic unsaved-changes guard: when `dirty` is true, intercept
// browser back / reload / tab close with a native confirm. Doesn't
// guard against client-side route changes (Next.js router transitions)
// because Next 15+ removed the unstable navigation event; instead,
// callers can pair this with a confirm-on-Link-click if they need
// route-change guarding.
//
// Used in the template editor + future inline-edit surfaces. The
// pattern (and original logic) was lifted from the profile-form
// guard so all editors behave the same.

export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      // Modern browsers ignore the custom message but still show the
      // generic "Reload site?" / "Leave site?" prompt when returnValue
      // is set. Safari requires preventDefault() in addition.
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
