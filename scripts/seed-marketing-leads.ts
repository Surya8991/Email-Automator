/**
 * seed-marketing-leads.ts
 *
 * One-shot script: inserts 20+ marketing / DM job sources for the primary
 * user then immediately runs a first-fetch on every source to pull 500+
 * recent (≤15-day) leads into the "new" bucket.
 *
 * Run:
 *   DATABASE_URL=libsql://email-automator-suryalokesh.aws-ap-south-1.turso.io \
 *   TURSO_AUTH_TOKEN=eyJ...                                                   \
 *   npx tsx scripts/seed-marketing-leads.ts
 *
 * Safe to re-run: existing sources are detected by URL and reset to
 * first-fetch mode (lastFetchedAt = null) so they pull the full page budget.
 */

// Must set DATABASE_URL BEFORE the db/client import so it picks the right driver.
if (!process.env.DATABASE_URL?.startsWith('libsql://')) {
  console.error('\n❌  DATABASE_URL must start with libsql://  (Turso production DB)')
  console.error('   Example:')
  console.error('   DATABASE_URL=libsql://email-automator-suryalokesh.aws-ap-south-1.turso.io \\')
  console.error('   TURSO_AUTH_TOKEN=eyJ... \\')
  console.error('   npx tsx scripts/seed-marketing-leads.ts\n')
  process.exit(1)
}

import { eq, and, sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { jobSources, jobLeads } from '../server/db/schema'
import { tickSource } from '../server/services/job-tracker'

const USER_ID = '2560e12a-5480-45e9-bb3d-52a5ef8eb70d' // suryaraj8991@gmail.com

// ---------------------------------------------------------------------------
// Source definitions — 23 sources covering every major India marketing board
// + remote boards.  Naukri pulls 5 pages × 100 = 500 leads on first fetch.
// ---------------------------------------------------------------------------

const MARKETING_KW =
  'seo, sem, digital marketing, performance marketing, social media marketing, ' +
  'content marketing, email marketing, ppc, paid media, google ads, facebook ads, ' +
  'growth marketing, brand marketing, marketing manager, marketing executive, ' +
  'marketing specialist, campaign manager, crm marketing, martech, demand gen'

const SOURCES: { label: string; url: string; keywords: string }[] = [
  // ── Naukri (adapter: 5 pages × 100 = 500 results on first fetch) ─────────
  {
    label: 'Naukri — Digital Marketing',
    url:  'https://www.naukri.com/digital-marketing-jobs',
    keywords: 'digital marketing, seo, sem, ppc, social media, content, email, performance',
  },
  {
    label: 'Naukri — SEO / SEM',
    url:  'https://www.naukri.com/seo-jobs',
    keywords: 'seo, sem, search engine optimisation, ppc, google ads, organic search',
  },
  {
    label: 'Naukri — Performance Marketing',
    url:  'https://www.naukri.com/performance-marketing-jobs',
    keywords: 'performance marketing, paid media, google ads, facebook ads, meta ads, programmatic, roas, cpa',
  },
  {
    label: 'Naukri — Social Media Marketing',
    url:  'https://www.naukri.com/social-media-marketing-jobs',
    keywords: 'social media marketing, instagram, facebook, content, community manager, influencer',
  },
  {
    label: 'Naukri — Marketing Manager / Exec',
    url:  'https://www.naukri.com/marketing-manager-jobs',
    keywords: 'marketing manager, marketing executive, marketing lead, brand manager, campaign manager',
  },
  {
    label: 'Naukri — Content Marketing',
    url:  'https://www.naukri.com/content-marketing-jobs',
    keywords: 'content marketing, content writer, content strategist, copywriter, seo content',
  },
  {
    label: 'Naukri — Growth Marketing',
    url:  'https://www.naukri.com/growth-marketing-jobs',
    keywords: 'growth marketing, growth hacking, user acquisition, retention, lifecycle, crm',
  },
  {
    label: 'Naukri — Email / CRM Marketing',
    url:  'https://www.naukri.com/email-marketing-jobs',
    keywords: 'email marketing, lifecycle, crm, marketing automation, klaviyo, mailchimp, hubspot',
  },
  {
    label: 'Naukri — Digital Marketing (Bangalore)',
    url:  'https://www.naukri.com/digital-marketing-jobs-in-bangalore',
    keywords: 'digital marketing, seo, sem, performance marketing, social media, growth',
  },
  {
    label: 'Naukri — Digital Marketing (Mumbai)',
    url:  'https://www.naukri.com/digital-marketing-jobs-in-mumbai',
    keywords: 'digital marketing, seo, sem, performance marketing, social media, brand',
  },
  {
    label: 'Naukri — Digital Marketing (Delhi NCR)',
    url:  'https://www.naukri.com/digital-marketing-jobs-in-delhi-ncr',
    keywords: 'digital marketing, seo, sem, performance marketing, social media, brand',
  },

  // ── Foundit (ex-Monster India, 5 pages × 30 = 150 per source) ───────────
  {
    label: 'Foundit — Digital Marketing',
    url:  'https://www.foundit.in/srp/results?query=digital+marketing&locations=India',
    keywords: 'digital marketing, seo, sem, ppc, social media, content, email',
  },
  {
    label: 'Foundit — SEO / SEM',
    url:  'https://www.foundit.in/srp/results?query=seo+sem&locations=India',
    keywords: 'seo, sem, ppc, google ads, search engine, organic, paid search',
  },
  {
    label: 'Foundit — Performance Marketing',
    url:  'https://www.foundit.in/srp/results?query=performance+marketing&locations=India',
    keywords: 'performance marketing, paid media, google ads, facebook ads, roas',
  },
  {
    label: 'Foundit — Social Media / Content',
    url:  'https://www.foundit.in/srp/results?query=social+media+marketing&locations=India',
    keywords: 'social media marketing, instagram, facebook, reels, content, influencer',
  },

  // ── Internshala (structured adapter) ────────────────────────────────────
  {
    label: 'Internshala — Digital Marketing',
    url:  'https://internshala.com/jobs/digital-marketing-jobs/',
    keywords: 'digital marketing, seo, social media, content, email, ppc',
  },
  {
    label: 'Internshala — Marketing',
    url:  'https://internshala.com/jobs/marketing-jobs/',
    keywords: 'marketing, brand, growth, content, campaign, social media',
  },

  // ── Remote OK (public JSON API) ──────────────────────────────────────────
  {
    label: 'Remote OK — Marketing',
    url:  'https://remoteok.com/api?tags=marketing',
    keywords: 'marketing, digital marketing, seo, growth, performance',
  },
  {
    label: 'Remote OK — SEO',
    url:  'https://remoteok.com/api?tags=seo',
    keywords: 'seo, sem, content, organic search',
  },

  // ── Remotive (public JSON API) ──────────────────────────────────────────
  {
    label: 'Remotive — Marketing (remote)',
    url:  'https://remotive.com/api/remote-jobs?category=marketing',
    keywords: 'marketing, digital marketing, growth, content, social media',
  },
  {
    label: 'Remotive — Digital Marketing (remote)',
    url:  'https://remotive.com/api/remote-jobs?search=digital+marketing',
    keywords: 'digital marketing, seo, social media, performance, email',
  },

  // ── Indeed India (AI-extracted HTML) ────────────────────────────────────
  {
    label: 'Indeed IN — Digital Marketing',
    url:  'https://in.indeed.com/jobs?q=digital+marketing&l=India',
    keywords: 'digital marketing, seo, sem, ppc, social media, content, email',
  },
  {
    label: 'Indeed IN — Performance Marketing',
    url:  'https://in.indeed.com/jobs?q=performance+marketing&l=India',
    keywords: 'performance marketing, paid media, google ads, facebook ads, roas',
  },
]

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n📍 DB:   ${process.env.DATABASE_URL}`)
  console.log(`👤 User: ${USER_ID}`)
  console.log(`📋 Sources to process: ${SOURCES.length}\n`)

  // Existing sources for this user
  const existingRows = await db.select({ id: jobSources.id, url: jobSources.url })
    .from(jobSources).where(eq(jobSources.userId, USER_ID))
  const existingByUrl = new Map(existingRows.map((r) => [r.url, r.id]))
  console.log(`   Existing sources in DB: ${existingRows.length}`)

  // Upsert: insert new, reset lastFetchedAt on existing so first-fetch budget applies
  const toFetch: number[] = []

  for (const src of SOURCES) {
    const existingId = existingByUrl.get(src.url)
    if (existingId) {
      await db.update(jobSources)
        .set({ lastFetchedAt: null, active: true })
        .where(eq(jobSources.id, existingId))
      toFetch.push(existingId)
      console.log(`   ⏩ Reset (first-fetch mode): ${src.label}`)
    } else {
      const rows = await db.insert(jobSources).values({
        userId:         USER_ID,
        label:          src.label,
        url:            src.url,
        keywords:       src.keywords,
        active:         true,
        lastFetchedAt:  null,
        lastStatus:     '',
        lastError:      '',
      }).returning({ id: jobSources.id })
      if (!rows[0]) { console.log(`   ⚠️  Insert returned no id for ${src.label}`); continue }
      toFetch.push(rows[0].id)
      console.log(`   ✅ Added: ${src.label}`)
    }
  }

  console.log(`\n🚀 Fetching ${toFetch.length} sources…\n`)

  let totalAdded = 0, totalSkipped = 0, errors = 0

  for (const sourceId of toFetch) {
    const [source] = await db.select().from(jobSources).where(eq(jobSources.id, sourceId))
    if (!source) continue

    process.stdout.write(`   ⏳ ${source.label.padEnd(50, ' ')} `)
    const t0 = Date.now()
    try {
      const r = await tickSource(source)
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      if (r.status === 'error' || r.status === 'fetch-failed') {
        errors++
        console.log(`❌  [${r.status}] ${r.error ?? ''} (${elapsed}s)`)
      } else {
        totalAdded   += r.added
        totalSkipped += r.skipped
        console.log(`+${String(r.added).padStart(3)} new  ${String(r.skipped).padStart(3)} stale  (${elapsed}s)`)
      }
    } catch (e) {
      errors++
      console.log(`💥  ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Count "new" marketing leads now in DB (fast approximate via raw SQL)
  const countResult = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(jobLeads)
    .where(and(eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new')))
  const totalNew = Number(countResult[0]?.n ?? 0)

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✨  Seed complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Sources processed : ${toFetch.length}
 New leads added   : ${totalAdded}
 Stale skipped     : ${totalSkipped}
 Errors            : ${errors}
 Total "new" in DB : ${totalNew}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)

  if (totalNew < 500) {
    console.log('⚠️  Under 500 leads total. Possible causes:')
    console.log('   • Naukri or Foundit returned 0 (API blocked — try again in ~1 hour)')
    console.log('   • Most available leads are >15 days old (stale-skipped)')
    console.log('   • Run the script again — rate-limits reset after a few minutes')
  } else {
    console.log('🎉  500+ new leads ready — open /jobs to triage!')
  }
}

main().catch((e) => { console.error('\n💥 Fatal error:', e); process.exit(1) })
