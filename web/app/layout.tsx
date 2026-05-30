import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Email Automator',
  description: 'Send personalized outreach at scale — safely.',
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
        </ThemeProvider>
      </body>
    </html>
  )
}
