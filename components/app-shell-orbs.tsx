// Background polish — two soft gradient orbs behind the entire app
// shell. CSS-only via .ea-shell-orbs in globals.css. Mounted once at
// the (app) layout level so it lives behind every page without per-
// page work. Respects prefers-reduced-motion (the orbs are static, but
// any pulsing class added in future would inherit the global guard).

export function AppShellOrbs() {
  return <div className="ea-shell-orbs" aria-hidden />
}
