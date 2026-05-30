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

| Page | What it does |
|---|---|
| `/dashboard` | KPIs + recent activity + onboarding card when empty |
| `/contacts` | Add/import/export, tags + filter, timeline modal, mobile card view |
| `/templates` | Editor + live preview + variable autocomplete + A/B subject + AI Improve |
| `/drafts` | Bulk create with SSE progress, individual + send-all, body preview |
| `/dry-run` | First 100 contacts × active template (no email goes out) |
| `/schedule` | Date/time picker, preview, queue table, cancel-all |
| `/campaigns` | Multi-step sequences (drag-ordered, per-step delays, enroll by tag) |
| `/analytics` | KPIs + 14-day chart (opens · clicks · replies · bounces) |
| `/blocklist` | Per-user + global suppression; unsubscribe link auto-adds to global |
| `/audit` | Last 500 actions per user |
| `/diagnostic` | SMTP / Groq / OAuth / SPF / DMARC checks + send test |
| `/profile` | Name, phone, signature, portfolio link |
| `/settings` | 8 tabs: General · Email · AI · Auth · API keys · Webhooks · Data · Danger |
| `/admin` | Per-user stats, delete user (cascades), full DB backup |
| `/guide` | In-app 17-section manual |
| `/readme` | Public landing page (no login required) |

**API:** `/api/v1/contacts` (GET, POST) — Bearer auth via API keys you create
in Settings → API keys.

**Webhooks:** outbound POSTs on `sent` / `open` / `click` events with
HMAC-SHA256 signatures. Configure in Settings → Webhooks.

---

## Project layout

```
.
├── app/                          # Next.js App Router
│   ├── (auth)/login/
│   ├── (app)/                    # everything behind requireUser()
│   │   ├── dashboard/  contacts/  templates/  drafts/  dry-run/
│   │   ├── schedule/  campaigns/  analytics/  blocklist/  audit/
│   │   ├── diagnostic/  profile/  settings/  guide/  admin/
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── cron/tick/            # Vercel cron target (worker tick)
│       ├── dev-signin/           # opt-in dev session (ALLOW_DEV_SIGNIN)
│       ├── v1/contacts/          # JSON API (Bearer auth)
│       ├── progress/             # per-user SSE
│       ├── contacts/export/  csv-template/  backup/
│       └── track/{open,click}/
├── components/                   # shadcn primitives + sidebar/topbar/palette/dialog
├── lib/                          # env, escape, utils, logger, rate-limit, bearer-auth
├── server/
│   ├── db/                       # Drizzle schema + dual driver + migrations
│   ├── services/                 # business logic, mockable in tests
│   └── actions/                  # typed Server Actions (Zod-validated)
├── workers/scheduler.ts          # long-running scheduler (Linux deploys)
├── scripts/                      # migrate, seed-templates, seed-contacts, reset-db
├── test/{unit,integration,e2e}/
├── data/
│   ├── seed-templates.json       # 20 starter templates (auto-seeded on first sign-in)
│   └── tracker.db                # local SQLite (gitignored)
├── public/.well-known/security.txt
├── vercel.json                   # Next.js preset + 1-min cron at /api/cron/tick
├── Dockerfile                    # multi-stage build, tini, /app/data volume
├── SETUP.html                    # your personal deployment checklist
├── DEPLOYMENT.md                 # Linux / Docker / Vercel paths
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
| Unit | `lib/escape` (12) · `analytics` math (2) · `drafts.buildEmail` (2) |
| Integration | contacts (3) · services (4) · multi-tenant isolation (3) · worst-case regressions (12) · credentials (6) · onboarding (3) · api keys + webhooks (8) |
| E2E (Playwright) | login renders · root redirect · protected pages redirect (3) |

Current: **52 unit + integration green** · strict TS clean · 22 routes build.

---

## Security

- `requireUser()` / `requireAdmin()` on every Server Action and protected page
- HMAC-SHA256 signed tracking pixels, click URLs, unsubscribe links, webhook payloads (all keyed by `AUTH_SECRET`)
- Dev sign-in disabled in production unless `ALLOW_DEV_SIGNIN=true`
- DB backup endpoint admin-only
- Atomic template activation (single `CASE-WHEN` UPDATE) — no two-active race
- `UNIQUE(campaign_id, contact_id)` — double-enroll is a no-op
- Ownership re-check when attaching templates to campaign steps
- 100k row hard cap on CSV/XLSX imports (no OOM)
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
| **Vercel** (recommended) | Uses Turso (libSQL) + Vercel Cron. Zero code changes — the DB driver auto-detects from `DATABASE_URL`. |
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
