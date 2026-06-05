import Link from 'next/link'
import { requireUser } from '@/auth'
import { listCompanies } from '@/server/services/companies'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Building2, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { EmptyState } from '@/components/ui/empty-state'
import { pluralWord } from '@/lib/pluralize'

export default async function CompaniesPage() {
  const u = await requireUser()
  // Defensive — if migration 0006_features hasn't been applied to the prod
  // DB yet, listCompanies throws "no such table: companies". Fall back to
  // an empty list so the page shows the empty-state CTA instead of 500.
  // The real error lands in Vercel logs via console.error.
  const companies = await listCompanies(u.id).catch((e) => {
    console.error('[companies] listCompanies failed:', e)
    return [] as Awaited<ReturnType<typeof listCompanies>>
  })

  return (
    <div className="space-y-6">
      <PageHeader
        accent="sky"
        icon={Building2}
        title="Companies"
        description="Per-company research linked to your contacts by name match. Fill it in once, surface it everywhere."
        pills={[
          { label: pluralWord(companies.length, 'record'), value: companies.length, tone: companies.length > 0 ? 'info' : 'default' },
        ]}
        actions={
          <Button asChild>
            <Link href="/companies/new"><Plus className="mr-1 h-4 w-4" /> Add company</Link>
          </Button>
        }
        help={
          <SectionHelp
            title="Companies"
            what={<>Per-company research records: industry, HQ, size, tech stack, salary range, notes. Linked to /contacts by name match — when you open a contact, the matched company shows in the sidebar.</>}
            actions={[
              { label: 'Add company', hint: 'AI fill button enriches from just the name (needs GROQ_API_KEY).' },
            ]}
            pitfalls={[
              { label: 'Name match', hint: 'Linking is by exact (case-insensitive) company name. Spelling drift between contact CSV and the company record breaks the auto-surface.' },
            ]}
            guideAnchor="contacts"
          />
        }
      />

      {companies.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState
            icon={Building2}
            title="No company research yet"
            description="Add per-company notes (industry, HQ, size, tech stack, salary range). They auto-surface on the matching contact-detail pages."
            action={
              <Button asChild>
                <Link href="/companies/new"><Plus className="mr-1 h-4 w-4" /> Add your first company</Link>
              </Button>
            }
            hint="Tip: the AI fill button in the company form populates everything from just the name (needs GROQ_API_KEY)."
          />
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <Link href={`/companies/${c.id}`} className="hover:underline">{c.name}</Link>
                  {c.sourceUrl ? (
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open source">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                {c.industry ? <div><span className="font-medium text-foreground">Industry:</span> {c.industry}</div> : null}
                {c.hq ? <div><span className="font-medium text-foreground">HQ:</span> {c.hq}</div> : null}
                {c.size ? <div><span className="font-medium text-foreground">Size:</span> {c.size}</div> : null}
                {c.techStack ? <div><span className="font-medium text-foreground">Stack:</span> {c.techStack}</div> : null}
                {c.salaryRange ? <div><span className="font-medium text-foreground">Salary:</span> {c.salaryRange}</div> : null}
                {c.notes ? <div className="line-clamp-2 italic">{c.notes}</div> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
