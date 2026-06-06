/**
 * Check how many marketing leads exist and test Naukri API directly.
 * Run: DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/check-marketing.ts
 */
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { jobLeads, jobSources } from '../server/db/schema'

const USER_ID = '2560e12a-5480-45e9-bb3d-52a5ef8eb70d'

async function main() {
// Count by status
const byStatus = await db.select({ status: jobLeads.status, n: sql<number>`COUNT(*)` })
  .from(jobLeads).where(eq(jobLeads.userId, USER_ID))
  .groupBy(jobLeads.status)
console.log('\nLeads by status:')
for (const r of byStatus) console.log(' ', r.status, ':', r.n)

// Count marketing/DM new leads (title-based filter)
const MARKETING_KEYWORDS = [
  'seo', 'sem', 'ppc', 'digital market', 'performance market',
  'social media', 'content market', 'email market', 'brand market',
  'campaign manager', 'paid media', 'google ads', 'facebook ads',
  'growth market', 'martech', 'crm market', 'marketing manager',
  'marketing executive', 'marketing specialist', 'marketing analyst',
  'marketing lead', 'marketing head', 'marketing director',
]

const allNew = await db.select({ id: jobLeads.id, title: jobLeads.title, company: jobLeads.company, postedAt: jobLeads.postedAt, seenAt: jobLeads.seenAt })
  .from(jobLeads)
  .where(and(eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new')))
  .limit(2000)

const marketingLeads = allNew.filter(l =>
  MARKETING_KEYWORDS.some(kw => l.title?.toLowerCase().includes(kw))
)

console.log('\nTotal new leads:', allNew.length)
console.log('Marketing/DM new leads:', marketingLeads.length)
console.log('\nSample marketing titles:')
marketingLeads.slice(0, 20).forEach(l => console.log(' -', l.title?.slice(0, 70), '|', l.company?.slice(0, 30)))

// Sources - show the newly added ones and their status
const sources = await db.select({ id: jobSources.id, label: jobSources.label, url: jobSources.url, lastStatus: jobSources.lastStatus, lastError: jobSources.lastError })
  .from(jobSources).where(eq(jobSources.userId, USER_ID)).orderBy(jobSources.id)
console.log('\n\nAll sources (' + sources.length + ' total). Last 30:')
sources.slice(-30).forEach(s => console.log(
  String(s.id).padStart(4), '|',
  String(s.label).slice(0, 45).padEnd(45), '|',
  String(s.lastStatus).slice(0, 20).padEnd(20), '|',
  s.lastError ? String(s.lastError).slice(0, 50) : '',
))

// Test Naukri API directly
console.log('\n\nTesting Naukri API for "digital marketing"…')
try {
  const apiUrl = new URL('https://www.naukri.com/jobapi/v3/search')
  apiUrl.searchParams.set('noOfResults', '5')
  apiUrl.searchParams.set('urlType', 'search_by_keyword')
  apiUrl.searchParams.set('searchType', 'adv')
  apiUrl.searchParams.set('keyword', 'digital marketing')
  apiUrl.searchParams.set('pageNo', '1')
  const r = await fetch(apiUrl.toString(), {
    headers: {
      appid: '109', systemid: '109',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.naukri.com/',
      Origin: 'https://www.naukri.com',
    },
  })
  console.log('Status:', r.status, r.statusText)
  if (r.ok) {
    const data = await r.json() as { jobDetails?: unknown[]; noOfJobs?: number }
    console.log('Jobs returned:', data.jobDetails?.length ?? 0, '/ total:', data.noOfJobs)
    if (data.jobDetails?.length) {
      const first = data.jobDetails[0] as { title?: string; companyName?: string }
      console.log('First job:', first.title, '|', first.companyName)
    }
  } else {
    const text = await r.text()
    console.log('Body snippet:', text.slice(0, 200))
  }
} catch (e) {
    console.log('Error:', e instanceof Error ? e.message : e)
  }
} // end main

main().catch(console.error)
