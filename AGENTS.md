# AGENTS.md

Guide for AI coding agents (Claude Code, Cursor, Aider, Codex, etc.) working on
this repo. Humans should read [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## What this is

Self-hosted job-application email outreach app. Next.js 16 App Router +
TypeScript (strict) + Drizzle ORM + Auth.js v5 + Tailwind/shadcn. Dual DB
driver: `better-sqlite3` locally, `@libsql/client` (Turso) on Vercel — picked
at runtime from `DATABASE_URL` shape in [server/db/client.ts](server/db/client.ts).

## Run, build, test

```bash
npm install --legacy-peer-deps   # peer-dep flag is required (React 19 + Auth.js v5 beta)
npm run db:migrate               # apply Drizzle migrations to ./data/tracker.db
npm run dev                      # Next dev server on :3000
npm run worker                   # long-running scheduler tick loop (separate process)

npm run typecheck                # tsc --noEmit, MUST stay clean
npm test                         # Vitest, 52 tests, MUST stay green
npm run build                    # Next prod build
npm run e2e                      # Playwright (optional, slow)
```

The local dev cookie is set by `POST /api/dev-signin {email}` when
`NODE_ENV !== 'production' || ALLOW_DEV_SIGNIN=true`. Default allow-list is
`test@gmail.com`.

## Hard rules (do not break)

1. **Multi-tenant isolation.** Every DB read of a user-owned table MUST filter
   by `userId`. The v1 scheduler bug that omitted this leaked sends across
   tenants. New queries get a `where(eq(table.userId, …))` or they don't ship.
2. **Email body composition** goes through [lib/escape.ts](lib/escape.ts):
   `personalize()` for `{{var}}` and `{{var|fallback}}` substitution,
   `assertNoCrlf()` for any value that becomes a header. Raw string
   concatenation into outgoing mail is forbidden — it has bitten us with
   HTML injection and BCC-injection before.
3. **No `eslint-disable`, no `@ts-ignore`, no `any` casts to silence the
   compiler.** Fix the type. Strict mode is on for a reason.
4. **Never run `npm audit fix --force`** — it downgrades Next.js to the v9
   incompatible line. Bump packages manually instead.
5. **Never commit secrets.** `.env` is gitignored. The Turso token, Groq key,
   AUTH_SECRET, CRON_SECRET live in Vercel env vars and GitHub Actions
   secrets, not the repo.
6. **`ALLOW_DEV_SIGNIN` must NOT ship enabled to prod.** The dev-signin route
   bypasses Auth.js entirely; it exists for local smoke tests only.
7. **Don't add `crons` to `vercel.json`.** Hobby plan rejects sub-daily cadence;
   GitHub Actions (`.github/workflows/cron-tick.yml`) drives the tick every 5 min.
8. **All visible timestamps go through `formatDate()`** ([lib/utils.ts](lib/utils.ts)).
   Client components use `useFormatDate()` from
   [components/timezone-provider.tsx](components/timezone-provider.tsx) so the
   user's TZ from `settings.TIMEZONE` applies. Server-rendered pages call
   `formatDate(d, tz)` with `tz` fetched from `getSetting(u.id, 'TIMEZONE')`.
   Default = `Asia/Kolkata`. Never call `.toLocaleString()` directly.
9. **Email body composition uses `wrapEmailHtml()`** from
   [lib/email-template.ts](lib/email-template.ts). It's table-based, inline
   styled, Outlook-safe. Don't ship raw template HTML straight to nodemailer.
10. **Per-user kill-switch** — `settings.SENDS_PAUSED=true` makes the worker
    skip a user. Honored in `scheduler-tick.ts`. Used by both the user-facing
    "Pause sends" toggle and the admin "Suspend user" toggle.
11. **Admin gates** — `ADMIN_EMAILS` in env. `auth.ts:requireAdmin()` is the
    one true entry point; never gate by checking `adminEmails.includes()`
    inline elsewhere. Admin-exclusive seed data lives in
    `data/seed-templates.admin.json` and is merged on top of the public
    `data/seed-templates.json` only when the signed-in email matches.
12. **Duplicate-contact key is `(name + email)`** — case- and whitespace-
    insensitive, both must match for a row to be considered a duplicate.
    Implemented as `dupKey(name, email)` in [server/services/contacts.ts](server/services/contacts.ts).
    Single-add, both XLSX import paths (`adminImportContactsAction` +
    `importContactsAction`), the CLI, and `dedupeContacts()` all use this
    same key. Same email under a different name is intentionally allowed.
13. **Admin write actions log to `auditLog`** — every action behind
    `requireAdmin()` should write a row so the cross-user audit view
    (`/audit?scope=all`) records who did what. See the `logAdmin()` helper
    in [server/actions/admin.ts](server/actions/admin.ts).

## Architecture

```
app/                  Next App Router — pages, layouts, route handlers
  (app)/              authenticated app group (sidebar layout)
  (auth)/login        unauthenticated login page
  api/                route handlers: cron, tracking, v1 JSON API, webhooks
auth.ts               Auth.js v5 wiring (Email + Google providers, Drizzle adapter)
server/
  db/{client,schema,migrations}/   Drizzle — dual-driver, plural-named tables
  services/           pure-ish service functions called by Server Actions + routes
  actions/            'use server' wrappers for forms / mutations
lib/                  env, logger, rate-limit, escape, bearer-auth — leaf utilities
workers/scheduler.ts  long-running tick loop (calls tickOnce every 30 s)
test/                 Vitest unit + integration
e2e/                  Playwright
```

The **same `tickOnce()`** in [server/services/scheduler-tick.ts](server/services/scheduler-tick.ts)
runs from both the worker process and `/api/cron/tick`. Keep it that way —
two implementations will drift.

## Conventions

- **Comments**: write *why*, not *what*. Named identifiers already explain
  what. Comment when the reason is non-obvious (a hidden constraint, a past
  bug, a workaround, a security invariant). Most files have a top-of-file
  block summarizing the module's purpose — match that style.
- **Errors**: throw with a clear message at the boundary that detected the
  problem. Don't `try/catch` to hide it. Server Actions return
  `{ ok: false, error }` for user-visible failures and let unexpected ones
  bubble.
- **Imports**: use the `@/` alias (`@/server/...`, `@/lib/...`). Relative
  paths only within the same folder.
- **DB writes**: prefer single-statement UPDATEs over `db.transaction()` —
  the dual-driver picker has different sync/async semantics for transactions,
  and we don't use them anywhere on purpose.
- **Logging**: `import { logger } from '@/lib/logger'`. Use child loggers
  (`logger.child({ component: 'worker' })`). Secrets are redacted globally —
  do not log raw tokens, keys, or cookies.

## When you touch the deploy surface

- Vercel: project `email-automator-three.vercel.app`, root dir `./`, branch
  `main` auto-deploys.
- Vercel runs `npm audit --audit-level=high` at deploy and **blocks** on
  any high/critical CVE. CI runs the same check at PR time so it surfaces
  early (`.github/workflows/ci.yml`).
- `serverExternalPackages` in [next.config.mjs](next.config.mjs) must include
  any new server dep that ships a native binding or uses runtime `require()`
  (better-sqlite3, @libsql/client, libsql, nodemailer, pino, pino-pretty).
  Adding one without listing it here breaks the serverless bundle.
- The `createRequire` call in [server/db/client.ts](server/db/client.ts) is
  marked `/* turbopackIgnore: true */` so Turbopack doesn't statically bundle
  both DB drivers into every function. Leave that annotation.
- **Do NOT add `"type": "module"` to package.json.** Next 16's build output
  then becomes ESM, but Vercel's serverless wrapper `require()`s the page
  module — Node rejects `require()` of ESM in a type:module package and
  every route 500s before any code runs. The local `npm start` path doesn't
  hit the wrapper, so the bug is invisible until deploy. The dual-driver
  picker accommodates this: prefers the global `require` (CJS) and falls
  back to `createRequire(import.meta.url)` only when it's absent (tsx).

## Pre-push checklist

Before `git push` on `main`, run all of these. They take ~2 minutes total
and catch the failure modes that have actually bitten this repo:

```bash
# 1. No "type":"module" in package.json (breaks Vercel — see "Do NOT" above)
grep '"type"' package.json && echo "STOP: remove type:module" || echo "ok"

# 2. Standard gates
npm run typecheck
npm test
npm run build

# 3. CJS-loadability smoke — exactly what Vercel's serverless wrapper does.
#    A clean "require() of ES Module" rejection here is the bug that
#    500s every route in production. Any OTHER error (e.g. AsyncLocalStorage
#    not available) is fine — it just means Next is running and complaining
#    about missing request context outside a real request.
node -e "require('./.next/server/app/page.js')" 2>&1 | head -3

# 4. Prod boot against the real Turso DB (mirrors Vercel's runtime exactly).
#    npm start uses next start which DOES bypass the serverless wrapper,
#    so this catches request-time failures but NOT the wrapper-level one
#    above — both checks are needed.
DATABASE_URL='libsql://…turso.io' TURSO_AUTH_TOKEN='eyJ…' npm start &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login          # → 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/session # → 200
```

After push, probe the live URL — Vercel's CDN sometimes serves the prior
deploy briefly:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://email-automator-three.vercel.app/login
```

## What NOT to do

- Don't introduce a new ORM, query builder, auth library, or component
  library. The stack is set.
- Don't replace the dual-driver picker with one driver — local dev needs
  better-sqlite3, Vercel needs libSQL.
- Don't add `try/catch` around `redirect()` calls. `redirect()` throws on
  purpose to interrupt rendering; catching it breaks auth.
- Don't add backwards-compat shims for code you're removing. Delete it.
- Don't write docs files (`*.md`, `NOTES.md`, `CHANGELOG.md`) without
  being asked. PR descriptions and commit messages are the changelog.
- Don't run destructive git ops (`reset --hard`, `push --force`,
  `branch -D`) without explicit user approval.
