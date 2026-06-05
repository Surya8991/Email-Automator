'use client'
import { Download, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// GDPR-style data export. One button → JSON file with every row the
// user owns across the app. Server route handles rate-limit (1/24h)
// + auth + audit. Redacts secrets (encrypted SMTP passwords, OAuth
// tokens) — they'd be useless in cleartext anyway.

export function ExportDataCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Export your data
        </CardTitle>
        <CardDescription>
          Download every row in every table that belongs to you — contacts, templates, drafts, email log, events, campaigns, companies, identities, settings, audit log. JSON, machine-readable. Encrypted credentials and OAuth tokens are redacted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild>
          <a href="/api/export/my-data" download>
            <Download className="mr-1.5 h-4 w-4" /> Download my data (JSON)
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          One export per 24 hours. The export action is logged to your audit log.
        </p>
      </CardContent>
    </Card>
  )
}
