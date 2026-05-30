# Email Automator — Next.js 15 (v2)

A type-safe, fully-rewritten successor to the v1 Express app in `../standalone`.
Next 15 (App Router) · TypeScript strict · Tailwind + shadcn/ui · Drizzle on
better-sqlite3 · Auth.js (magic-link + Google) · Anthropic SDK for AI assist.

## Quick start

```bash
cd web
cp .env.example .env        # then edit
npm install
npm run db:generate         # produce server/db/migrations/*.sql
npm run db:migrate          # apply to ./data/tracker.db
npm run dev                 # http://localhost:3000

# in another terminal:
npm run worker              # background scheduler / campaign advancer
```

## Project layout

```
app/
  (auth)/login/             # magic-link + Google sign-in
  (app)/                    # everything behind requireUser()
    dashboard/  contacts/  templates/  drafts/  schedule/
    campaigns/  analytics/  settings/  admin/
  api/
    auth/[...nextauth]/     # Auth.js handler
    progress/               # per-user SSE
components/                 # shadcn primitives + sidebar/topbar/theme
lib/
  env.ts                    # zod-parsed process.env
  escape.ts                 # html-escape, CRLF-strip, sanitize unsub text
  utils.ts                  # cn(), formatDate()
server/
  db/
    client.ts               # drizzle + better-sqlite3 (WAL, foreign_keys ON)
    schema.ts               # full typed schema
    migrations/             # produced by `npm run db:generate`
  services/                 # pure DB + business logic
    contacts.ts  templates.ts  drafts.ts
    mailer.ts    analytics.ts  ai.ts
  actions/                  # next-safe-action server actions
  sse.ts                    # per-user fan-out
workers/
  scheduler.ts              # standalone process; iterates users
test/
  setup.ts
  unit/   integration/   e2e/
```

## Tests

```bash
npm test               # vitest (unit + integration)
npm run e2e            # playwright
npm run typecheck      # strict tsc --noEmit
```

## Security

All Phase 1 hardening from v1 lives here as the only path:

- Every Server Action calls `requireUser()` — no implicit user-0 fallback
- HTML-escaping in `personalize(..., 'html')`, CR/LF strip in `'subject'`
- `assertNoCrlf()` on every outgoing email header
- SSE connections are tagged with `userId`; `emit(uid, ...)` never crosses
  tenants
- Drizzle with `foreign_keys = ON`; cascading deletes wipe a user cleanly
- Auth.js handles state/PKCE for Google; magic-link replaces hand-rolled OTP

## What's complete vs. what's next

| Area | Status |
|---|---|
| App shell, auth, theme, sidebar | ✅ |
| Contacts (list, add, delete, bulk) | ✅ |
| Templates (editor + live preview + AI improve) | ✅ |
| Drafts (bulk create, send, delete, SSE progress) | ✅ |
| Analytics (KPIs + Recharts line chart) | ✅ |
| Scheduler worker (per-user, exp. backoff, campaigns) | ✅ |
| Campaign UI (DnD step builder) | 🚧 schema + worker ready; UI pending |
| Schedule UI | 🚧 worker ready; UI pending |
| CSV import | 🚧 wire `importer` from v1 into a Server Action |
| Admin user delete + audit viewer | 🚧 list ready; controls pending |
| Bounce / reply detection | 🚧 needs OAuth-mode Gmail handles |

## Cutover plan

Run `web/` against the **same** `tracker.db` file as `standalone/` for a
48-hour parallel pass — old reads/writes go through Drizzle; the legacy
process can keep serving until you flip DNS/port.
