import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { adminEmails } from '@/lib/env'
import { Card, CardContent } from '@/components/ui/card'
import { DiagnosticClient } from './diagnostic-client'

export default async function DiagnosticPage() {
  // Probes hit external DNS resolvers, so we gate the page to admins. A
  // non-admin who navigates here gets sent back to the dashboard rather
  // than 401 — feels less like a permission error and more like an
  // unsupported page.
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = adminEmails.includes((session.user.email ?? '').toLowerCase())
  if (!isAdmin) redirect('/dashboard')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Diagnostic</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only. Checks SMTP, AI provider, OAuth, SPF, DMARC, cron secret,
          libsql reachability, and ADMIN_EMAILS. Run before a big send.
        </p>
      </div>
      <Card><CardContent className="p-4"><DiagnosticClient /></CardContent></Card>
    </div>
  )
}
