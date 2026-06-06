import { requireUser } from '@/auth'
import { listLeads } from '@/server/services/job-tracker'

// CSV export of job leads. Default scope = all statuses; ?status=
// narrows. Server-streamed; the actions list keeps a 200-row hard cap
// inside listLeads but for CSV we want the full slice the user sees.

const ESCAPE = (s: string): string => {
  if (s === undefined || s === null) return ''
  const str = String(s)
  // Wrap in quotes when the value contains comma / quote / newline.
  if (/[,"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export async function GET(req: Request) {
  const u = await requireUser()
  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'new'
  const validStatuses = new Set(['new', 'saved', 'ignored', 'applied'])
  const filterStatus = validStatuses.has(status) ? status : 'new'

  // Export uses a larger cap than the on-screen list so users get the
  // full archive in the CSV — 10k rows is enough for any real tenant.
  const leads = await listLeads(u.id, filterStatus, 10_000).catch(() => [])
  const header = ['id', 'title', 'company', 'location', 'link', 'status', 'seenAt'].join(',')
  const rows = leads.map((l) => [
    l.id,
    ESCAPE(l.title),
    ESCAPE(l.company),
    ESCAPE(l.location),
    ESCAPE(l.link),
    l.status,
    new Date(l.seenAt).toISOString(),
  ].join(','))
  const csv = [header, ...rows].join('\n') + '\n'

  const filename = `email-automator-job-leads-${filterStatus}-${new Date().toISOString().slice(0, 10)}.csv`
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store, private',
    },
  })
}
