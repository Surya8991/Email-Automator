import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from 'sonner'
import './globals.css'

// Inter via next/font — self-hosted, subset, no CLS. CSS variable so
// tailwind can read it and globals.css can apply Inter's tabular and
// stylistic feature-settings (cv11 = single-storey "a", ss01/ss03 =
// clean glyph alternates) site-wide.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})
// JetBrains Mono for kbd / code blocks — better-than-default for
// monospace alternates without bringing in another big family.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Email Automator',
  description: 'Send personalized outreach at scale — safely.',
  // PWA: the manifest lets Chrome/Edge/Safari treat the app as an
  // installable web-app (Add to Home Screen / install prompt).
  manifest: '/manifest.webmanifest',
  applicationName: 'Email Automator',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Email Automator',
  },
}

// Next 16 moved themeColor + viewport tuning out of `metadata` into a
// separate `viewport` export. Keeping them here silences the build
// warning that was firing on /jobs (and would flag CI on Vercel too).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#0b0f17' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      {/* suppressHydrationWarning on body too — Kaspersky / Grammarly /
          password managers inject attributes (`__processed_<uuid>__`, etc.)
          before React hydrates, which would otherwise log a mismatch every
          page load. The page renders fine either way; this just silences the
          noise. */}
      <body className="min-h-dvh font-sans" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          {/* Global toast. richColors gives green/red variants automatically. */}
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
