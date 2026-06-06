/**
 * Seed curated job sources for a given user.
 * Deletes ALL existing sources + leads for that user, then inserts
 * 50 job-board search URLs and 50 company career pages.
 *
 * Usage:
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... \
 *   npx tsx scripts/seed-job-sources.ts surya.l@edstellar.com
 *
 * After this script completes, run pull-jobs-now.ts to fetch the first batch:
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... GROQ_API_KEY=gsk_... \
 *   npx tsx scripts/pull-jobs-now.ts
 */
import { createClient } from '@libsql/client'

const DB_URL   = process.env.DATABASE_URL!
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN!
if (!DB_URL || !DB_TOKEN) { console.error('DATABASE_URL and TURSO_AUTH_TOKEN required'); process.exit(1) }

const email = (process.argv[2] ?? '').toLowerCase().trim()
if (!email) { console.error('Usage: npx tsx scripts/seed-job-sources.ts <email>'); process.exit(1) }

const client = createClient({ url: DB_URL, authToken: DB_TOKEN })

// ── Source definitions ─────────────────────────────────────────────────────
// Each entry: [label, url, keywords]
// Roles: SEO, Performance Marketing, Digital Marketing, Growth Marketing, SEM/Google Ads
// Cities: Bangalore, Chennai (with some remote/India-wide)

const JOB_BOARD_SOURCES: Array<[string, string, string]> = [
  // ── Naukri (JSON API — highest volume, best IN coverage) ──────────────────
  ['Naukri — SEO Jobs Bangalore',                 'https://www.naukri.com/seo-jobs-in-bangalore',                       'SEO, search engine optimization'],
  ['Naukri — SEO Jobs Chennai',                   'https://www.naukri.com/seo-jobs-in-chennai',                         'SEO, search engine optimization'],
  ['Naukri — Digital Marketing Bangalore',        'https://www.naukri.com/digital-marketing-jobs-in-bangalore',         'digital marketing, marketing'],
  ['Naukri — Digital Marketing Chennai',          'https://www.naukri.com/digital-marketing-jobs-in-chennai',           'digital marketing, marketing'],
  ['Naukri — Performance Marketing Bangalore',    'https://www.naukri.com/performance-marketing-jobs-in-bangalore',     'performance marketing, paid media, SEM'],
  ['Naukri — Performance Marketing Chennai',      'https://www.naukri.com/performance-marketing-jobs-in-chennai',       'performance marketing, paid media'],
  ['Naukri — Growth Marketing Bangalore',         'https://www.naukri.com/growth-marketing-jobs-in-bangalore',          'growth marketing, growth hacking'],
  ['Naukri — Content Marketing Bangalore',        'https://www.naukri.com/content-marketing-jobs-in-bangalore',         'content marketing, content strategy'],
  ['Naukri — SEO Executive Bangalore',            'https://www.naukri.com/seo-executive-jobs-in-bangalore',             'SEO executive, on-page SEO, off-page SEO'],
  ['Naukri — SEM / Google Ads Bangalore',         'https://www.naukri.com/sem-jobs-in-bangalore',                       'SEM, Google Ads, PPC, paid search'],
  ['Naukri — Marketing Analyst Bangalore',        'https://www.naukri.com/marketing-analyst-jobs-in-bangalore',         'marketing analyst, data-driven marketing'],
  ['Naukri — Social Media Marketing Bangalore',   'https://www.naukri.com/social-media-marketing-jobs-in-bangalore',    'social media, Instagram, Facebook ads'],

  // ── Foundit / ex-Monster IN ───────────────────────────────────────────────
  ['Foundit — SEO Bangalore',                     'https://www.foundit.in/srp/results?query=seo&locations=bangalore',                         'SEO'],
  ['Foundit — Digital Marketing Bangalore',       'https://www.foundit.in/srp/results?query=digital+marketing&locations=bangalore',           'digital marketing'],
  ['Foundit — Performance Marketing Bangalore',   'https://www.foundit.in/srp/results?query=performance+marketing&locations=bangalore',       'performance marketing'],
  ['Foundit — SEO Chennai',                       'https://www.foundit.in/srp/results?query=seo&locations=chennai',                           'SEO'],
  ['Foundit — Digital Marketing Chennai',         'https://www.foundit.in/srp/results?query=digital+marketing&locations=chennai',             'digital marketing'],
  ['Foundit — Growth Marketing Bangalore',        'https://www.foundit.in/srp/results?query=growth+marketing&locations=bangalore',            'growth marketing'],
  ['Foundit — SEO Executive Bangalore',           'https://www.foundit.in/srp/results?query=seo+executive&locations=bangalore',              'SEO executive'],

  // ── Indeed India ──────────────────────────────────────────────────────────
  ['Indeed IN — SEO Bangalore',                   'https://in.indeed.com/jobs?q=seo+analyst&l=Bangalore',                  'SEO, search engine optimization'],
  ['Indeed IN — Digital Marketing Bangalore',     'https://in.indeed.com/jobs?q=digital+marketing&l=Bangalore',            'digital marketing'],
  ['Indeed IN — Performance Marketing Bangalore', 'https://in.indeed.com/jobs?q=performance+marketing&l=Bangalore',        'performance marketing, paid media'],
  ['Indeed IN — SEO Chennai',                     'https://in.indeed.com/jobs?q=seo&l=Chennai',                            'SEO'],
  ['Indeed IN — Digital Marketing Chennai',       'https://in.indeed.com/jobs?q=digital+marketing+executive&l=Chennai',    'digital marketing'],
  ['Indeed IN — Growth Marketing Bangalore',      'https://in.indeed.com/jobs?q=growth+marketing&l=Bangalore',             'growth marketing'],

  // ── Cutshort (startup & funded companies) ────────────────────────────────
  ['Cutshort — SEO Bangalore',                    'https://cutshort.io/jobs?search=seo&location=bangalore',                'SEO'],
  ['Cutshort — Digital Marketing Bangalore',      'https://cutshort.io/jobs?search=digital+marketing&location=bangalore',  'digital marketing'],
  ['Cutshort — Performance Marketing Bangalore',  'https://cutshort.io/jobs?search=performance+marketing&location=bangalore', 'performance marketing'],
  ['Cutshort — Growth Marketing Bangalore',       'https://cutshort.io/jobs?search=growth+marketing&location=bangalore',   'growth marketing'],

  // ── Shine ─────────────────────────────────────────────────────────────────
  ['Shine — SEO Bangalore',                       'https://www.shine.com/job-search/seo-jobs-in-bangalore',                'SEO'],
  ['Shine — Digital Marketing Bangalore',         'https://www.shine.com/job-search/digital-marketing-jobs-in-bangalore',  'digital marketing'],
  ['Shine — SEO Chennai',                         'https://www.shine.com/job-search/seo-jobs-in-chennai',                  'SEO'],

  // ── Instahyre ─────────────────────────────────────────────────────────────
  ['Instahyre — Digital Marketing Bangalore',     'https://www.instahyre.com/search-jobs/?q=digital+marketing&l=Bangalore', 'digital marketing'],
  ['Instahyre — SEO Bangalore',                   'https://www.instahyre.com/search-jobs/?q=seo&l=Bangalore',               'SEO'],

  // ── iimjobs (MBA/senior roles) ────────────────────────────────────────────
  ['iimjobs — Marketing Bangalore',               'https://www.iimjobs.com/search?searchTerm=marketing&loc=bangalore',     'marketing, growth, digital'],
  ['iimjobs — Performance Marketing Bangalore',   'https://www.iimjobs.com/search?searchTerm=performance+marketing',       'performance marketing'],

  // ── Wellfound / AngelList ─────────────────────────────────────────────────
  ['Wellfound — Marketing Bangalore',             'https://wellfound.com/jobs?role=marketing&location=bangalore%2C+karnataka%2C+india',   'marketing, growth, digital'],
  ['Wellfound — Growth Bangalore',                'https://wellfound.com/jobs?role=growth&location=bangalore%2C+karnataka%2C+india',      'growth marketing, growth hacking'],

  // ── Internshala Jobs (not internships — the /jobs section) ───────────────
  ['Internshala — Digital Marketing Jobs',        'https://internshala.com/jobs/digital-marketing-jobs/',                 'digital marketing'],
  ['Internshala — Performance Marketing Jobs',    'https://internshala.com/jobs/performance-marketing-jobs/',             'performance marketing'],
  ['Internshala — SEO Jobs',                      'https://internshala.com/jobs/seo-jobs/',                               'SEO'],

  // ── Talent.com ────────────────────────────────────────────────────────────
  ['Talent.com — SEO Bangalore',                  'https://www.talent.com/jobs?k=seo&l=bangalore',                        'SEO'],
  ['Talent.com — Performance Marketing Bangalore','https://www.talent.com/jobs?k=performance+marketing&l=bangalore',      'performance marketing'],

  // ── Remotive API (remote, no AI cost) ─────────────────────────────────────
  ['Remotive — Digital Marketing (remote)',       'https://remotive.com/api/remote-jobs?search=digital+marketing',        'digital marketing'],
  ['Remotive — SEO (remote)',                     'https://remotive.com/api/remote-jobs?search=seo',                      'SEO'],

  // ── Remote OK API (remote, no AI cost) ────────────────────────────────────
  ['Remote OK — Marketing (remote)',              'https://remoteok.com/api?tags=marketing',                              'marketing'],
  ['Remote OK — SEO (remote)',                    'https://remoteok.com/api?tags=seo',                                    'SEO'],

  // ── TimesJobs ─────────────────────────────────────────────────────────────
  ['TimesJobs — Digital Marketing Bangalore',     'https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords=digital+marketing&txtLocation=bangalore', 'digital marketing'],
  ['TimesJobs — SEO Bangalore',                   'https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords=seo&txtLocation=bangalore', 'SEO'],
]

// Top 50 companies: MNCs, Unicorns/Startups, Marketing Agencies
// Using public ATS APIs (Greenhouse, Lever, Ashby) where known — adapter fires
// automatically. Falls through to JSON-LD/AI for own-ATS companies.
const COMPANY_SOURCES: Array<[string, string, string]> = [
  // ── Greenhouse-hosted (boards-api adapter) ────────────────────────────────
  ['Freshworks Careers',        'https://boards.greenhouse.io/freshworks',        'marketing, SEO, digital marketing, growth'],
  ['Meesho Careers',            'https://boards.greenhouse.io/meesho',            'marketing, growth, digital'],
  ['Groww Careers',             'https://boards.greenhouse.io/groww',             'marketing, growth, digital marketing'],
  ['PhonePe Careers',           'https://boards.greenhouse.io/phonepe',           'marketing, digital, growth'],
  ['ShareChat Careers',         'https://boards.greenhouse.io/sharechat',         'marketing, digital marketing, growth'],
  ['Unacademy Careers',         'https://boards.greenhouse.io/unacademy',         'marketing, growth, digital'],
  ['OYO Careers',               'https://boards.greenhouse.io/oyo',               'marketing, digital, performance'],
  ['Chargebee Careers',         'https://boards.greenhouse.io/chargebee',         'marketing, content, demand generation'],
  ['Nykaa Careers',             'https://boards.greenhouse.io/nykaa',             'marketing, digital, SEO, performance'],
  ['BrowserStack Careers',      'https://boards.greenhouse.io/browserstack',      'marketing, content, demand gen'],
  ['Lenskart Careers',          'https://boards.greenhouse.io/lenskart',          'marketing, digital, ecommerce'],
  ['Zepto Careers',             'https://boards.greenhouse.io/zepto',             'marketing, growth, performance'],
  ['Postman Careers',           'https://boards.greenhouse.io/postman',           'marketing, content, demand generation'],
  ['Dunzo Careers',             'https://boards.greenhouse.io/dunzo',             'marketing, growth, digital'],
  ['PolicyBazaar Careers',      'https://boards.greenhouse.io/policybazaar',      'marketing, digital, performance, SEO'],
  ['upGrad Careers',            'https://boards.greenhouse.io/upgrad',            'marketing, growth, digital'],
  ['CleverTap Careers',         'https://boards.greenhouse.io/clevertap',         'marketing, content, demand gen, SEO'],
  ['MakeMyTrip Careers',        'https://boards.greenhouse.io/makemytrip',        'marketing, digital, SEO, performance'],
  ['InMobi Careers',            'https://boards.greenhouse.io/inmobi',            'marketing, digital, performance'],
  ['Darwinbox Careers',         'https://boards.greenhouse.io/darwinbox',         'marketing, demand gen, content'],

  // ── Lever-hosted (lever adapter) ─────────────────────────────────────────
  ['Swiggy Careers',            'https://jobs.lever.co/swiggy',                   'marketing, digital, brand, growth'],
  ['Razorpay Careers',          'https://jobs.lever.co/razorpay',                 'marketing, growth, digital, content'],
  ['CRED Careers',              'https://jobs.lever.co/cred',                     'marketing, brand, digital, growth'],
  ['MoEngage Careers',          'https://jobs.lever.co/moengage',                 'marketing, digital, content, SEO, demand gen'],
  ['Zomato Careers',            'https://jobs.lever.co/zomato',                   'marketing, brand, performance, digital'],
  ['Myntra Careers',            'https://jobs.lever.co/myntra',                   'marketing, digital, SEO, performance, ecommerce'],
  ['Publicis Sapient Careers',  'https://jobs.lever.co/publicissapient',          'marketing, digital, SEO, performance, content'],
  ['WebEngage Careers',         'https://jobs.lever.co/webengage',                'marketing, content, demand gen, SEO'],
  ['Urban Company Careers',     'https://jobs.lever.co/urbanclap',                'marketing, growth, digital'],
  ['BharatPe Careers',          'https://jobs.lever.co/bharatpe',                 'marketing, digital, growth'],

  // ── Ashby-hosted (cleanest salary data) ───────────────────────────────────
  ['Keka HR Careers',           'https://jobs.ashbyhq.com/keka',                  'marketing, content, demand gen'],
  ['Setu Careers',              'https://jobs.ashbyhq.com/setu',                  'marketing, growth, digital'],
  ['Khatabook Careers',         'https://jobs.ashbyhq.com/khatabook',             'marketing, digital, growth'],

  // ── SmartRecruiters (smartrecruiters adapter) ─────────────────────────────
  ['Nykaa SmartRecruiters',     'https://careers.smartrecruiters.com/Nykaa',      'marketing, digital, SEO, performance'],
  ['Kotak Careers',             'https://careers.smartrecruiters.com/KotakMahindraGroup', 'marketing, digital, brand'],

  // ── Own ATS / HTML → JSON-LD / AI fallback ────────────────────────────────
  ['Google India Careers',      'https://careers.google.com/jobs/results/?company=Google&location=Bangalore,+Karnataka,+India&q=marketing', 'marketing, SEO, digital, growth'],
  ['Amazon India Jobs',         'https://www.amazon.jobs/en/search?base_query=digital+marketing&loc_query=India', 'digital marketing, performance, SEO'],
  ['Microsoft India Careers',   'https://jobs.microsoft.com/en/search?q=marketing&l=Bangalore',                   'marketing, digital, content, SEO'],
  ['Adobe India Careers',       'https://careers.adobe.com/us/en/search-results?keywords=marketing&location=Bangalore', 'marketing, digital, content, SEO'],
  ['SAP India Careers',         'https://jobs.sap.com/search/?q=marketing&locname=Bengaluru%2C+Karnataka%2C+India', 'marketing, digital, content'],
  ['Infosys Careers',           'https://career.infosys.com/joblist?industryId=&jobId=&joblevels=&location=IN&skill=marketing&stype=L', 'marketing, digital, SEO'],
  ['Wipro Careers',             'https://careers.wipro.com/careers-home/jobs?page=1&query=marketing&location=Bangalore', 'marketing, digital, content'],
  ['Flipkart Careers',          'https://www.flipkartcareers.com/#!/joblist',                                      'marketing, digital, SEO, performance, ecommerce'],
  ['Ola Careers',               'https://www.olacabs.com/careers',                                                 'marketing, digital, growth, performance'],

  // ── Marketing Agencies ────────────────────────────────────────────────────
  ['Dentsu India Careers',      'https://www.dentsu.com/in/en/careers',                                           'digital marketing, SEO, performance, media planning'],
  ['Ogilvy India Careers',      'https://www.ogilvy.com/careers',                                                  'digital marketing, content, brand, SEO'],
  ['Wunderman Thompson India',  'https://www.vml.com/careers',                                                     'digital marketing, SEO, performance, content'],
  ['iProspect India Careers',   'https://www.iprospect.com/en/in/about-us/careers/',                              'SEO, SEM, performance, digital marketing'],
  ['WATConsult Careers',        'https://www.watconsult.com/careers',                                             'digital marketing, social media, SEO, performance'],
  ['Performics India Careers',  'https://performics.com/careers/',                                                 'SEO, performance marketing, SEM, analytics'],
]

// ── Helpers ────────────────────────────────────────────────────────────────

function now() { return Date.now() }

async function main() {
  // Find user
  const userRes = await client.execute({ sql: 'SELECT id FROM users WHERE lower(email) = ?', args: [email] })
  if (!userRes.rows.length) { console.error(`User not found: ${email}`); process.exit(1) }
  const userId = String(userRes.rows[0]![0])
  console.log(`Found user: ${userId} (${email})\n`)

  // Delete all existing leads then sources (FK order)
  const leadDel = await client.execute({ sql: 'DELETE FROM job_leads WHERE user_id = ?', args: [userId] })
  console.log(`Deleted ${leadDel.rowsAffected} existing job leads`)
  const srcDel = await client.execute({ sql: 'DELETE FROM job_sources WHERE user_id = ?', args: [userId] })
  console.log(`Deleted ${srcDel.rowsAffected} existing job sources\n`)

  // Insert job board sources
  console.log(`Inserting ${JOB_BOARD_SOURCES.length} job-board search sources...`)
  let inserted = 0
  for (const [label, url, keywords] of JOB_BOARD_SOURCES) {
    await client.execute({
      sql: `INSERT INTO job_sources (user_id, label, url, keywords, active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [userId, label.slice(0, 120), url.slice(0, 500), keywords.slice(0, 400), now()],
    })
    inserted++
    process.stdout.write('.')
  }
  console.log(`\n✓ ${inserted} job-board sources inserted`)

  // Insert company career sources
  console.log(`\nInserting ${COMPANY_SOURCES.length} company career sources...`)
  inserted = 0
  for (const [label, url, keywords] of COMPANY_SOURCES) {
    await client.execute({
      sql: `INSERT INTO job_sources (user_id, label, url, keywords, active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [userId, label.slice(0, 120), url.slice(0, 500), keywords.slice(0, 400), now()],
    })
    inserted++
    process.stdout.write('.')
  }
  console.log(`\n✓ ${inserted} company career sources inserted`)

  const total = await client.execute({ sql: 'SELECT COUNT(*) FROM job_sources WHERE user_id = ?', args: [userId] })
  console.log(`\n✅ Done. Total active sources for ${email}: ${total.rows[0]?.[0] ?? '?'}`)
  console.log('\nNext step: run pull-jobs-now.ts to fetch the first batch of leads.')
}

main().catch((e) => { console.error(e); process.exit(1) })
