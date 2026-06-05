'use client'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, AlertTriangle, XCircle, Play, Mail, Reply, AlertOctagon, RotateCcw, Zap,
  ChevronDown, ChevronRight as ChevronRightIcon, Copy as CopyIcon, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runDiagnosticsAction, sendSmtpTestAction, type DiagResult, type DiagGroup } from '@/server/actions/diagnostic'
import { checkBouncesAction, checkRepliesAction } from '@/server/actions/gmail'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

function Icon({ s }: { s: DiagResult['status'] }) {
  if (s === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (s === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  return <XCircle className="h-4 w-4 text-destructive" />
}

// Order groups by importance, connectivity first (does anything work?),
// background (will sends fire?), deliverability (will mail arrive?),
// admin (operator config) last.
const GROUP_ORDER: DiagGroup[] = ['connectivity', 'background', 'deliverability', 'admin']
const GROUP_LABEL: Record<DiagGroup, string> = {
  connectivity: 'Connectivity',
  background: 'Background jobs',
  deliverability: 'Deliverability',
  admin: 'Admin',
}

function groupOf(r: DiagResult): DiagGroup {
  return r.group ?? 'connectivity'
}

export function DiagnosticClient() {
  const [pending, start] = useTransition()
  const [rows, setRows] = useState<DiagResult[] | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [lastMode, setLastMode] = useState<'quick' | 'full' | null>(null)

  // Roll up pass/warn/fail tallies for the summary pill in the header.
  const summary = useMemo(() => {
    if (!rows) return null
    return rows.reduce((acc, r) => { acc[r.status]++; return acc }, { pass: 0, warn: 0, fail: 0 } as Record<DiagResult['status'], number>)
  }, [rows])

  // Bucket rows by group so the UI renders sectioned cards instead of a
  // flat list. Empty groups are dropped.
  const grouped = useMemo(() => {
    const buckets: Record<DiagGroup, DiagResult[]> = {
      connectivity: [], background: [], deliverability: [], admin: [],
    }
    if (!rows) return buckets
    for (const r of rows) buckets[groupOf(r)].push(r)
    return buckets
  }, [rows])

  function runChecks(mode: 'quick' | 'full') {
    start(async () => {
      const r = await runDiagnosticsAction({ mode })
      setRows(r.results)
      setLastMode(mode)
    })
  }

  function copyAsMarkdown() {
    if (!rows) return
    const lines: string[] = []
    lines.push(`# Diagnostic, ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`)
    if (summary) lines.push(`**Summary:** ${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail · mode=${lastMode ?? 'full'}\n`)
    for (const g of GROUP_ORDER) {
      const items = grouped[g]
      if (items.length === 0) continue
      lines.push(`\n## ${GROUP_LABEL[g]}`)
      for (const r of items) {
        const badge = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌'
        lines.push(`- ${badge} **${r.name}**, ${r.detail}`)
        if (r.remediation) lines.push(`  - *${r.remediation}*`)
      }
    }
    const text = lines.join('\n')
    navigator.clipboard.writeText(text).then(() => toast.success('Copied as markdown'))
      .catch(() => toast.error('Copy failed'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => runChecks('quick')}>
          <Zap className="mr-1.5 h-4 w-4" /> Quick run
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => runChecks('full')}>
          <Play className="mr-1.5 h-4 w-4" /> Full run
        </Button>
        <span className="hidden h-6 w-px bg-border sm:inline-block" />
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await sendSmtpTestAction()
          if ('error' in r) toast.error(r.error); else toast.success(`Test email sent to ${r.to}`)
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
        {rows ? (
          <Button variant="ghost" disabled={pending} onClick={copyAsMarkdown} className="ml-auto"
            title="Copy results as markdown for an issue/postmortem">
            <CopyIcon className="mr-1.5 h-4 w-4" /> Copy as md
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>Quick</strong> skips DNS (SPF/DMARC/MX), use after deploy. <strong>Full</strong> adds deliverability checks. Reply / bounce checks call the Gmail API, only work if you signed in with Google.
      </p>

      {summary ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> {summary.pass} pass
          </span>
          {summary.warn > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> {summary.warn} warn
            </span>
          ) : null}
          {summary.fail > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 font-medium text-destructive">
              <XCircle className="h-3 w-3" /> {summary.fail} fail
            </span>
          ) : null}
          <span className="text-muted-foreground">· mode: {lastMode}</span>
        </div>
      ) : null}

      {rows === null ? (
        <EmptyState
          icon={FileText}
          title="No checks run yet"
          description="Quick run covers connectivity + background jobs. Full run adds DNS-based deliverability checks (SPF / DKIM / DMARC / MX)."
          action={<>
            <Button onClick={() => runChecks('quick')}><Zap className="mr-1.5 h-4 w-4" /> Quick run</Button>
            <Button variant="outline" onClick={() => runChecks('full')}><Play className="mr-1.5 h-4 w-4" /> Full run</Button>
          </>}
          compact
        />
      ) : (
        <div className="space-y-3">
          {GROUP_ORDER.map((g) => {
            const items = grouped[g]
            if (items.length === 0) return null
            const groupSummary = items.reduce((acc, r) => { acc[r.status]++; return acc }, { pass: 0, warn: 0, fail: 0 } as Record<DiagResult['status'], number>)
            return (
              <div key={g} className="rounded-md border bg-card/40">
                <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[g]}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />{groupSummary.pass}</span>
                    {groupSummary.warn > 0 ? <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{groupSummary.warn}</span> : null}
                    {groupSummary.fail > 0 ? <span className="inline-flex items-center gap-0.5 text-destructive"><XCircle className="h-3 w-3" />{groupSummary.fail}</span> : null}
                  </span>
                </div>
                <ul className="divide-y">
                  {items.map((r, i) => {
                    const rowKey = `${g}-${r.name}-${i}`
                    const open = openRow === rowKey
                    const canExpand = Boolean(r.remediation) && r.status !== 'pass'
                    return (
                      <li key={rowKey} className="px-3 py-2.5">
                        <div className="flex items-start gap-3">
                          <Icon s={r.status} />
                          <button
                            type="button"
                            onClick={() => canExpand ? setOpenRow(open ? null : rowKey) : undefined}
                            className={cn(
                              'flex-1 min-w-0 text-left',
                              canExpand && 'cursor-pointer hover:opacity-80',
                            )}
                            aria-expanded={open}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{r.name}</span>
                              {canExpand ? (open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />) : null}
                            </div>
                            <div className="text-xs text-muted-foreground break-all">{r.detail}</div>
                            {open && r.remediation ? (
                              <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                                <div className="mb-1 font-medium text-foreground">How to fix</div>
                                <p>{r.remediation}</p>
                              </div>
                            ) : null}
                          </button>
                          {r.status !== 'pass' ? (
                            <Button
                              variant="ghost" size="sm" disabled={pending}
                              onClick={() => runChecks(lastMode ?? 'full')}
                              title="Re-run checks"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
