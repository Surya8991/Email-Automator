import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from 'sonner'
import './globals.css'

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#0b0f17' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning on body too — Kaspersky / Grammarly /
          password managers inject attributes (`__processed_<uuid>__`, etc.)
          before React hydrates, which would otherwise log a mismatch every
          page load. The page renders fine either way; this just silences the
          noise. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          {/* Global toast. richColors gives green/red variants automatically. */}
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
