/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone output is required for some hosts and shrinks the deploy
  // bundle. Vercel ignores this flag (uses its own runtime), but it doesn't
  // hurt to have it set; Docker builds use it too.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  // Both DB drivers + libsql's deps are native (or use top-level await /
  // dynamic import) — leave them OUT of the bundler so Vercel's serverless
  // runtime can require() them at boot. The build still runs both server
  // code paths; this just controls bundling, not execution.
  serverExternalPackages: [
    'better-sqlite3',      // local file driver
    '@libsql/client',      // Vercel / Turso driver
    'libsql',              // transitive native binding from @libsql/client
    'nodemailer',          // ships its own require() calls
    'pino', 'pino-pretty', // worker tries to load pino-pretty at boot
  ],
  async headers() {
    // Dev needs 'unsafe-eval' for Next.js Fast Refresh (the React Refresh
    // runtime calls eval to hot-swap modules). Without it the entire app
    // bundle fails to load, the React tree never mounts, and you see a
    // blank page. Production keeps the strict policy.
    const isDev = process.env.NODE_ENV !== 'production'
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'"
    // Dev also needs connect-src 'self' + the HMR websocket; Next handles
    // both with 'self' since the WS is on the same origin.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}
export default nextConfig
