'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'

/**
 * Sticky "Go to top" button.
 *
 * Attaches a scroll listener to the nearest scrollable ancestor (the app's
 * <main> element). Appears after the user scrolls 400 px and smoothly
 * scrolls back to the top when clicked.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)
  const scrollEl = useRef<Element | null>(null)

  useEffect(() => {
    // Walk up from <body> to find the first scrollable ancestor that the
    // layout's <main> actually creates. Falls back to window.
    const el =
      document.querySelector('main.flex-1.overflow-auto') ??
      document.querySelector('main') ??
      null
    scrollEl.current = el

    function onScroll() {
      const top = el ? el.scrollTop : window.scrollY
      setVisible(top > 400)
    }

    const target = el ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => {
        if (scrollEl.current) {
          scrollEl.current.scrollTo({ top: 0, behavior: 'smooth' })
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }}
      className="fixed bottom-20 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border bg-background/90 shadow-md backdrop-blur ea-transition hover:bg-accent hover:text-accent-foreground md:bottom-6 md:right-6"
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  )
}
