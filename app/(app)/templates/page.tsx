import { FileText } from 'lucide-react'
import { requireUser } from '@/auth'
import { listTemplates } from '@/server/services/templates'
import { getSetting } from '@/server/services/settings'
import { breakdownByTemplate } from '@/server/services/analytics'
import { parseCustomFieldKeys } from '@/lib/custom-fields'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { TemplateEditor } from './template-editor'

export default async function TemplatesPage() {
  const u = await requireUser()
  const [all, rawKeys, breakdown] = await Promise.all([
    listTemplates(u.id),
    getSetting(u.id, 'CUSTOM_FIELD_KEYS'),
    // Last-30-day rollup so each template label can show "12 sent · 35% open
    // · 8% reply" without an extra round-trip. Defensive .catch in case the
    // analytics service errors — templates page must always render.
    breakdownByTemplate(u.id, 30).catch((e) => {
      console.error('[templates] breakdownByTemplate failed:', e)
      return [] as Awaited<ReturnType<typeof breakdownByTemplate>>
    }),
  ])
  const customKeys = parseCustomFieldKeys(rawKeys)
  // Map templateId → { sent, openRate, replyRate } for inline display.
  const stats = new Map(breakdown.map((r) => [Number(r.key), {
    sent: r.sent,
    openRate: r.sent > 0 ? r.opens / r.sent : 0,
    replyRate: r.sent > 0 ? r.replies / r.sent : 0,
  }]))
  const active = all.find((t) => t.active)
  const categories = new Set(all.map((t) => t.category).filter(Boolean))
  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Templates"
        description="Edit subject and body. The active template feeds Drafts and single-step Campaigns."
        pills={[
          { label: 'templates', value: all.length, tone: 'info' },
          { label: 'active', value: active ? (active.label || active.key) : '—', tone: active ? 'success' : 'warn' },
          { label: 'categories', value: categories.size },
          { label: 'custom fields', value: customKeys.length, tone: customKeys.length > 0 ? 'info' : 'default' },
        ]}
        help={
          <SectionHelp
            title="Templates"
            what={<>Templates hold the subject + body skeleton. Variables in <code className="rounded bg-muted px-1">{'{{double_braces}}'}</code> are substituted per recipient at send time. Exactly one template is &quot;active&quot; — that&apos;s the one Drafts and one-shot Campaigns use.</>}
            actions={[
              { label: 'Edit tab', hint: 'Inline AI Improve next to the body with tone / length / CTA controls. Variable validator flags unknown {{tokens}}.' },
              { label: 'Generate tab', hint: 'Paste a job description, LinkedIn post, URL, or free text — AI returns a drafted subject + body you can Accept or Refine.' },
              { label: 'Stats tab', hint: 'Last-30-day funnel: sent → opened → clicked → replied for this template.' },
              { label: 'Test send', hint: 'Fires the current editor state to your own address with sample variables. Catches broken HTML before mass-send.' },
            ]}
            pitfalls={[
              { label: 'Inactive template', hint: 'Drafts use the active template, not the one currently open in the editor. Click Activate to make a switch real.' },
              { label: 'AI prompts', hint: 'Save Brand Voice samples in Settings → AI for the AI to match your actual writing style.' },
            ]}
            guideAnchor="templates"
          />
        }
      />
      <Card><CardContent className="p-4">
        <TemplateEditor
          templates={all}
          customFieldKeys={customKeys}
          stats={Object.fromEntries(stats)}
        />
      </CardContent></Card>
    </div>
  )
}
