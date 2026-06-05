import { redirect } from 'next/navigation'
import { FlaskConical } from 'lucide-react'
import { auth } from '@/auth'
import { adminEmails } from '@/lib/env'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
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
      <PageHeader
        icon={FlaskConical}
        title="Diagnostic"
        description="Pre-flight checks for SMTP, AI, OAuth, deliverability posture, cron, DB, and admin config. Run a Quick check after every deploy, Full check before a big send."
        pills={[{ label: 'access', value: 'admin only', tone: 'warn' }]}
        help={
          <SectionHelp
            title="Diagnostic"
            what={<>Pre-flight checks for SMTP, AI, OAuth, deliverability posture (SPF/DKIM/DMARC/MX), cron secret, DB, and admin config. Each warn has an inline &quot;how to fix&quot;.</>}
            actions={[
              { label: 'Quick run', hint: 'Skips DNS — use after every deploy to verify connectivity + cron.' },
              { label: 'Full run', hint: 'Adds DNS deliverability checks. Slower; run before a big send.' },
              { label: 'Copy as markdown', hint: 'Paste straight into a GitHub issue or postmortem.' },
            ]}
            guideAnchor="troubleshoot"
          />
        }
      />
      <Card><CardContent className="p-4"><DiagnosticClient /></CardContent></Card>
    </div>
  )
}
