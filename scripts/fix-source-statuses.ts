/**
 * Fix source statuses after Naukri recaptcha run.
 * Run: DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/fix-source-statuses.ts
 */
import { db } from '../server/db/client'
import { jobSources } from '../server/db/schema'
import { and, eq, sql } from 'drizzle-orm'

const USER_ID = '2560e12a-5480-45e9-bb3d-52a5ef8eb70d'

async function main() {
  // Clear error status on Naukri/Foundit sources blocked by captcha
  await db.update(jobSources).set({
    lastStatus: 'ok-captcha-retry',
    lastError: '',
    lastFetchedAt: null,
  }).where(and(
    eq(jobSources.userId, USER_ID),
    eq(jobSources.lastStatus, 'error'),
    sql`last_error LIKE '%No AI key%'`
  ))
  console.log('✅  Cleared Naukri/Foundit error statuses → ok-captcha-retry (will retry on next cron)')

  // Mark LinkedIn sources as seeded
  await db.update(jobSources).set({
    lastStatus: 'ok-seeded',
    lastFetchedAt: Date.now(),
  }).where(and(
    eq(jobSources.userId, USER_ID),
    eq(jobSources.lastStatus, ''),
    sql`label LIKE 'LinkedIn%'`
  ))
  console.log('✅  Updated LinkedIn source statuses → ok-seeded')

  // Mark Remotive extended-search sources
  await db.update(jobSources).set({
    lastStatus: 'ok-seeded',
    lastFetchedAt: Date.now(),
  }).where(and(
    eq(jobSources.userId, USER_ID),
    eq(jobSources.lastStatus, ''),
    sql`label LIKE 'Remotive%'`
  ))
  console.log('✅  Updated Remotive source statuses → ok-seeded')

  console.log('\nDone.')
}
main().catch(console.error)
