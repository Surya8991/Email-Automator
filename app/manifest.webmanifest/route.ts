// PWA manifest. Served at /manifest.webmanifest by Next's route handler
// so we don't ship a static file (lets us swap colors / icon paths via
// code if needed without a redeploy).
//
// Icons reference the existing /icon.svg until we ship dedicated PNG
// 192/512 assets — Chrome accepts SVG for maskable but the PWA install
// prompt may show a placeholder until PNG icons exist. Add later.

export function GET() {
  const body = {
    name: 'Email Automator',
    short_name: 'EA',
    description: 'Send personalized outreach at scale — safely.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b0f17',
    theme_color: '#6366f1',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Drafts',     url: '/drafts',     short_name: 'Drafts' },
      { name: 'Contacts',   url: '/contacts',   short_name: 'Contacts' },
      { name: 'Campaigns',  url: '/campaigns',  short_name: 'Campaigns' },
    ],
  }
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // Cache aggressively — operators don't change the manifest often.
      // PWA installers re-fetch on install anyway.
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
