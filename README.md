# 📬 Email Automator

A self-hosted email outreach tool. Templates with variables, multi-step
campaigns, open/click tracking, AI-assisted writing (Groq), per-user
multi-tenant isolation, full audit log, JSON API + webhooks.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict
· Tailwind + shadcn-style UI · Drizzle ORM on SQLite (better-sqlite3 local /
Turso on Vercel) · Auth.js v5 (Google + magic link) · Groq (Llama 3.3) · Pino
structured logging.

📖 **[Complete feature list →](FEATURES.md)**
🤖 **[Working with AI agents on this repo →](AGENTS.md)**

---

## 🚀 Deploying to Vercel?

Open **[`SETUP.html`](SETUP.html)** in your browser — a one-page interactive
checklist that walks you through every step (Gmail App Password, Turso DB,
Vercel env vars, deploy, post-deploy verify). Ticks persist in localStorage.

---

## TL;DR — run locally

```bash
cp .env.example .env             # edit AUTH_SECRET, SMTP_*, etc.
npm install --legacy-peer-deps
npm run db:migrate
npm run dev                      # http://localhost:3000
# in another shell:
npm run worker                   # background scheduler / campaign advancer
```

For one-click dev sign-in (no SMTP), set in `.env`:

```
ALLOW_DEV_SIGNIN=true
DEV_BYPASS_EMAILS=test@gmail.com
```

You'll get a "Sign in as test@gmail.com (dev)" button on the login page.
**Turn this off before sharing the instance.**

---

## Features

For the comprehensive list see **[FEATURES.md](FEATURES.md)**. The high-level surface:

| Page | What it does |
|---|---|
| `/dashboard` | KPIs · **"Next send" card** (when + to whom) · recent activity with contact + campaign/step badges · onboarding when empty |
| `/contacts` | CRUD · CSV/Excel import **with SSE progress bar** · per-row error report · per-page select-all + bulk actions (**Create drafts for selected**, Add/Remove tag, Reset status, Block, Delete) · **Dedupe / Delete matching / Delete all** toolbar · **page-size selector (50/100/500/1000)** · 6 filters (search + tag + status + company + location + platform) · per-row follow-up · per-contact custom-field inputs · timeline modal |
| `/templates` | Public starter set (5 generic) auto-seeded for every user; **admin overlay (23 personalised)** seeded only for ADMIN_EMAILS addresses · sidebar search + category filter · live preview · A/B subject · AI Improve (Groq) · **Clone** · clickable variable + HTML-snippet palette + user-declared custom fields · `{{var\|fallback}}` syntax for empty values |
| `/drafts` | Bulk create with SSE progress · **rich-text editor with HTML source toggle** · per-row select + Send selected / **Discard selected / Discard all** · **AI Improve per draft (admin-only)** · duplicate-send confirmation (last 7 days) · per-draft follow-up scheduler · search by recipient/subject |
| `/schedule` | 5 recurring presets · configurable min/max gap · preview with spacing · queue search + status filter · select-to-cancel · per-row attempts + last-result · retry tinting · **per-row body preview (Eye)** · **per-row AI Improve (admin)** rewriting the queued body in place |
| `/campaigns` | Multi-step sequences · per-step delay + stop-on-reply · **step-level performance** (sent/open/click/reply/advanced %) · enroll by tag · search + status filter · **per-step body preview (Eye)** · **per-step AI Improve (admin)** rewriting the underlying template |
| `/analytics` | 30-day KPIs · 14-day chart · breakdowns **by template / campaign / tag** (top 10) · **send-time heatmap** (7×24 IST grid) |
| `/blocklist` | Per-user + global · single-add + **bulk paste-add** · **row checkboxes + Remove selected** · search + type filter · auto-block on unsubscribe |
| `/audit` | Last 500 actions · search + action filter + **date range** · CSV export · **`?scope=all` cross-user view for admins** with User column + Mine/All toggle |
| `/diagnostic` | SMTP · AI · OAuth · DNS · SPF · DMARC · **MX** checks · per-row retry · provider-domain whitelist (no DMARC false-positives on gmail.com etc.) |
| `/profile` | Name, phone, company, role, LinkedIn, signature (Gmail import), unsub text |
| `/settings` | 8 tabs: General (TZ, throttle, domain caps, custom fields, pause-all) · Email · AI · Auth · API keys · Webhooks · Data · Danger |
| `/admin` | **System-wide stats card** (Users/Contacts/Templates/Drafts/Sent 30d/Active campaigns) · **Runtime configuration card** (env values, secrets shown as set/unset only) · **Bulk import contacts card** (XLSX/CSV upload with SSE progress) · **Retention card** with Purge-now (scheduler runs daily auto-purge) · admin emails list · per-user stats · search + filter (Active/Suspended/Admins) · **per-row checkbox + bulk Suspend / Resume** · single Suspend/Resume · Delete · streamed users CSV export (`/api/admin/users/export`) · full DB backup |
| `/guide` | In-app 17-section manual |
| `/readme` | Public landing page (no login required) |

**API:** `/api/v1/contacts` (GET, POST) — Bearer auth via API keys created in Settings → API keys. Keys carry **scopes** (`read:contacts`, `write:contacts`); routes reject calls missing the required scope with 403. `/api/audit/export` streams the full audit log (admins can pass `?scope=all`). `/api/progress/poll` is a polling fallback for SSE so progress works across Vercel Lambdas. `/api/admin/users/export` (admin) streams a users CSV. `/api/backup` (admin, audit-logged) dumps the whole DB.

**Webhooks:** outbound POSTs on `sent / open / click / reply / bounce / unsubscribe` events with HMAC-SHA256 signatures (`X-EA-Signature` header). Configure in Settings → Webhooks.

**Send safety:** per-user **daily limit** · **per-recipient throttle** (no double-tap from overlapping campaigns) · **per-domain daily cap** (defer over-cap rows by 1h, don't get flagged as a bulk sender) · **emergency Pause-all** kill switch · per-user TZ (IST default, 13-option dropdown) · **mailer transport cache invalidates on SMTP save/clear** so credential rotations take effect immediately · scheduler-tick **atomic claim** prevents double-send across overlapping ticks.

**Onboarding:** First-time users see a 4-slide **onboarding modal** (Contacts → Templates → Drafts → Schedule/Campaigns). Dismissed once, persisted in `settings.ONBOARDING_SEEN_VERSION`; bump `ONBOARDING_CURRENT_VERSION` to re-show after a major UX change.

**Retention:** events + audit-log rows are auto-purged once per 24 h per user by the scheduler. Defaults: events 180 d, audit 365 d. Override per-user via `EVENTS_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS` settings, or hit "Purge now" on `/admin`.

**Error sanitization:** server actions log full errors through pino but never echo driver / DB internals to the client (`lib/action-error.ts`).

**Soft-block + unblock-restore:** Blocking a contact sets `emailStatus=BLOCKED` instead of deleting. The default contacts list hides BLOCKED rows. Removing the email from `/blocklist` restores the contact at the bottom of the list (`num = max + 1`).

---

## Project layout

```
.
├── app/                          # Next.js App Router
│   ├── (auth)/login/             # Google primary CTA + magic link + (dev) dev-signin
│   ├── (app)/                    # everything behind requireUser()
│   │   ├── dashboard/  contacts/  templates/  drafts/  dry-run/
│   │   ├── schedule/  campaigns/  analytics/  blocklist/  audit/
│   │   ├── diagnostic/  profile/  settings/  guide/  admin/
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── cron/tick/            # /api/cron/tick — GitHub Actions cron target
│       ├── dev-signin/           # opt-in dev session (ALLOW_DEV_SIGNIN)
│       ├── v1/contacts/          # JSON API (Bearer auth via API keys)
│       ├── progress/             # per-user SSE
│       ├── audit/export/         # full-audit CSV download (per-user)
│       ├── contacts/export/  csv-template/  backup/
│       └── track/{open,click}/
├── components/                   # shadcn primitives + sidebar/topbar/palette/dialog
│                                 # + timezone-provider (React context for IST/TZ)
├── lib/                          # env, escape, utils (formatDate),
│                                 # logger, rate-limit, bearer-auth,
│                                 # email-template (HTML wrapper), custom-fields
├── server/
│   ├── db/                       # Drizzle schema + dual driver + migrations
│   ├── services/                 # business logic, mockable in tests
│   └── actions/                  # typed Server Actions (Zod-validated)
├── workers/scheduler.ts          # long-running scheduler (Linux/Docker deploys)
├── scripts/                      # migrate, seed-templates, seed-contacts, import-admin-contacts, reset-db
├── test/{unit,integration,e2e}/
├── data/
│   ├── seed-templates.json       # Public starter set (5 generic — every user gets these)
│   ├── seed-templates.admin.json # Admin overlay (23 personalised templates seeded only for ADMIN_EMAILS)
│   └── tracker.db                # local SQLite (gitignored)
├── public/.well-known/security.txt
├── .github/workflows/
│   ├── ci.yml                    # typecheck + tests + npm audit (high+ blocks)
│   └── cron-tick.yml             # every-5-min ping to /api/cron/tick (Vercel Hobby)
├── vercel.json                   # Next.js preset (no crons — see GitHub Actions)
├── Dockerfile                    # multi-stage build, tini, /app/data volume
├── SETUP.html                    # personal deployment checklist
├── DEPLOYMENT.md                 # Linux / Docker / Vercel paths
├── FEATURES.md                   # comprehensive feature catalog
├── AGENTS.md                     # working with AI agents in this repo
└── .env.example
```

---

## Tests

```bash
npm run typecheck      # strict tsc --noEmit
npm test               # Vitest (unit + integration)
npm run e2e            # Playwright (chromium)
```

| Layer | Coverage |
|---|---|
| Unit | `lib/escape` · `lib/custom-fields` (notes JSON suffix encode/decode + regression guards) · `analytics` math · `drafts.buildEmail` |
| Integration | contacts (search/tag/status filters) · services · multi-tenant isolation · worst-case regressions · credentials · onboarding · api keys + webhooks · CSV importer (per-row error report) |
| E2E (Playwright) | login renders · root redirect · protected pages redirect |

Current: **57 unit + integration green** · strict TS clean · 30 routes build.

CI blocks on high-severity `npm audit` findings (the same check Vercel runs at deploy), so a vulnerable dep can't land in `main`.

---

## Security

- `requireUser()` / `requireAdmin()` on every Server Action and protected page
- HMAC-SHA256 signed tracking pixels, click URLs, unsubscribe links, webhook payloads (all keyed by `AUTH_SECRET`)
- Dev sign-in disabled in production unless `ALLOW_DEV_SIGNIN=true`
- DB backup endpoint admin-only
- Atomic template activation (single `CASE-WHEN` UPDATE) — no two-active race
- `UNIQUE(campaign_id, contact_id)` — double-enroll is a no-op
- Ownership re-check when attaching templates to campaign steps
- Defense-in-depth: every contact UPDATE scoped `(id, userId)` even when ids come from a userId-filtered SELECT
- Duplicate-send guard: sending to a recipient emailed in last 7d requires explicit confirmation
- Per-recipient throttle (configurable days) + per-domain daily cap as send-side safety nets
- 100k row hard cap on CSV/XLSX imports (no OOM); per-row error report on the bad ones
- Strict CSP headers + `foreign_keys = ON` in SQLite
- Per-user rate limits: AI (20/min), dev-signin (10/min), v1 API (60–120/min)
- API keys stored as SHA-256 hash; plaintext shown once on creation
- `public/.well-known/security.txt` (RFC 9116)

---

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for full Linux / Docker / Vercel
walkthroughs, or open **[SETUP.html](SETUP.html)** for the interactive
checklist tailored to a first-time deployer.

| Target | Notes |
|---|---|
| **Vercel** (recommended, Hobby plan works) | Uses Turso (libSQL) for storage; **GitHub Actions cron** drives `/api/cron/tick` every 5 min (Vercel Hobby blocks sub-daily crons). Zero code changes — the DB driver auto-detects from `DATABASE_URL`. |
| **Self-hosted Linux** | `pm2 start npm -- start` + `pm2 start npm -- run worker`. SQLite in `./data/`. Back up with rsync/restic. |
| **Docker** | `Dockerfile` in repo root; mount `./data` as a volume. |

---

## Legacy

The original Express + sql.js + vanilla-JS implementation, the Google Apps
Script, and the sample Excel file were moved out to a sibling folder during
the v3 root-restructure. They're preserved at git tag **`v1-pre-rewrite`**
(commit `7c0972f`) and aren't part of this runtime any more.

---

## License

Private project.
