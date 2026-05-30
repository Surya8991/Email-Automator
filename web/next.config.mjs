/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  // better-sqlite3 is a native module — keep it on the server side and don't
  // try to bundle it.
  serverExternalPackages: ['better-sqlite3'],
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
