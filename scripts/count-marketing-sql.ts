import { eq, and, sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { jobLeads } from '../server/db/schema'
const USER_ID = '2560e12a-5480-45e9-bb3d-52a5ef8eb70d'

async function main() {
  const total = await db.select({ n: sql<number>`COUNT(*)` }).from(jobLeads)
    .where(and(eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new')))
  console.log('Total new leads:', total[0]?.n)

  const mkt = await db.select({ n: sql<number>`COUNT(*)` }).from(jobLeads)
    .where(and(
      eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new'),
      sql`(lower(title) LIKE '%seo%' OR lower(title) LIKE '%sem%' OR lower(title) LIKE '%ppc%'
        OR lower(title) LIKE '%digital market%' OR lower(title) LIKE '%performance market%'
        OR lower(title) LIKE '%social media%' OR lower(title) LIKE '%content market%'
        OR lower(title) LIKE '%email market%' OR lower(title) LIKE '%paid media%'
        OR lower(title) LIKE '%google ads%' OR lower(title) LIKE '%facebook ads%'
        OR lower(title) LIKE '%growth market%' OR lower(title) LIKE '%marketing manager%'
        OR lower(title) LIKE '%marketing exec%' OR lower(title) LIKE '%marketing specialist%'
        OR lower(title) LIKE '%marketing analyst%' OR lower(title) LIKE '%campaign manager%'
        OR lower(title) LIKE '%crm market%' OR lower(title) LIKE '%martech%'
        OR lower(title) LIKE '%demand gen%' OR lower(title) LIKE '%influencer%'
        OR lower(title) LIKE '%programmatic%' OR lower(title) LIKE '%affiliate%'
        OR lower(title) LIKE '%paid search%' OR lower(title) LIKE '%brand market%')`
    ))
  console.log('Marketing/DM new leads:', mkt[0]?.n)

  const sample = await db.select({ title: jobLeads.title, company: jobLeads.company })
    .from(jobLeads).where(and(eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new')))
    .orderBy(sql`id DESC`).limit(20)
  console.log('\nNewest 20 leads added:')
  sample.forEach(l => console.log(' -', l.title, '|', l.company))
}
main().catch(console.error)
