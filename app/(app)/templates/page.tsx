import { FileText } from 'lucide-react'
import { requireUser } from '@/auth'
import { listTemplates } from '@/server/services/templates'
import { getSetting } from '@/server/services/settings'
import { parseCustomFieldKeys } from '@/lib/custom-fields'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { TemplateEditor } from './template-editor'

export default async function TemplatesPage() {
  const u = await requireUser()
  const [all, rawKeys] = await Promise.all([
    listTemplates(u.id),
    getSetting(u.id, 'CUSTOM_FIELD_KEYS'),
  ])
  const customKeys = parseCustomFieldKeys(rawKeys)
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
      />
      <Card><CardContent className="p-4"><TemplateEditor templates={all} customFieldKeys={customKeys} /></CardContent></Card>
    </div>
  )
}
