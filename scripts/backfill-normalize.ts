/**
 * One-time backfill: populate salary_min/max/ccy/period, location_norm,
 * remote_scope, cross_key for all job_leads rows where cross_key = ''.
 *
 * Run with Turso credentials:
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... tsx scripts/backfill-normalize.ts
 */
import { createClient } from '@libsql/client'
import { normalizeSalary, normalizeLocation, crossKey } from '../server/services/normalize'

const url   = process.env.DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url) throw new Error('DATABASE_URL not set')

const client = createClient({ url, authToken: token })

const BATCH = 200

async function main() {
  // Fetch rows that need backfill (cross_key is empty or null)
  const result = await client.execute(
    "SELECT id, title, company, salary, location FROM job_leads WHERE cross_key IS NULL OR cross_key = '' ORDER BY seen_at DESC"
  )
  const rows = result.rows
  console.log(`Found ${rows.length} leads to backfill`)

  let updated = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    for (const row of batch) {
      const id       = row[0] as string
      const title    = (row[1] as string) ?? ''
      const company  = (row[2] as string) ?? ''
      const salary   = (row[3] as string) ?? ''
      const location = (row[4] as string) ?? ''

      const sal = normalizeSalary(salary)
      const loc = normalizeLocation(location)
      const ck  = crossKey(company, title, loc.norm)

      await client.execute({
        sql: `UPDATE job_leads
              SET salary_min = ?, salary_max = ?, salary_ccy = ?, salary_period = ?,
                  location_norm = ?, remote_scope = ?, cross_key = ?
              WHERE id = ?`,
        args: [sal.min, sal.max, sal.ccy, sal.period, loc.norm, loc.remoteScope, ck, id],
      })
      updated++
    }
    console.log(`  Backfilled ${Math.min(i + BATCH, rows.length)} / ${rows.length}`)
  }

  // Summary
  const salaryCheck = await client.execute(
    "SELECT COUNT(*) FROM job_leads WHERE salary_min IS NOT NULL")
  const crossKeyCheck = await client.execute(
    "SELECT COUNT(*) FROM job_leads WHERE cross_key != ''")
  const remoteCheck = await client.execute(
    "SELECT COUNT(*) FROM job_leads WHERE remote_scope != ''")

  console.log('\nBackfill complete:')
  console.log(`  Rows updated: ${updated}`)
  console.log(`  salary_min populated: ${salaryCheck.rows[0]?.[0] ?? 0}`)
  console.log(`  cross_key populated: ${crossKeyCheck.rows[0]?.[0] ?? 0}`)
  console.log(`  remote_scope populated: ${remoteCheck.rows[0]?.[0] ?? 0}`)

  // Sample check
  const sample = await client.execute(`
    SELECT title, company, salary, salary_min, salary_ccy, location, location_norm, remote_scope
    FROM job_leads WHERE salary != '' AND salary_min IS NOT NULL LIMIT 5`)
  console.log('\nSample (leads with salary):')
  for (const r of sample.rows) {
    console.log(`  "${r[0]}" @ ${r[1]}`)
    console.log(`    salary: "${r[2]}" → min=${r[3]} ${r[4]}`)
    console.log(`    location: "${r[5]}" → norm="${r[6]}", scope="${r[7]}"`)
  }

  await client.close()
}

main().catch(e => { console.error(e); process.exit(1) })
