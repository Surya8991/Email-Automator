import { Send } from 'lucide-react'
import { requireUser } from '@/auth'
import { listDrafts } from '@/server/services/drafts'
import { listTemplates } from '@/server/services/templates'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { DraftsClient } from './drafts-client'

// Allowed page sizes — kept in lockstep with the UI selector. Anything
// outside this list falls back to 50 so a bad ?pageSize= URL can't
// over-fetch beyond the server cap.
const PAGE_SIZES = [50, 100, 500, 1000]

export default async function DraftsPage(props: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const sp = await props.searchParams
  const u = await requireUser()
  const requestedSize = Number(sp.pageSize ?? 50)
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 50
  const page = Math.max(1, Number(sp.page ?? 1))
  const [{ rows, total, pageSize: actual }, allTemplates] = await Promise.all([
    listDrafts(u.id, page, pageSize),
    listTemplates(u.id),
  ])
  const pages = Math.max(1, Math.ceil(total / actual))
  // Compact template summary for the CreateDraftsDialog picker — avoid
  // shipping bodies (potentially huge HTML) to the client.
  const templateSummary = allTemplates.map((t) => ({
    id: t.id, key: t.key, label: t.label, category: t.category, active: t.active,
  }))
  const activeTemplate = allTemplates.find((t) => t.active) ?? null
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Send}
        title="Drafts"
        description="Personalized emails ready to send. Edit, schedule, or fire them off in batches."
        pills={[
          { label: 'pending', value: total, tone: total > 0 ? 'info' : 'default' },
          { label: 'active template', value: activeTemplate ? (activeTemplate.label || activeTemplate.key) : '—', tone: activeTemplate ? 'success' : 'warn' },
        ]}
      />
      <Card><CardContent className="p-0">
        <DraftsClient
          rows={rows}
          isAdmin={Boolean(u.isAdmin)}
          page={page}
          pages={pages}
          pageSize={actual}
          total={total}
          templates={templateSummary}
        />
      </CardContent></Card>
    </div>
  )
}
