import { NextResponse, type NextRequest } from 'next/server'

// CSP nonce infrastructure — currently OPT-IN via CSP_NONCE=true env var.
// When enabled, middleware:
//   1. Generates a cryptographically random nonce per request.
//   2. Writes it to the `x-nonce` request header so RSC/layouts can read
//      it via next/headers and pass it to <Script nonce={…}> tags.
//   3. Sets a strict CSP that requires nonce-bearing scripts (replaces
//      `'unsafe-inline'`) using `strict-dynamic` for chain-of-trust.
//
// Why opt-in: enabling it without first wiring every inline script to
// carry the nonce (Next.js's own hydration shim, Recharts, sonner toast
// styles, etc.) will refuse to execute and the app will white-screen.
// The next.config.mjs CSP keeps the current (working) policy as the
// default; this middleware adds the nonce-CSP path for operators who
// want to invest the time to make every inline script nonced.
//
// Set CSP_NONCE=true once the app's inline-script audit is done.
export function middleware(req: NextRequest) {
  if (process.env.CSP_NONCE !== 'true') return NextResponse.next()

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // Tailwind JIT still injects inline styles.
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')

  // Make the nonce available to RSC/layouts via a request header.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Content-Security-Policy', csp)
  }
  return res
}

export const config = {
  // Skip Next.js's static assets and the tracking-pixel route so their
  // GIF/redirect responses don't get CSP applied unnecessarily.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/track).*)',
  ],
}
