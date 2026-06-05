'use client'
import { useEffect } from 'react'

// Per-user accent colors. Stored in user_settings as `ACCENT` (one of
// the keys below) and applied at SSR via this client component —
// flicker-free because the layout already knows the value.
//
// Each accent overrides the indigo `--primary` for both light and dark
// modes. We swap only the chromatic hue; saturation/lightness stay
// close to the design system so contrast vs the surface stays usable.

export const ACCENTS = {
  indigo:  { light: '237 89% 60%', dark: '237 89% 70%', label: 'Indigo (default)', hex: '#6366f1' },
  emerald: { light: '160 84% 39%', dark: '158 64% 52%', label: 'Emerald',          hex: '#10b981' },
  rose:    { light: '347 77% 50%', dark: '349 89% 60%', label: 'Rose',             hex: '#e11d48' },
  amber:   { light: '38 92% 50%',  dark: '38 100% 60%', label: 'Amber',            hex: '#f59e0b' },
  violet:  { light: '262 83% 58%', dark: '263 90% 70%', label: 'Violet',           hex: '#8b5cf6' },
} as const

export type AccentKey = keyof typeof ACCENTS

export function isValidAccent(v: string): v is AccentKey {
  return v in ACCENTS
}

/**
 * Injects a <style> tag with the user's accent. Mounted once in the
 * app layout. Empty `accent` = no override (default indigo applies).
 *
 * We override `--primary` in both `:root` and `.dark` so the same
 * accent works across themes without needing per-theme entries in the
 * user setting.
 */
export function AccentProvider({ accent }: { accent: string }) {
  // Validate then write — invalid value silently no-ops so a stale
  // setting from before an accent was renamed doesn't break the page.
  useEffect(() => {
    // Nothing to do here — the <style> below renders on the server too
    // so first paint is correct. This client hook exists only to
    // future-proof: if we add a "preview while picking" mode in
    // /profile, it'll set document.documentElement.style directly.
  }, [accent])

  if (!accent || !isValidAccent(accent)) return null
  const cfg = ACCENTS[accent]
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `:root { --primary: ${cfg.light} !important; }\n.dark { --primary: ${cfg.dark} !important; }`,
      }}
    />
  )
}
