import Link from 'next/link'
import { requireUser } from '@/auth'
import { listCompanies } from '@/server/services/companies'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Building2, ExternalLink } from 'lucide-react'

export default async function CompaniesPage() {
  const u = await requireUser()
  const companies = await listCompanies(u.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            {companies.length} research record{companies.length === 1 ? '' : 's'}. Linked by company-name match to /contacts.
          </p>
        </div>
        <Button asChild>
          <Link href="/companies/new"><Plus className="mr-1 h-4 w-4" /> Add company</Link>
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">No company research yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add per-company notes (industry, HQ, size, tech stack, salary range) and they'll auto-surface on contact-detail pages by name match.
            </p>
            <Button asChild className="mt-4">
              <Link href="/companies/new"><Plus className="mr-1 h-4 w-4" /> Add your first company</Link>
            </Button>
          </CardContent>
        </Card>
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
