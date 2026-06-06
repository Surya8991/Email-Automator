/**
 * Add more job sources for a given user — ADD-ONLY mode.
 * Never deletes existing sources or leads.
 * Skips any URL that is already present in job_sources for this user.
 *
 * Usage:
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... \
 *   npx tsx scripts/add-more-sources.ts suryaraj8991@gmail.com
 */
import { createClient } from '@libsql/client'

const DB_URL   = process.env.DATABASE_URL!
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN!
if (!DB_URL || !DB_TOKEN) { console.error('DATABASE_URL and TURSO_AUTH_TOKEN required'); process.exit(1) }

const email = (process.argv[2] ?? '').toLowerCase().trim()
if (!email) { console.error('Usage: npx tsx scripts/add-more-sources.ts <email>'); process.exit(1) }

const client = createClient({ url: DB_URL, authToken: DB_TOKEN })

// ── Source definitions ─────────────────────────────────────────────────────
// Each entry: [label, url, keywords]

// ── Greenhouse companies (Indian startups/unicorns) ──────────────────────────
const GREENHOUSE_SOURCES: Array<[string, string, string]> = [
  ['[India] Delhivery Careers',              'https://boards.greenhouse.io/delhivery',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] BlackBuck Careers',              'https://boards.greenhouse.io/blackbuck',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Porter Careers',                 'https://boards.greenhouse.io/porter',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Zetwerk Careers',                'https://boards.greenhouse.io/zetwerk',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Moglix Careers',                 'https://boards.greenhouse.io/moglix',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Udaan Careers',                  'https://boards.greenhouse.io/udaan',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Ninjacart Careers',              'https://boards.greenhouse.io/ninjacart',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Practo Careers',                 'https://boards.greenhouse.io/practo',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Cure.fit Careers',               'https://boards.greenhouse.io/curefit',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] HealthifyMe Careers',            'https://boards.greenhouse.io/healthifyme',        'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] 1mg Careers',                    'https://boards.greenhouse.io/1mg',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] PharmEasy Careers',              'https://boards.greenhouse.io/pharmeasy',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Pristyn Care Careers',           'https://boards.greenhouse.io/pristyncare',        'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] mfine Careers',                  'https://boards.greenhouse.io/mfine',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Cleartrip Careers',              'https://boards.greenhouse.io/cleartrip',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] ixigo Careers',                  'https://boards.greenhouse.io/ixigo',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Treebo Careers',                 'https://boards.greenhouse.io/treebo',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] FabHotels Careers',              'https://boards.greenhouse.io/fabhotels',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Dailyhunt Careers',              'https://boards.greenhouse.io/dailyhunt',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Dream11 Careers',                'https://boards.greenhouse.io/dream11',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Games24x7 Careers',              'https://boards.greenhouse.io/games24x7',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] MPL Careers',                    'https://boards.greenhouse.io/mpl',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Nazara Technologies Careers',    'https://boards.greenhouse.io/nazara',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] WinZo Careers',                  'https://boards.greenhouse.io/winzo',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Junglee Games Careers',          'https://boards.greenhouse.io/junglee',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Sprinklr Careers',               'https://boards.greenhouse.io/sprinklr',           'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] MindTickle Careers',             'https://boards.greenhouse.io/mindtickle',         'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Whatfix Careers',                'https://boards.greenhouse.io/whatfix',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Druva Careers',                  'https://boards.greenhouse.io/druva',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Icertis Careers',                'https://boards.greenhouse.io/icertis',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Capillary Technologies Careers', 'https://boards.greenhouse.io/capillarytech',      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Zenoti Careers',                 'https://boards.greenhouse.io/zenoti',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] LeadSquared Careers',            'https://boards.greenhouse.io/leadsquared',        'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Rocketlane Careers',             'https://boards.greenhouse.io/rocketlane',         'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Netcore Cloud Careers',          'https://boards.greenhouse.io/netcorecloud',       'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Yellow.ai Careers',              'https://boards.greenhouse.io/yellowmessenger',    'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Haptik Careers',                 'https://boards.greenhouse.io/haptik',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Acko Careers',                   'https://boards.greenhouse.io/acko',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Digit Insurance Careers',        'https://boards.greenhouse.io/digit',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] KreditBee Careers',              'https://boards.greenhouse.io/kreditbee',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Slice Careers',                  'https://boards.greenhouse.io/slice',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Jupiter Careers',                'https://boards.greenhouse.io/jupiter',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Jar Careers',                    'https://boards.greenhouse.io/jar',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Cashfree Payments Careers',      'https://boards.greenhouse.io/cashfree',           'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Juspay Careers',                 'https://boards.greenhouse.io/juspay',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] M2P Fintech Careers',            'https://boards.greenhouse.io/m2pfintech',         'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Open Financial Technologies',    'https://boards.greenhouse.io/open',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Fibe Careers',                   'https://boards.greenhouse.io/fibe',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Turtlemint Careers',             'https://boards.greenhouse.io/turtlemint',         'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Pepperfry Careers',              'https://boards.greenhouse.io/pepperfry',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Mamaearth Careers',              'https://boards.greenhouse.io/mamaearth',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] mCaffeine Careers',              'https://boards.greenhouse.io/mcaffeine',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Loadshare Networks Careers',     'https://boards.greenhouse.io/loadshare',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Shipsy Careers',                 'https://boards.greenhouse.io/shipsy',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Vedantu Careers',                'https://boards.greenhouse.io/vedantu',            'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Scaler Careers',                 'https://boards.greenhouse.io/scaler',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] AlmaBetter Careers',             'https://boards.greenhouse.io/almabetter',         'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Imarticus Learning Careers',     'https://boards.greenhouse.io/imarticus',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Skill-Lync Careers',             'https://boards.greenhouse.io/skilllync',          'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Vymo Careers',                   'https://boards.greenhouse.io/vymo',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Kissflow Careers',               'https://boards.greenhouse.io/kissflow',           'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Hasura Careers',                 'https://boards.greenhouse.io/hasura',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] PayU Careers',                   'https://boards.greenhouse.io/payu',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Niyo Careers',                   'https://boards.greenhouse.io/niyo',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Recur Club Careers',             'https://boards.greenhouse.io/recur',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] CredAvenue Careers',             'https://boards.greenhouse.io/credavenue',         'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Rivigo Careers',                 'https://boards.greenhouse.io/rivigo',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Rapido Careers',                 'https://boards.greenhouse.io/rapido',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Yulu Careers',                   'https://boards.greenhouse.io/yulu',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Pocket52 Careers',               'https://boards.greenhouse.io/pocket52',           'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Stage Careers',                  'https://boards.greenhouse.io/stage',              'marketing, SEO, digital marketing, growth, performance, content'],
]

// ── Lever companies (Indian startups) ────────────────────────────────────────
const LEVER_SOURCES: Array<[string, string, string]> = [
  ['[India] Ola Careers',                    'https://jobs.lever.co/ola',                       'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Bounce Careers',                 'https://jobs.lever.co/bounce',                    'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Yatra Careers',                  'https://jobs.lever.co/yatra',                     'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Zostel Careers',                 'https://jobs.lever.co/zostel',                    'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Koo Careers',                    'https://jobs.lever.co/koo',                       'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Josh Careers',                   'https://jobs.lever.co/josh',                      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] LambdaTest Careers',             'https://jobs.lever.co/lambdatest',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Lambda School India Careers',    'https://jobs.lever.co/lambdaschool',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Apna Careers',                   'https://jobs.lever.co/apna',                      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Meesho Tech Careers',            'https://jobs.lever.co/meeshotech',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Nykaa Fashion Careers',          'https://jobs.lever.co/nykaa-fashion',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] PayMatrix Careers',              'https://jobs.lever.co/paymatrix',                 'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Ezetap Careers',                 'https://jobs.lever.co/ezetap',                    'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Niki Careers',                   'https://jobs.lever.co/niki',                      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Fresco Play Careers',            'https://jobs.lever.co/fresco',                    'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] boAt Careers',                   'https://jobs.lever.co/boat',                      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] WOW Skin Science Careers',       'https://jobs.lever.co/wowhuman',                  'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Plum Careers',                   'https://jobs.lever.co/plum',                      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Minimalist Careers',             'https://jobs.lever.co/minimalist',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] HealthKart Careers',             'https://jobs.lever.co/healthkart',                'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Apollo 24|7 Careers',            'https://jobs.lever.co/apollo247',                 'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Aster DM Healthcare Careers',    'https://jobs.lever.co/astermedcity',              'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Blackberrys Careers',            'https://jobs.lever.co/blackberrys',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Pristyn Care Careers (Lever)',   'https://jobs.lever.co/pristyn',                   'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Ninjacart Tech Careers',         'https://jobs.lever.co/ninjacarttech',             'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Rapido Careers (Lever)',         'https://jobs.lever.co/rapido-bike',               'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Loadshare Networks (Lever)',     'https://jobs.lever.co/loadshare-networks',        'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Fortis Healthcare Careers',      'https://jobs.lever.co/fortis',                    'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] IIMJobs Careers',                'https://jobs.lever.co/iimjobs',                   'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Cutshort Careers',               'https://jobs.lever.co/cutshort',                  'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] DocPrime Careers',               'https://jobs.lever.co/docprime',                  'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Setu Careers (Lever)',           'https://jobs.lever.co/setu',                      'marketing, SEO, digital marketing, growth, performance, content'],
  ['[India] Niyo Solutions Careers',         'https://jobs.lever.co/niyo-solutions',            'marketing, SEO, digital marketing, growth, performance, content'],
]

// ── Ashby companies ───────────────────────────────────────────────────────────
const ASHBY_SOURCES: Array<[string, string, string]> = [
  ['[India] M2P Fintech Careers (Ashby)',    'https://jobs.ashbyhq.com/m2p',                    'marketing, SEO, digital, growth, content'],
  ['[India] Kredivo Careers',                'https://jobs.ashbyhq.com/kredivo',                'marketing, SEO, digital, growth, content'],
  ['[India] Open Financial Careers',         'https://jobs.ashbyhq.com/open-financial',         'marketing, SEO, digital, growth, content'],
  ['[India] Recko Careers',                  'https://jobs.ashbyhq.com/recko',                  'marketing, SEO, digital, growth, content'],
  ['[India] Hyperface Careers',              'https://jobs.ashbyhq.com/hyperface',              'marketing, SEO, digital, growth, content'],
  ['[India] Decentro Careers',               'https://jobs.ashbyhq.com/decentro',               'marketing, SEO, digital, growth, content'],
  ['[India] Skit.ai Careers',                'https://jobs.ashbyhq.com/skit-ai',                'marketing, SEO, digital, growth, content'],
  ['[India] Smallcase Careers',              'https://jobs.ashbyhq.com/smallcase',              'marketing, SEO, digital, growth, content'],
  ['[India] Freo Careers',                   'https://jobs.ashbyhq.com/freo',                   'marketing, SEO, digital, growth, content'],
  ['[India] Finbox Careers',                 'https://jobs.ashbyhq.com/finbox',                 'marketing, SEO, digital, growth, content'],
  ['[India] Fi Money Careers',               'https://jobs.ashbyhq.com/epifi',                  'marketing, SEO, digital, growth, content'],
  ['[India] Perfios Careers',                'https://jobs.ashbyhq.com/perfios',                'marketing, SEO, digital, growth, content'],
  ['[India] Signzy Careers',                 'https://jobs.ashbyhq.com/signzy',                 'marketing, SEO, digital, growth, content'],
  ['[India] Bureau Careers',                 'https://jobs.ashbyhq.com/bureau',                 'marketing, SEO, digital, growth, content'],
  ['[India] Ondo Finance Careers',           'https://jobs.ashbyhq.com/ondo',                   'marketing, SEO, digital, growth, content'],
]

// ── SmartRecruiters companies ────────────────────────────────────────────────
const SMARTRECRUITERS_SOURCES: Array<[string, string, string]> = [
  ['[India] Wipro Careers (SR)',             'https://careers.smartrecruiters.com/wipro',              'marketing, SEO, digital'],
  ['[India] Infosys Careers (SR)',           'https://careers.smartrecruiters.com/infosys',            'marketing, SEO, digital'],
  ['[India] HCL Technologies Careers',       'https://careers.smartrecruiters.com/hcltech',            'marketing, SEO, digital'],
  ['[India] Tech Mahindra Careers',          'https://careers.smartrecruiters.com/techm',              'marketing, SEO, digital'],
  ['[India] Mphasis Careers',                'https://careers.smartrecruiters.com/mphasis',            'marketing, SEO, digital'],
  ['[India] Hexaware Careers',               'https://careers.smartrecruiters.com/hexaware',           'marketing, SEO, digital'],
  ['[India] LTIMindtree Careers',            'https://careers.smartrecruiters.com/ltimindtree',        'marketing, SEO, digital'],
  ['[India] Persistent Systems Careers',     'https://careers.smartrecruiters.com/persistentsystems',  'marketing, SEO, digital'],
  ['[India] NielsenIQ India Careers',        'https://careers.smartrecruiters.com/nielseniq',          'marketing, SEO, digital'],
  ['[India] Amdocs Careers',                 'https://careers.smartrecruiters.com/amdocs',             'marketing, SEO, digital'],
  ['[India] Concentrix India Careers',       'https://careers.smartrecruiters.com/concentrix',         'marketing, SEO, digital'],
]

// ── RemoteOK tag-based API feeds ─────────────────────────────────────────────
const REMOTEOK_SOURCES: Array<[string, string, string]> = [
  ['[Remote] RemoteOK — Growth',             'https://remoteok.com/api?tags=growth',             'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Content',            'https://remoteok.com/api?tags=content',            'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Digital Marketing',  'https://remoteok.com/api?tags=digital-marketing',  'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Product Marketing',  'https://remoteok.com/api?tags=product-marketing',  'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Email Marketing',    'https://remoteok.com/api?tags=email-marketing',    'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Social Media',       'https://remoteok.com/api?tags=social-media',       'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Copywriting',        'https://remoteok.com/api?tags=copywriting',        'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Analytics',          'https://remoteok.com/api?tags=analytics',          'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Ecommerce',          'https://remoteok.com/api?tags=ecommerce',          'marketing, SEO, digital marketing, remote'],
  ['[Remote] RemoteOK — Ads / Paid',         'https://remoteok.com/api?tags=ads',                'marketing, SEO, digital marketing, remote'],
]

// ── Remotive search-based API feeds ──────────────────────────────────────────
const REMOTIVE_SOURCES: Array<[string, string, string]> = [
  ['[Remote] Remotive — Content Marketing',  'https://remotive.com/api/remote-jobs?search=content+marketing',   'content marketing, content strategy, copywriting'],
  ['[Remote] Remotive — Email Marketing',    'https://remotive.com/api/remote-jobs?search=email+marketing',    'email marketing, CRM, lifecycle'],
  ['[Remote] Remotive — Product Marketing',  'https://remotive.com/api/remote-jobs?search=product+marketing',  'product marketing, PMM, GTM'],
  ['[Remote] Remotive — Growth',             'https://remotive.com/api/remote-jobs?search=growth',             'growth marketing, growth hacking, acquisition'],
  ['[Remote] Remotive — Growth Hacking',     'https://remotive.com/api/remote-jobs?search=growth+hacking',     'growth hacking, viral, acquisition, retention'],
  ['[Remote] Remotive — Analytics',          'https://remotive.com/api/remote-jobs?search=analytics',          'analytics, data, marketing analytics, attribution'],
  ['[Remote] Remotive — Copywriting',        'https://remotive.com/api/remote-jobs?search=copywriting',        'copywriting, content, writing'],
  ['[Remote] Remotive — Social Media',       'https://remotive.com/api/remote-jobs?search=social+media',       'social media, Instagram, Facebook, Twitter'],
  ['[Remote] Remotive — Paid Ads',           'https://remotive.com/api/remote-jobs?search=paid+ads',           'paid ads, PPC, Google Ads, Facebook Ads'],
  ['[Remote] Remotive — Brand Marketing',    'https://remotive.com/api/remote-jobs?search=brand+marketing',    'brand marketing, brand strategy, brand management'],
]

// ── Free API / RSS boards ─────────────────────────────────────────────────────
const FREE_API_SOURCES: Array<[string, string, string]> = [
  ['[Remote] Arbeitnow — Marketing (remote)',      'https://www.arbeitnow.com/api/job-board-api?tags[]=marketing&remote=true',                                                'marketing, remote, no key needed, JSON API'],
  ['[Remote] Arbeitnow — SEO (remote)',            'https://www.arbeitnow.com/api/job-board-api?tags[]=seo&remote=true',                                                     'seo, remote, no key needed, JSON API'],
  ['[India] Jobicy — Marketing India-remote',      'https://jobicy.com/?feed=job_feed&job_categories=marketing&job_types=remote&search_region=india',                        'marketing, india, remote, rss feed, free'],
  ['[Remote] Jobicy — Marketing global-remote',    'https://jobicy.com/?feed=job_feed&job_categories=marketing&job_types=remote',                                            'marketing, global, remote, rss feed, free'],
  ['[Remote] Remotive API — Marketing category',   'https://remotive.com/api/remote-jobs?category=marketing&limit=50',                                                       'marketing, remotive, free, JSON'],
  ['[Remote] Remotive API — SEO search',           'https://remotive.com/api/remote-jobs?category=all&search=seo&limit=50',                                                  'seo, remotive, free, JSON'],
  ['[Remote] We Work Remotely — Marketing RSS',    'https://weworkremotely.com/categories/remote-marketing-jobs.rss',                                                        'marketing, rss, free, no key'],
  ['[Remote] We Work Remotely — All Jobs RSS',     'https://weworkremotely.com/remote-jobs.rss',                                                                             'all jobs, rss, free, no key'],
  ['[Remote] Himalayas — Marketing remote API',    'https://himalayas.app/jobs/api?categories=marketing&remote=true',                                                        'marketing, himalayas, remote, JSON'],
  ['[Remote] RemoteLeaf — RSS Feed',               'https://www.remoteleaf.com/feed/',                                                                                      'remote, rss, marketing, seo, free'],
  ['[Remote] Nodesk — Marketing Remote RSS',       'https://nodesk.co/remote-jobs/marketing/feed/',                                                                         'marketing, nodesk, rss, free'],
  ['[Remote] Startup.jobs — Marketing remote API', 'https://startup.jobs/api/jobs?remote=true&tags=marketing',                                                              'startup, marketing, remote, free, JSON'],
]

// ── Helpers ────────────────────────────────────────────────────────────────

function now() { return Date.now() }

async function urlExists(userId: string, url: string): Promise<boolean> {
  const res = await client.execute({
    sql: 'SELECT COUNT(*) FROM job_sources WHERE user_id = ? AND url = ?',
    args: [userId, url],
  })
  return Number(res.rows[0]?.[0] ?? 0) > 0
}

async function insertBatch(
  userId: string,
  sources: Array<[string, string, string]>,
  groupLabel: string,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0
  console.log(`\nInserting ${sources.length} ${groupLabel} sources...`)
  for (const [label, url, keywords] of sources) {
    const exists = await urlExists(userId, url)
    if (exists) {
      skipped++
      process.stdout.write('s')
      continue
    }
    await client.execute({
      sql: `INSERT INTO job_sources (user_id, label, url, keywords, active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [userId, label.slice(0, 120), url.slice(0, 500), keywords.slice(0, 400), now()],
    })
    inserted++
    process.stdout.write('.')
  }
  console.log(`\n  + ${inserted} inserted, ${skipped} skipped (already exist)`)
  return { inserted, skipped }
}

async function main() {
  // Find user
  const userRes = await client.execute({ sql: 'SELECT id FROM users WHERE lower(email) = ?', args: [email] })
  if (!userRes.rows.length) { console.error(`User not found: ${email}`); process.exit(1) }
  const userId = String(userRes.rows[0]![0])
  console.log(`Found user: ${userId} (${email})`)

  const before = await client.execute({ sql: 'SELECT COUNT(*) FROM job_sources WHERE user_id = ?', args: [userId] })
  console.log(`Current source count: ${before.rows[0]?.[0] ?? 0}`)
  console.log('\n[.] = inserted   [s] = skipped (duplicate)\n')

  let totalInserted = 0
  let totalSkipped = 0

  const groups: Array<[Array<[string, string, string]>, string]> = [
    [GREENHOUSE_SOURCES,     'Greenhouse (Indian companies)'],
    [LEVER_SOURCES,          'Lever (Indian companies)'],
    [ASHBY_SOURCES,          'Ashby (Indian fintech/SaaS)'],
    [SMARTRECRUITERS_SOURCES,'SmartRecruiters (Indian IT/MNC)'],
    [REMOTEOK_SOURCES,       'RemoteOK tag feeds'],
    [REMOTIVE_SOURCES,       'Remotive search feeds'],
    [FREE_API_SOURCES,       'Free API / RSS boards'],
  ]

  for (const [sources, label] of groups) {
    const { inserted, skipped } = await insertBatch(userId, sources, label)
    totalInserted += inserted
    totalSkipped  += skipped
  }

  const after = await client.execute({ sql: 'SELECT COUNT(*) FROM job_sources WHERE user_id = ?', args: [userId] })
  console.log('\n' + '='.repeat(60))
  console.log(`Done!`)
  console.log(`  Newly inserted : ${totalInserted}`)
  console.log(`  Skipped (dups) : ${totalSkipped}`)
  console.log(`  Total sources  : ${after.rows[0]?.[0] ?? '?'}`)
  console.log('='.repeat(60))
  console.log('\nNext step: run pull-jobs-now.ts to fetch leads from the new sources.')
}

main().catch((e) => { console.error(e); process.exit(1) })
