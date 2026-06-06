# AGENTS.md

Guide for AI coding agents (Claude Code, Cursor, Aider, Codex, etc.) working on
this repo. Humans should read [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Design system (refreshed 2026-06-06)

- **Fonts** — Inter via `next/font/google` exported as the `--font-sans` CSS variable and bound to Tailwind's `font-sans` (see `tailwind.config.ts`). JetBrains Mono is `--font-mono` for `code` / `kbd` / `pre`. Adding a new font: register in `app/layout.tsx`, expose a CSS variable, extend the Tailwind `fontFamily`.
- **Depth tiers** — `.ea-surface`, `.ea-raised`, `.ea-floating` in `app/globals.css`. Use `ea-floating` for one hero card per page (auth card, primary detail surface). `ea-raised` is the default. `ea-surface` is for sub-cards inside a Section.
- **Section primitive** — `components/ui/section.tsx`. When a page has 4+ stacked cards, wrap each cluster in `<Section eyebrow="…" title? description? actions?>`. Pattern: one PageHeader, then 1-N Sections.
- **Segmented control** — `<Segmented value onChange options ariaLabel />` from `components/ui/segmented.tsx`. Reserve for ≤4-option toggles. Don't use for big tab sets — keep shadcn Tabs there.
- **Sidebar groups** — `GROUPS` const in `components/sidebar.tsx`. Adding a nav item: pick the right eyebrow (Workspace / Compose / Send / Insights / You) or create a new group with a noun eyebrow label.
- **Data tables** — `<table className="ea-table ea-table-sticky">` inside an `overflow-auto` scroll container gives you sticky head + zebra + hover row actions. Hide row buttons inside `<div className="ea-row-actions">` to reveal only on row hover.
- **Editor pattern** — pair `useUnsavedGuard(dirty)` with `useSaveShortcut(handleSave, !pending)` (and optionally `useSendShortcut` for draft surfaces). All three live in `components/`.
- **Pluralize** — `pluralize(n, sing, plur?)` / `pluralWord(n, sing, plur?)` / `formatCount(n, sing, plur?)` from `lib/pluralize.ts`. Always use in PageHeader pill labels — "23 contacts" not "23 contact".

## AI accuracy & generation patterns (added 2026-06-05)

- **`server/services/ai-generate.ts`** — entry point for `kind = jd | post | url | text`. URL inputs are fetched via `fetchForAi()` which enforces HTTPS in prod, blocks private IPs / loopback / link-local hostnames, caps body at 1 MB, times out at 5 s. The result text is `stripHtml`-cleaned before reaching the prompt.
- **`buildMessages(brief, sourceText, brandVoice)`** is the single source of truth for the AI prompt. When you add new quality knobs (recipient field, output format, persona), extend that function — never inline new system text at the call site. Unit tests in `test/unit/ai-generate.test.ts` lock the system/user split.
- **Brand voice** is `AI_VOICE_SAMPLES` (user setting, 2,400-char cap). Read once via `getSetting()` in any service that calls Groq.
- **SectionHelp** is the per-page `?` button. Author content inline (it must be specific, not generic). Pattern: `help={<SectionHelp title="…" what={…} actions={…} pitfalls={…} guideAnchor="…" />}` passed to `PageHeader`.

## Page chrome conventions (added 2026-06-05)

Every app page uses two shared components instead of bespoke `<h1>` blocks
or inline empty-message text:

- **`components/ui/page-header.tsx`** — `<PageHeader icon title description pills actions />`. Pills are `{ label, value, tone }` where tone ∈ `default | success | warn | danger | info`. Right-side `actions` slot for buttons.
- **`components/ui/empty-state.tsx`** — `<EmptyState icon title description action hint />`. Use inside `<Card><CardContent className="p-0">…</CardContent></Card>` for table-style pages; pass `compact` to halve vertical padding for in-card empties.

When you add a new page, copy the pattern from `app/(app)/drafts/page.tsx` (stat-pill heavy header) or `app/(app)/companies/page.tsx` (empty-state primary CTA).

## Draft-creation filter helpers

The CreateDraftsDialog flow goes through `server/services/drafts.ts`:

- **`DraftFilters`** — `{ platforms?, jobTitleContains?, locationContains?, skipRecentDays? }`. All optional, ANDed.
- **`eligibleWhere(userId, filters)`** — single source of truth for the WHERE clause. Both `countEligible()` (live preview) and `createDraftsBulk()` (commit) use it, so the preview can never disagree with what create actually does. If you add a new filter, extend this helper, not the call sites.
- **`countEligible()`** — returns `{ eligible, total, sample }` where `sample` is the first 5 matches for the dialog preview.

## Notifications (Slack/Discord)

- **`server/services/notify.ts`** — `notify(userId, event, payload)`. Best-effort fire-and-forget. Rate-limited 30/min per (user, event). Always wrap calls in `.catch(() => {})` at the call site so a webhook outage can't break the underlying send loop.
- **Allowed events:** `send.completed` / `send.failed` / `bounce` / `reply`.
- **URL whitelist:** `hooks.slack.com` + `discord.com` only — `parseWebhookUrl()` enforces. Do NOT widen this without security review (SSRF risk).

## Presence

`server/presence.ts` — in-memory per-Lambda. The Redis upgrade path is documented in the file header; if you need globally-consistent presence, swap `heartbeat()` for `XADD + EXPIRE` and `listPeers()` for `SMEMBERS`. The pill at `components/presence-pill.tsx` shows `(approx)` so users know the current behavior.

## GDPR export

`server/services/export.ts` builds the dump. Child tables (`campaign_steps`, `campaign_enrollments`, `campaign_step_variants`) chain through `campaign_id` (they don't have `userId`) — see how the export filters by `inArray` on the user's campaign ids. If you add a new child table, mirror that pattern.

## Accent colors

`components/accent-provider.tsx` exports the `ACCENTS` map (single source) and `isValidAccent()`. Server actions that accept an accent value MUST whitelist via `isValidAccent()` before writing — the value flows into a CSS custom property and untrusted input could inject extra declarations.

## Job Tracker — adapter architecture (refreshed 2026-06-06)

The job tracker is **adapter-first**: dedicated per-vendor fetchers in `server/services/job-adapters/*` handle the boards we know about; the orchestrator in `server/services/job-tracker.ts` only handles control flow + dedup + cron.

**Pipeline (`tickSource`)**:
1. `findAdapter(url)` walks `registry.ts` and picks the first match.
2. If matched, run that adapter — it returns `RawJob[]` straight from a JSON API.
3. If no adapter (or the adapter returned 0, and it's NOT an RSS-like adapter that legitimately returns 0), fetch the URL via `fetchForAi()` (SSRF-defended) and try **JSON-LD** (`schema.org/JobPosting`) — most modern boards embed Google-Jobs markup. Zero AI cost.
4. If still empty, fall back to **Groq AI extraction** (`aiExtractJobs`). 8000-char window, strict JSON schema, `llama-3.1-8b-instant` pinned with 1b-preview fallback on 429.
5. For each `RawJob`:
   - **15-day age gate** — if `j.postedAt` is older than 15 days, skip. Constant `FIFTEEN_DAYS_AGO = Date.now() - 15 * 24 * 60 * 60 * 1_000`. Matches the `pruneOldLeads()` cutoff so no stale roles accumulate.
   - Compute `fingerprintOf(title, company)` for source-scoped dedup.
   - Compute normalized fields via `server/services/normalize.ts`: `normalizeSalary`, `normalizeLocation`, `crossKey(company, title, locationNorm)`.
   - Cross-board dedup: look up by `(userId, crossKey)` index. If an existing row came from an aggregator (`AGGREGATOR_ADAPTERS` set: `rss`, `remote-ok`, `remotive`, `adzuna`, `jooble`) and the current source is canonical (ATS / company page), the existing row's `sourceId` is rewritten to point at the canonical source and empties are filled — canonical wins. Otherwise skip the insert.
   - Otherwise insert with all 11 columns populated.
6. Conflict on the `(sourceId, fingerprint)` unique index ⇒ this is a re-fetch of the same lead on the same source. Merge fields with `CASE WHEN empty THEN new ELSE existing END` so we never overwrite richer data with emptier data.

**Adapters** (all in `server/services/job-adapters/`):
- `ats.ts` — Greenhouse / Lever / Ashby / SmartRecruiters / BreezyHR / Workable / Freshteam. Detect by host pattern, hit the vendor JSON API. Cleanest path; zero AI cost.
- `naukri.ts`, `foundit.ts`, `internshala.ts` — India-specific JSON APIs / HTML.
- `workday.ts`, `personio.ts`, `recruitee.ts`, `teamtailor.ts` — additional ATSes (per-tenant subdomain patterns).
- `remote-ok.ts`, `remotive.ts` — remote-only public JSON.
- `adzuna.ts`, `jooble.ts` — meta-aggregators. Gated on env vars (`ADZUNA_APP_ID/KEY`, `JOOBLE_API_KEY`). No-op + console warning when keys are missing.
- `rss.ts` — Indeed RSS, TimesJobs RSS, generic feed.
- `json-ld.ts` — fallback parser for `<script type="application/ld+json">@type=JobPosting`. Reused inside `tickSource`, not in `REGISTRY`.
- `ai.ts` — last-resort Groq extractor. Same path as above.
- `utils.ts` — `sanitiseLink(raw, sourceUrl)` resolves relatives, blocks non-http(s), drops same-as-source URLs, strips tracking params (`utm_*`, `gclid`, `fbclid`, `src`, `ref`, `lever-source`, `gh_src`, etc.). Every adapter routes link extraction through this.

**Adding a new ATS adapter** (~80 LOC + 1 test):
1. Create `server/services/job-adapters/myats.ts`. Export `myAtsAdapter: Adapter` matching the shape in `types.ts` — `name`, `matches: (url) => boolean`, `fetch(source, opts): Promise<RawJob[]>`, optional `skipKeywordFilter` (when the API's own search already filters).
2. Insert into `REGISTRY` array in `registry.ts` in priority order — more-specific patterns first.
3. Add a preset in `lib/job-board-presets.ts` under the `api` category so users can pick it from the picker. Use a URL template the matcher recognizes (e.g. `https://jobs.example.com/{role}`).
4. Add a unit test in `test/unit/normalize.test.ts` or a new file for adapter-specific parsing.

**Cross-board dedup precedence rule**: aggregator adapters (`AGGREGATOR_ADAPTERS`) yield to canonical ones. When you add a new adapter, classify it: if it's a meta-aggregator (returns jobs from many companies you didn't add directly), add its name to `AGGREGATOR_ADAPTERS` in `normalize.ts`.

**Env vars**:
- `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` — Adzuna meta-aggregator. Free dev key at developer.adzuna.com (250 req/day, 25 req/min).
- `JOOBLE_API_KEY` — Jooble meta-aggregator. Free at jooble.org/api/about (~500 req/day).
- All three are optional. Adapters log a one-shot warning and return `[]` when their keys are missing — the rest of the tracker keeps working.

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
npm test                         # Vitest — MUST stay green
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
14. **Admin write actions are rate-limited** — call the `adminLimit(me.id, 'op')`
    helper at the top of every new `requireAdmin()` action (60/min/admin) so a
    stuck loop or runaway script can't blow through Groq quota or the audit log.
15. **Server actions never echo driver errors** — wrap any `catch (e)` that
    returns to the client in `actionError(e, fallback)` from
    [lib/action-error.ts](lib/action-error.ts). It logs through pino and
    drops anything that looks like a SQLite / libsql / stack-frame leak.
16. **API key scopes** — v1 routes call `requireBearer(req, ['scope:name'])`.
    Adding a new route means adding it to the scope catalog in
    [lib/bearer-auth.ts](lib/bearer-auth.ts) and listing it in the API keys UI
    so users can opt in. Empty `scopes` = back-compat full-access (pre-0004).
17. **Rich text editor is shared** — every body editor uses
    `<RichTextEditor value onChange />` from
    [components/rich-text-editor.tsx](components/rich-text-editor.tsx). Don't
    re-implement contentEditable / toolbar in another component; the M1 TipTap
    migration will swap a single file.
18. **Onboarding modal version** — bumping `ONBOARDING_CURRENT_VERSION` in
    [components/onboarding-modal.tsx](components/onboarding-modal.tsx) re-shows
    the modal for every user on next sign-in. Use sparingly — major UX shifts
    only.
19. **Retention purge** — `EVENTS_RETENTION_DAYS` (default 180) and
    `AUDIT_RETENTION_DAYS` (default 365) are per-user settings. Scheduler-tick
    calls `maybePurgeForUser` after every user-tick, gated to once per 24 h.
    Don't add a new unbounded growth table without a retention path.
20. **Admin sub-routes** — `/admin` is split into 6 tab pages
    (`/admin`, `/admin/users`, `/admin/queue`, `/admin/webhooks`,
    `/admin/system`, `/admin/broadcast`). The `app/(app)/admin/layout.tsx`
    wraps every tab with `requireAdmin()` so individual pages don't need
    to repeat the gate. Cross-user data lives in
    [server/services/admin-analytics.ts](server/services/admin-analytics.ts) —
    every export there is admin-only by convention, never call it from a
    per-user surface.
21. **Per-user daily-limit override** — `settings.DAILY_SEND_LIMIT_OVERRIDE`
    (set from /admin/users via `setUserQuotaAction`). Scheduler-tick reads it
    BEFORE falling back to `env.DAILY_SEND_LIMIT`. Don't bypass — the
    override is the single source of truth for that user's effective limit.
22. **Impersonation invariants** —
    [`impersonateUserAction`](server/actions/admin.ts) MUST (a) refuse if
    the target is in `adminEmails` (admin-to-admin laundering risk), and
    (b) DELETE the admin's current `sessions` row before issuing the
    impersonation cookie so a captured old cookie value can't be replayed.
    Audit-logged with both actor and target emails.
23. **Global blocklist dedupe** — `addGlobalBlockAction` pre-checks for
    an existing `(userId=NULL, pattern, type)` row and returns
    `{ ok: true, duplicate: true }` instead of inserting. There is no
    unique constraint on `blocklist`, so the application-level check is
    load-bearing.
24. **Broadcast cache** — the layout calls `currentBroadcast()` on every
    (app) page render. It's wrapped in `unstable_cache(['current-broadcast'], …, { tags: ['broadcast'] })`;
    `broadcastAction` calls `revalidateTag('broadcast')`. Don't add a new
    layout-level admin read without the same treatment.

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
