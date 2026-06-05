import { Ban } from 'lucide-react'
import { requireUser } from '@/auth'
import { listBlocklist } from '@/server/services/blocklist'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { BlocklistClient } from './blocklist-client'

export default async function BlocklistPage() {
  const u = await requireUser()
  const rows = await listBlocklist(u.id)
  const domains = rows.filter((r) => r.pattern?.startsWith('@') || r.type === 'domain').length
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Ban}
        title="Blocklist"
        description="Suppress specific emails or whole domains. Unsubscribe clicks add to the global list automatically."
        pills={[
          { label: 'entries', value: rows.length, tone: rows.length > 0 ? 'info' : 'default' },
          { label: 'domains', value: domains },
        ]}
        help={
          <SectionHelp
            title="Blocklist"
            what={<>Per-user suppression list. Any send checks the blocklist first; matching addresses are skipped silently. Unsubscribe clicks add to the list automatically. Admins can also manage a global blocklist that applies tenant-wide.</>}
            actions={[
              { label: 'Block a domain', hint: 'Add a row with type=domain and pattern=acme.com — every address @acme.com is suppressed.' },
            ]}
            guideAnchor="blocklist"
          />
        }
      />
      <Card><CardContent className="p-0"><BlocklistClient rows={rows} /></CardContent></Card>
    </div>
  )
}
