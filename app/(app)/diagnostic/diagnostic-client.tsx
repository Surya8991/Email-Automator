'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, AlertTriangle, XCircle, Play, Mail, Reply, AlertOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runDiagnosticsAction, sendSmtpTestAction, type DiagResult } from '@/server/actions/diagnostic'
import { checkBouncesAction, checkRepliesAction } from '@/server/actions/gmail'

function Icon({ s }: { s: DiagResult['status'] }) {
  if (s === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (s === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  return <XCircle className="h-4 w-4 text-destructive" />
}

export function DiagnosticClient() {
  const [pending, start] = useTransition()
  const [rows, setRows] = useState<DiagResult[] | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await runDiagnosticsAction()
          setRows(r.results)
        })}><Play className="mr-1.5 h-4 w-4" /> Run checks</Button>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await sendSmtpTestAction()
          if ('error' in r && r.error) toast.error(r.error); else toast.success(`Test email sent to ${r.to}`)
        })}><Mail className="mr-1.5 h-4 w-4" /> Send test to self</Button>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await checkRepliesAction()
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('replied' in r) toast.success(`Checked ${r.checked} sent contacts · ${r.replied} replied`)
        })}><Reply className="mr-1.5 h-4 w-4" /> Check replies (Gmail)</Button>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await checkBouncesAction()
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('marked' in r) toast.success(`Found ${r.bouncedFound} bounces · marked ${r.marked} contacts`)
        })}><AlertOctagon className="mr-1.5 h-4 w-4" /> Check bounces (Gmail)</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Reply / bounce checks call the Gmail API — only work if you signed in with Google.
      </p>
      {rows ? (
        <ul className="divide-y rounded-md border">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-3 p-3">
              <Icon s={r.status} />
              <div className="flex-1">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground break-all">{r.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
