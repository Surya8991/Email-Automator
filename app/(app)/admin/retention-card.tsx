'use client'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { purgeRetentionNowAction } from '@/server/actions/admin'

export function RetentionCard() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ events: number; audit: number; users: number } | null>(null)
  return (
    <Card>
      <CardHeader><CardTitle>Retention</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Events and audit-log rows are auto-purged once per day by the scheduler. Defaults:
          events 180 days, audit 365 days. Override per-user via the <code>EVENTS_RETENTION_DAYS</code>
          / <code>AUDIT_RETENTION_DAYS</code> settings.
        </p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => {
            if (!confirm('Run retention purge for every user now? This deletes events / audit rows past the retention window — non-reversible.')) return
            const r = await purgeRetentionNowAction()
            if ('error' in r) { alert(r.error); return }
            setResult({ events: r.events, audit: r.audit, users: r.users })
          })}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {pending ? 'Purging…' : 'Purge now'}
        </Button>
        {result && (
          <p className="text-xs text-muted-foreground">
            Purged {result.events} event{result.events === 1 ? '' : 's'} and {result.audit} audit row{result.audit === 1 ? '' : 's'} across {result.users} user{result.users === 1 ? '' : 's'}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
