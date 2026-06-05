import { CompanyForm } from '../company-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewCompanyPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add company</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm />
        </CardContent>
      </Card>
    </div>
  )
}
