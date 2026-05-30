import { auth } from '@/auth'
import { db } from '@/server/db/client'
import { contacts } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

const HEADERS = [
  '#', 'Date Applied', 'Company', 'Recruiter Name', 'Job Title', 'Recruiter Email',
  'Location', 'Work Mode', 'Job Type', 'Platform', 'Source URL', 'Status',
  'Priority', 'Salary', 'Email Status', 'Schedule Date', 'Schedule Time', 'Notes',
]

function csvCell(v: unknown): string {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"'
}

export async function GET() {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const rows = await db.select().from(contacts).where(eq(contacts.userId, userId))
  const body = [HEADERS.join(',')]
    .concat(rows.map((c) => [
      c.num, '', c.company, c.recruiterName, c.jobTitle, c.recruiterEmail,
      c.location, c.workMode, c.jobType, c.platform, c.sourceUrl, c.status,
      c.priority, c.salary, c.emailStatus, c.scheduleDate, c.scheduleTime, c.notes,
    ].map(csvCell).join(',')))
    .join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=contacts_${new Date().toISOString().slice(0, 10)}.csv`,
    },
  })
}
