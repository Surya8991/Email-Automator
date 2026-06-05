import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/auth'
import { getCompany } from '@/server/services/companies'
import { CompanyForm } from '../company-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function EditCompanyPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const cid = Number(id)
  if (!Number.isFinite(cid)) redirect('/companies')
  const u = await requireUser()
  const c = await getCompany(u.id, cid)
  if (!c) notFound()
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit company</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm
            initial={{
              id: c.id, name: c.name, industry: c.industry, hq: c.hq, size: c.size,
              funding: c.funding, glassdoor: c.glassdoor, techStack: c.techStack,
              salaryRange: c.salaryRange, hiringFreq: c.hiringFreq, notes: c.notes,
              sourceUrl: c.sourceUrl,
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
