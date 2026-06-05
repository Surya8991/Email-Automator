import { Send } from 'lucide-react'
import { requireUser } from '@/auth'
import { listDrafts } from '@/server/services/drafts'
import { listTemplates } from '@/server/services/templates'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { pluralWord } from '@/lib/pluralize'
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
        accent="amber"
        icon={Send}
        title="Drafts"
        description="Personalized emails ready to send. Edit, schedule, or fire them off in batches."
        pills={[
          { label: pluralWord(total, 'pending draft'), value: total, tone: total > 0 ? 'info' : 'default' },
          { label: 'active template', value: activeTemplate ? (activeTemplate.label || activeTemplate.key) : '—', tone: activeTemplate ? 'success' : 'warn' },
        ]}
        help={
          <SectionHelp
            title="Drafts"
            what={<>Drafts are personalized emails ready to send — each one matches a real recipient and the active template. You can edit any draft, send one or many, schedule them out over time, or discard.</>}
            actions={[
              { label: 'New drafts', hint: 'Opens a dialog with template picker, count, and audience filters (platform / job title / location / skip-recent).' },
              { label: 'Send all / Send selected', hint: 'Both gated by a confirmation dialog that previews recipients before SMTP fires.' },
              { label: 'Schedule…', hint: 'Convert selected drafts into staggered scheduled sends.' },
              { label: 'AI Improve', hint: 'Per-row sparkle button — rewrites the body in your chosen tone, with Undo for 1 h.' },
            ]}
            pitfalls={[
              { label: 'Big batches', hint: 'Send all > 25 surfaces an amber warning — stagger via Schedule instead so Gmail / Outlook don\'t flag the burst.' },
              { label: 'Duplicate send', hint: 'A row sent to in the last 7 days triggers a confirm before re-sending — don\'t bypass without checking.' },
            ]}
            guideAnchor="drafts"
          />
        }
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
