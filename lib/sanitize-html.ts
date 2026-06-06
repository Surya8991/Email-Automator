// Client-only HTML sanitizer wrapper used wherever we render
// `dangerouslySetInnerHTML`. Returns the input unchanged during SSR
// (DOMPurify needs `window`); pair every render site with
// `suppressHydrationWarning` to handle the server/client mismatch.
'use client'
import DOMPurify from 'dompurify'

export function purify(html: string): string {
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html)
}
