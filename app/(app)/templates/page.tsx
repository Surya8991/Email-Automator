import { requireUser } from '@/auth'
import { listTemplates } from '@/server/services/templates'
import { Card, CardContent } from '@/components/ui/card'
import { TemplateEditor } from './template-editor'

export default async function TemplatesPage() {
  const u = await requireUser()
  const all = await listTemplates(u.id)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">Edit subject and body. The active template is used by drafts and campaigns.</p>
      </div>
      <Card><CardContent className="p-4"><TemplateEditor templates={all} /></CardContent></Card>
    </div>
  )
}
