import { Eye } from 'lucide-react'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { contacts } from '@/server/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { getActive } from '@/server/services/templates'
import { buildEmail } from '@/server/services/drafts'

export default async function DryRunPage() {
  const u = await requireUser()
  const tpl = await getActive(u.id)
  const ready = await db.select().from(contacts).where(and(
    eq(contacts.userId, u.id),
    sql`${contacts.recruiterEmail} != ''`,
    sql`${contacts.emailStatus} NOT LIKE '%Draft Created%'`,
    sql`${contacts.emailStatus} NOT LIKE '%Sent%'`
  )).limit(100)

  return (
    <div className="space-y-6">
      <PageHeader
        accent="sky"
        icon={Eye}
        title="Dry run"
        description="Preview the first 100 eligible contacts and the personalized subject they'd get from your active template. Nothing is sent."
        pills={[
          { label: 'eligible', value: ready.length, tone: ready.length > 0 ? 'info' : 'warn' },
          { label: 'template', value: tpl ? (tpl.label || tpl.key) : '—', tone: tpl ? 'success' : 'warn' },
        ]}
        help={
          <SectionHelp
            title="Dry run"
            what={<>Read-only preview of what would happen if you bulk-created drafts right now. Shows the first 100 eligible contacts + the personalized subject they&apos;d get from the active template. No DB writes, no email.</>}
            actions={[
              { label: 'Catch missing variables', hint: 'A subject like "Hi {{name}}" with an empty name field surfaces here as "Hi ," — fix in /templates or /contacts before mass-send.' },
            ]}
            guideAnchor="drafts"
          />
        }
      />
      {!tpl ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No active template. Pick one in <a href="/templates" className="underline">Templates</a> and click Activate.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">To</th>
                <th className="p-2">Subject (variant)</th>
                <th className="p-2">Body preview</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((c, i) => {
                const e = buildEmail(tpl, c)
                const text = e.text.replace(/\s+/g, ' ').slice(0, 120)
                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-mono text-xs">{c.recruiterEmail}</td>
                    <td className="p-2">{e.subject} <span className="ml-1 text-xs text-muted-foreground">({e.subjectVariant})</span></td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-md">{text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {ready.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No eligible contacts.</div>
          ) : null}
        </CardContent></Card>
      )}
    </div>
  )
}
