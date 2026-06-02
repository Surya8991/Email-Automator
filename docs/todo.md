# TODO — Email-Automator

> Captured 2026-06-01 from the full code review + feature backlog. Each
> item names what to do, where it lives, and rough effort. Severity tags
> match the code review: 🟥 Critical, 🟧 High, 🟨 Medium, 🟦 Low, 🟩
> Architecture. Anything tagged ✅ at the top is already shipped this
> session — left in for context.

## ✅ Already done this session (for reference)

- C1 AES-GCM encryption at rest for SMTP_PASS + GROQ_API_KEY
- C2 Open redirect on `/api/track/click` closed
- C3 v1 POST dedupe with `nameAndEmailExists`
- C4 Onboarding seed-loop short-circuit via `SEED_VERSION` setting
- H3 `/api/backup` writes `admin.download_backup` to auditLog
- H6 `instrumentHtml` skips internal anchors (RFC 8058)
- H7 Scheduler atomic claim + stuck-Sending recovery
- M3 `getUserSuspensions` N→1 grouped query
- L1 Duplicate `import @/lib/env` merged
- L2 `tsconfig.tsbuildinfo` untracked + gitignored
- L4 Drafts page-size selector 50/100/500/1000 + Prev/Next

---

## Operational — do these first when you're back

### 1. Set `ENCRYPTION_KEY` in Vercel

Generate with any of these:
```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Vercel → Settings → Environment Variables → add `ENCRYPTION_KEY` to all
three envs → redeploy. Without it the system derives the key from
`AUTH_SECRET` which works fine but couples the two values.

### 2. Run the prod contact import

Sign in to the deployed app with your admin email → `/admin` → **Bulk
import contacts** card → upload `Universal_Job_Tracker_FINAL.xlsx` from
Downloads. The 2188 contacts only exist in your local DB right now.

---

## 🟧 High — worth a sprint

### H1. Rate-limit needs Redis on Vercel
- **Where:** [lib/rate-limit.ts](../lib/rate-limit.ts) uses an in-memory
  `Map<string, Bucket>` that resets per Lambda invocation.
- **Impact:** `/api/dev-signin` and `/api/v1` rate limits are
  approximately N× looser than the comments say, where N = warm Lambdas.
  AI rate-limit (20/min) burns more Groq quota than expected.
- **Fix:** Detect `process.env.VERCEL` at module load; if set, swap the
  `Map` for an Upstash Redis-backed bucket. Self-hosted single-instance
  keeps the in-memory path.
- **Effort:** ~2 hr including Upstash setup + env vars.

### H2. SSE doesn't work across Lambdas
- **Where:** [server/sse.ts](../server/sse.ts) keeps clients in a
  process-local Map; emitter and SSE endpoint run in different Lambdas.
- **Impact:** Contact-import progress bar can sit at 0% on Vercel prod.
  Self-hosted is fine.
- **Fix options:**
  - (a) Upstash Redis pub/sub between emit() and the SSE route
  - (b) Polling endpoint `/api/import-status?since=...` backed by a new
    `progress` table; client polls every 1–2s while pending
  - (c) Vercel KV with a per-user latest-event row
- **Recommend (b)** — least infra, works everywhere.
- **Effort:** ~3 hr.

### H5. Audit export loads everything into memory
- **Where:** [app/api/audit/export/route.ts:27](../app/api/audit/export/route.ts)
  does `db.select().from(auditLog).where(...).orderBy(...)` with no limit.
- **Impact:** OOMs the Lambda once any user accumulates 100k+ audit
  rows. Worse for admin `?scope=all` exports.
- **Fix:** Use a `ReadableStream` controller, page through the rows in
  chunks of 1000, write each chunk as CSV lines. Keeps memory bounded.
- **Effort:** ~1 hr.

---

## 🟨 Medium

### M1. Replace `document.execCommand` in the rich editor
- **Where:** [app/(app)/drafts/drafts-client.tsx](../app/(app)/drafts/drafts-client.tsx)
  toolbar at lines ~270-310; helper `exec()` near the bottom of the file.
- **Impact:** Spec-deprecated. Mobile IMEs already produce odd behavior
  in some cases. Future Chrome could drop it.
- **Fix:** Switch to TipTap (~30 KB gz) or Lexical. Wrap behind a shared
  `components/rich-text-editor.tsx` and have drafts + /templates +
  /profile signature all use it.
- **Effort:** ~4 hr including the three callers.

### M4. Events + audit retention
- **Where:** [server/db/schema.ts](../server/db/schema.ts) — `events` and
  `audit_log` grow unbounded.
- **Impact:** 10k sends × 30% open × 5% click = ~3.5k events per
  campaign. No deletion. Eventually the DB and the export endpoint both
  suffer.
- **Fix:**
  1. New setting `EVENTS_RETENTION_DAYS` (default 180), `AUDIT_RETENTION_DAYS` (default 365).
  2. New service function in [server/services/analytics.ts](../server/services/analytics.ts) or new `server/services/retention.ts`:
     `purgeOldEvents(userId, days)` and `purgeOldAudit(userId, days)`.
  3. Wire into [scheduler-tick.ts](../server/services/scheduler-tick.ts)
     to run once per day per user (gated by a `LAST_PURGE_AT` setting).
  4. Add a manual "Purge now" button on `/admin` for emergencies.
- **Effort:** ~2 hr.

### M5. Custom-fields JSON parsed every render
- **Where:** [lib/custom-fields.ts](../lib/custom-fields.ts) — called
  per-contact on every page load.
- **Impact:** At pageSize=1000 (now possible), parsing 1000 JSON suffixes
  server-side per render is wasted work.
- **Fix:** Either memoize via a `WeakMap<Contact, ParsedFields>` or move
  custom fields to a real `contact_custom_fields` table. Memo is faster
  to ship; table is cleaner long-term.
- **Effort:** memo ~30 min, table ~3 hr including migration.

### M6. AI Improve has no undo
- **Where:** [server/actions/drafts.ts:improveDraftAction](../server/actions/drafts.ts)
  writes the rewritten body straight over `draft.htmlBody`.
- **Impact:** If the admin dislikes the rewrite and clicks Improve again
  (or pastes their original prose), the previous version is gone.
- **Fix:**
  - Quick: client-side `localStorage` snapshot of the body keyed by
    `draft.id` before the action fires, plus an "Undo improve" button
    that restores from localStorage (TTL 1 hr).
  - Proper: new `draft_history` table keyed by `(draft_id, version)`
    storing the previous N bodies. Last-write wins on save.
- **Effort:** localStorage ~30 min, table ~2 hr including migration + UI.

### M7. Raw-HTML escape in `personalize()`
- **Where:** [lib/escape.ts:personalize](../lib/escape.ts) — always
  escapes in html mode.
- **Impact:** A user-declared custom field named `bio_html` is escaped on
  substitution; templates can't have raw-HTML custom fields.
- **Fix (only if you actually want this):** add a `{{var|raw}}` modifier
  syntax that skips escaping for trusted fields. Document the safety
  trade-off in AGENTS.md.
- **Effort:** ~1 hr.

### M8. Mailer transport cache never evicts
- **Where:** [server/services/mailer.ts:cache](../server/services/mailer.ts:9)
  — `Map<string, Transporter>` grows unboundedly.
- **Impact:** Long-running self-hosted worker leaks transports if users
  rotate SMTP creds. Fine on serverless (process resets per invocation).
- **Fix:** LRU cap at 50 transports, OR invalidate the cache when
  `saveSmtpAction` writes new creds. The second is cleaner and the hook
  is one line.
- **Effort:** ~30 min.

### M9. v1 API keys have no scopes
- **Where:** [app/api/v1/contacts/route.ts](../app/api/v1/contacts/route.ts)
  uses `requireBearer` which only checks "is the key valid for this user".
- **Impact:** A leaked key = full write access. No way to issue a
  read-only token.
- **Fix:** Add `scopes TEXT NOT NULL DEFAULT 'read:contacts,write:contacts'`
  to the api-keys schema. `requireBearer` returns the scopes; route
  handlers check. Migration + new "Scopes" picker in the API keys UI.
- **Effort:** ~3 hr.

### M10. `ALLOW_DEV_SIGNIN=true` should banner
- **Where:** Admin runtime card already shows it red. Add a sticky banner
  at the top of every page when the flag is true AND deployed env
  detected.
- **Effort:** ~30 min.

---

## 🟦 Low — hygiene

### L3. Dead imports / `void` suppressions
- Sweep for `void inArray` etc. patterns left over from edits. Probably
  none remain after this session's cleanup, but worth a grep.

### L5. Clock injection
- **Where:** Services call `Date.now()` directly throughout.
- **Fix:** Inject a `clock()` helper so tests can advance time without
  faking the global Date object.
- **Effort:** ~2 hr.

### L6. Dynamic-import Recharts
- **Where:** [app/(app)/analytics/chart.tsx](../app/(app)/analytics/chart.tsx)
  imports recharts (~120 KB gz) statically.
- **Note:** Next's route-level code-splitting already isolates this to
  the analytics chunk. The win is SSR time + first-byte for the
  analytics page itself.
- **Fix:** `const Chart = dynamic(() => import('./chart').then(m => m.Chart), { ssr: false })`.
- **Effort:** ~10 min.

### L7. Error messages leak DB internals
- **Where:** Several actions return `e.message` straight to the client.
- **Fix:** Catch + log full error server-side via pino, return generic
  "Operation failed" to the client. Already done partially in this
  session's v1 fix.
- **Effort:** ~1 hr to sweep.

### L9. Cascade-delete test
- **Where:** [test/integration/services.test.ts](../test/integration/services.test.ts)
- **Fix:** New test — seed a user with contacts/drafts/templates/audit
  rows, delete the user, assert all owned tables wiped. Locks in the
  schema's FK cascade behavior.
- **Effort:** ~30 min.

### L11. `EnrollOpts.contactIds` typing in v1
- Skip until v2 audit; internal types are fine.

### L12. `/diagnostic` is open to all users
- **Fix:** Gate the page to admin OR rate-limit per-user. Probes are
  cheap but DMARC checks hit external resolvers.
- **Effort:** ~30 min.

---

## 🟩 Architecture / strategic (longer-term)

- **A1** Dual DB driver tax — consider committing to Turso once the
  self-host story is no longer needed
- **A2** Replace SSE with polling once H2 fix lands
- **A3** Extract "use case" functions so Server Actions and v1 routes
  share business logic instead of duplicating
- **A4** Ratchet up unit-test coverage (currently 78 integration + 7
  unit; aim for 30% unit)
- **A5** Add OpenTelemetry hooks for daily-send-rate / SMTP-error-rate
- **A6** Audit any new entry into `scheduler-tick.ts` to keep it the
  single source of truth

---

## Feature backlog

### Schedule + Campaign body preview + admin AI Improve
- Per-row Eye toggle on `/schedule` rows shows `emailLog.body`.
- Per-step Eye toggle on `/campaigns/[id]/campaign-detail.tsx` shows the
  template's `initialMsg`.
- Admin-only Sparkles button on each: new
  `improveScheduledEmailAction(id, tone)` writes back to
  `emailLog.body`; new `improveTemplateAction(templateId, tone)` writes
  back via `upsertTemplate`. Both `requireAdmin()` + audit-logged.
- **Effort:** ~3 hr.

### Unblock restores the contact at the end of the list
- Today: [server/actions/contacts.ts:bulkBlockAction](../server/actions/contacts.ts)
  hard-deletes the contact when blocking; `removeEntry` in
  [blocklist.ts](../server/services/blocklist.ts) only drops the pattern.
- Going forward: `bulkBlockAction` sets `emailStatus='BLOCKED'` instead
  of deleting. `listContacts` filters BLOCKED from default views.
  `removeEntries` + `removeEntry` clear the BLOCKED status and bump
  `num` to max+1 for any contact whose lowercased email matches the
  removed pattern, so they land at the end of the list.
- **Effort:** ~1.5 hr including tests.

### Shared `<RichTextEditor>` component
- Extract from [drafts-client.tsx](../app/(app)/drafts/drafts-client.tsx)
  lines ~240-330 (the Rich/HTML toggle + toolbar + contentEditable div).
- Sign: `<RichTextEditor value onChange placeholder rows />`.
- Adopt in [/templates editor](../app/(app)/templates/template-editor.tsx)
  for `initialMsg`/`follow1Msg`/`lastFollowMsg`, and [/profile signature](../app/(app)/profile/profile-form.tsx).
- **Effort:** ~2 hr.

### First-run onboarding modal
- New `components/onboarding-modal.tsx`, opens on (app)/layout when the
  user's `ONBOARDING_SEEN_VERSION < CURRENT`. 4-slide walkthrough
  (Contacts → Templates → Drafts → Schedule/Campaigns) with persistent
  Skip. New `markOnboardingSeenAction(version)` writes the setting.
  Bumping the version constant re-opens for everyone on next sign-in.
- **Effort:** ~3 hr including copy.

### `/guide` page refresh
- [app/(app)/guide/page.tsx](../app/(app)/guide/page.tsx) — surgical
  edits to sections:
  - 3 Contacts: Schedule…/Enroll in campaign… bulk actions, Dedupe button,
    page-size selector, (name+email) dedupe key.
  - 4 Templates: public/admin overlay split, `{{var|fallback}}` syntax.
  - 5 Drafts: rich-text editor + HTML toggle, AI Improve admin-only,
    Discard selected/all, page-size selector.
  - 6 Schedule: preview + AI Improve when shipped.
  - 7 Campaigns: per-step preview + AI Improve when shipped.
  - 11 Admin: system stats card, runtime config card, cross-user audit,
    bulk import card + CLI, admin audit logging.
  - New section 0 at top: First-time? — onboarding modal + how to retrigger.
- **Effort:** ~2 hr.

### Workbook Phase B features (from Universal_Job_Tracker xlsx)

Each is admin-exclusive. Source data lives in the Downloads xlsx files.

- **B1 Company Research panel** (344 rows). New `companies` table +
  sidebar on contact-detail when company name matches. Quick win.
- **B2 Salary Negotiation Tracker** — per-offer record. Real build.
- **B3 Skills Gap Analyzer** — per-user skills inventory. Could feed
  into template placeholders. Real build.
- **B4 Offer Comparison** — weighted scoring, depends on B2. Small.
- **B5 Interview Prep / STAR bank** — per-(company, role) log. Small.
- **B6 Follow-up Reminders dashboard** — Overdue 14+ / Soon 7-13 / On
  track <7 buckets on /contacts. Nice-to-have.
- **B7 Per-platform activity tracker** — slice email-log by
  `contact.platform`. Small.

---

## Resume punch list (review-only — no code, no commits)

PDFs are gitignored. Update when refreshing the files:

- Growth resume profile summary still says "Digital Marketing Analyst" —
  should say "Growth Marketer" / "Growth Marketing Analyst".
- Edstellar title varies across the three resumes (Analyst / Executive /
  SEO Analyst). Cross-check with LinkedIn.
- Performance resume's HiringHut bullet 2 mixes SEO work into a PPC
  story. Reframe or drop.
- SEO resume's HiringHut bullet 3 mixes PPC work into an SEO story. Same
  fix in reverse.
- Missing from all three but present on the portfolio: Google Ads
  Search Certification (In Progress, Q2 2026), BigQuery, Surfer SEO,
  dev stack (React / Webflow / Tailwind CSS / Node.js).
- "Architected" leads the Edstellar bullet on all three — vary the verb
  (Led / Built / Drove).
- Profile summaries are 4-5 dense lines; trim to 2 + a metric line.
- Filename `Surya_L_Resume_Growth_Marketer (1).pdf` — drop the `(1)`.

---

## Suggested next-sprint order

1. **Operational (10 min)** — set ENCRYPTION_KEY, run prod import.
2. **Day-one fixes (~1 hr)** — L6 dynamic recharts, L9 cascade test, L7
   error sanitization sweep, M10 dev-signin banner, M8 mailer cache
   eviction.
3. **High-impact (~6 hr)** — H5 streaming audit export, H2 polling
   fallback for SSE, M4 events + audit retention.
4. **UX polish (~5 hr)** — M6 AI undo (localStorage flavor), shared
   `<RichTextEditor>` extraction + adopt in /templates and /profile.
5. **Behavior fix (~1.5 hr)** — unblock-restores-contact soft-delete.
6. **Feature push (~5 hr)** — Schedule + Campaign body preview + admin
   AI Improve, /guide refresh.
7. **Backlog (multi-day)** — onboarding modal, H1 Redis rate-limit, M1
   TipTap migration, M9 v1 key scopes.
8. **Phase B (~2-4 weeks)** — B1-B7 workbook features as priorities dictate.

---

## What's intentionally *not* here

- **Tests that would require a running browser** (Playwright) — those
  live in `test/e2e/` and stay separate.
- **Encryption key rotation tooling** — if you rotate ENCRYPTION_KEY,
  every saved SMTP_PASS / GROQ_API_KEY becomes undecryptable. The
  decrypt path returns `""` so the app keeps running but users have to
  re-enter credentials. Build a re-encrypt CLI before rotating.
- **Multi-instance worker coordination** — current worker assumes
  single-instance scheduler-tick. Vercel cron + the long-running
  worker on a host would double-tick today. H7 atomic claim makes
  this safe but doesn't deduplicate the wasted compute. Out of scope
  unless you actually run both.
