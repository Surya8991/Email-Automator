# Email Automator — Next.js 15 (v2)

A self-hosted outreach tool. Next 15 App Router · TypeScript strict ·
Tailwind + shadcn-style UI · Drizzle on better-sqlite3 · Auth.js (magic
link + Google) · Groq (Llama 3.3) for AI assist.

The full user-facing docs live inside the app at **`/guide`** — quick
start, every feature, API reference, env vars, deployment, troubleshooting.

---

## Quick start

```bash
cd web
cp .env.example .env             # edit AUTH_SECRET, SMTP, (optionally GROQ_API_KEY)
npm install --legacy-peer-deps
npm run db:generate              # produces server/db/migrations/*.sql (first time only)
npm run db:migrate               # creates ./data/tracker.db with all tables
npm run dev                      # http://localhost:3000
# in another shell:
npm run worker                   # background scheduler / campaign advancer
```

For a one-click dev sign-in (no SMTP needed), set in `.env`:

```
ALLOW_DEV_SIGNIN=true
DEV_BYPASS_EMAILS=test@gmail.com
```

You'll get a "Sign in as test@gmail.com (dev)" button on the login page.
**Turn this off in production.**

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next dev server with HMR (slower per-route compile) |
| `npm run build` | Production build (15+ routes) |
| `npm start` | Production server on `:3000` |
| `npm run worker` | Background scheduler — sends scheduled emails + advances campaign enrollments every 30 s |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest (unit + integration) |
| `npm run e2e` | Playwright |
| `npm run db:generate` | Drizzle: produce migrations from `schema.ts` |
| `npm run db:migrate` | Apply migrations to the configured DB |
| `npm run db:studio` | Drizzle Studio (interactive DB viewer) |
| `npm run seed:templates [email]` | Load the 20 starter templates into a user |

---

## Project layout

```
app/
  (auth)/login/               magic-link + Google sign-in + dev bypass + hero
  (app)/                      everything behind requireUser()
    dashboard/                KPI grid + onboarding card
    contacts/                 table, add dialog, import/export, tags, timeline
    templates/                editor with live preview, A/B, AI Improve
    drafts/                   bulk create with SSE progress, send, delete
    dry-run/                  preview first 100 contacts × active template
    schedule/                 date/time picker, queue table, cancel-all
    campaigns/                list + new + [id] detail (step builder + enroll)
    analytics/                KPIs + 14-day chart (Recharts)
    blocklist/                add/remove per-user; shows global rows read-only
    audit/                    last 500 events, admin sees DB backup link
    diagnostic/               SMTP / Groq / OAuth / SPF / DMARC checks
    profile/                  name, signature, portfolio, unsub
    settings/                 tabs: General / Email / AI / Auth / Data / Danger
    guide/                    in-app user guide (this file's content + much more)
    admin/                    per-user stats, delete user (admin-only)
  api/
    auth/[...nextauth]/       Auth.js handler
    dev-signin/               opt-in dev session (guarded by ALLOW_DEV_SIGNIN)
    progress/                 per-user SSE stream
    contacts/export/          CSV download
    csv-template/             starter CSV download
    backup/                   admin-only full-DB download
    track/open/               1×1 GIF + records open event (HMAC-gated)
    track/click/              302 redirect + records click event (HMAC-gated)
  unsubscribe/                RFC 8058 GET (page) + POST (one-click)
components/                   shadcn primitives + sidebar/topbar/theme/command palette
lib/
  env.ts                      zod-parsed process.env, runs a .env loader for scripts
  escape.ts                   htmlEscape · stripCrlf · assertNoCrlf · personalize · sanitizeUnsubText
  utils.ts                    cn(), formatDate()
server/
  db/
    client.ts                 drizzle + better-sqlite3 (WAL, foreign_keys ON)
    schema.ts                 full typed schema
    migrations/               drizzle-kit output
  services/                   pure DB + business logic, mockable in tests
    contacts.ts templates.ts drafts.ts schedule.ts campaigns.ts
    mailer.ts analytics.ts ai.ts tracking.ts blocklist.ts settings.ts
    unsubscribe.ts importer.ts
  actions/                    typed Server Actions (Zod-validated, revalidatePath)
    contacts.ts templates.ts drafts.ts schedule.ts campaigns.ts
    settings.ts profile.ts diagnostic.ts timeline.ts admin.ts blocklist.ts ai.ts
  sse.ts                      Map<userId, Set<controller>> per-user fan-out
workers/
  scheduler.ts                standalone process: per-user iteration, exp backoff,
                              campaign advance, tracking pixel re-injection
scripts/
  migrate.ts                  apply migrations from CLI
  seed-templates.ts           load 20 starter templates from ../standalone/data/templates.json
test/
  setup.ts                    sets DATABASE_URL=:memory:, AUTH_SECRET
  unit/                       escape, analytics, drafts.buildEmail
  integration/                contacts, services round-trip, worst-cases
  e2e/                        Playwright (login + redirects)
```

---

## Tests

```bash
npm run typecheck         # strict tsc --noEmit
npm test                  # Vitest — 35 unit + integration tests
npm run e2e               # Playwright (chromium)
```

| Layer | Coverage |
|---|---|
| Unit | `lib/escape` (12) · `analytics` math (2) · `drafts.buildEmail` (2) |
| Integration | contacts CRUD (3) · services round-trip (4) · multi-tenant isolation (3) · worst-case regressions (12) |
| E2E | login page renders · root redirect · protected-pages redirect (3) |

The worst-case suite locks down the deep-review findings (atomic activate,
unique enrollment, ownership re-check, CSV row cap, pixel placement, tag
substring safety, tracking signature forgery rejection).

---

## Security

Carried forward from the Phase 1 hardening + the deep code review:

- Every Server Action and protected page calls `requireUser()` — no implicit
  user-id fallback
- HTML-escape in `personalize(..., 'html')`, CR/LF strip in `'subject'`,
  `assertNoCrlf()` on every outgoing email header
- HMAC-SHA256-signed tracking and unsubscribe tokens (keyed by `AUTH_SECRET`)
- Dev sign-in disabled in production unless `ALLOW_DEV_SIGNIN=true`
- DB backup endpoint is admin-only
- Atomic template activation (single CASE-WHEN UPDATE)
- Unique constraint on `(campaign_id, contact_id)` — double-enroll is a no-op
- Ownership re-check when attaching a template to a campaign step
- CSP headers in `next.config.mjs` (script-src 'self' + 'unsafe-inline' for
  Next's bootstrap; dev adds 'unsafe-eval' for Fast Refresh)
- 100k row hard cap on CSV / XLSX imports (no OOM)
- Drizzle with `foreign_keys = ON`; cascading deletes wipe a user cleanly
- Auth.js handles state/PKCE for Google; magic-link replaces hand-rolled OTP

---

## Deployment

See **`/guide` → 15. Deployment options** in the running app for full
details. Short version:

- **Self-hosted Linux** — `pm2 start npm --name web -- start && pm2 start npm --name worker -- run worker`. SQLite file persists in `./data/`.
- **Vercel** — UI works, but swap the DB to Turso (libSQL) or Vercel Postgres; the worker becomes a cron-triggered route.
- **Docker** — Dockerfile in this folder; mount `./data` as a volume.

See `vercel.json` and `Dockerfile` (when added) for ready-to-deploy configs.
