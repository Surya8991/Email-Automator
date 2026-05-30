import { Card, CardContent } from '@/components/ui/card'
import { DiagnosticClient } from './diagnostic-client'

export default function DiagnosticPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Diagnostic</h1>
        <p className="text-sm text-muted-foreground">
          Quick check of SMTP, AI provider, OAuth, SPF, and DMARC. Run before a big send.
        </p>
      </div>
      <Card><CardContent className="p-4"><DiagnosticClient /></CardContent></Card>
    </div>
  )
}
