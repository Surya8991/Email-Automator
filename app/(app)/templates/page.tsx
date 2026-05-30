import { requireUser } from '@/auth'
import { listTemplates } from '@/server/services/templates'
import { getSetting } from '@/server/services/settings'
import { parseCustomFieldKeys } from '@/lib/custom-fields'
import { Card, CardContent } from '@/components/ui/card'
import { TemplateEditor } from './template-editor'

export default async function TemplatesPage() {
  const u = await requireUser()
  const [all, rawKeys] = await Promise.all([
    listTemplates(u.id),
    getSetting(u.id, 'CUSTOM_FIELD_KEYS'),
  ])
  const customKeys = parseCustomFieldKeys(rawKeys)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">Edit subject and body. The active template is used by drafts and campaigns.</p>
      </div>
      <Card><CardContent className="p-4"><TemplateEditor templates={all} customFieldKeys={customKeys} /></CardContent></Card>
    </div>
  )
}
