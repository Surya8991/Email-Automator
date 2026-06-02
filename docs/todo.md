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

## ✅ Done 2026-06-02 follow-up session

**Security & quality**
- L6 Dynamic-import Recharts (analytics page splits chart impl behind `dynamic({ssr:false})`)
- L7 Error sanitization sweep — new `lib/action-error.ts` helper; all server-action catches now log via pino and drop driver-leak shapes
- L9 Cascade-delete integration test in [test/integration/services.test.ts](../test/integration/services.test.ts)
- L12 `/diagnostic` page gated to admins via session check + redirect
- M8 Mailer transport cache invalidation on SMTP save/clear (`clearMailerCache` in mailer.ts wired from credentials action)
- M10 ALLOW_DEV_SIGNIN sticky banner in (app)/layout when running on a deployed env

**High-impact**
- H2 SSE polling fallback — `server/sse.ts` upserts last event into `settings.PROGRESS_LATEST`, new `/api/progress/poll`, `useProgress` polls every 2 s alongside SSE
- H5 Audit CSV export streams in 1000-row pages (`app/api/audit/export/route.ts`)
- M4 Events + audit retention (`server/services/retention.ts`, scheduler-tick daily gate, /admin Purge-now card)
- M5 Custom-fields parse memoization (WeakMap-style FIFO cache, 200-entry cap)
- M6 AI Improve undo — drafts client snapshots pre-improve body to localStorage; toast exposes "Undo" for 1 hour
- M9 v1 API key scopes — `0004_api_keys_scopes` migration + scope picker in Settings → API keys + 403 on missing scope

**UX**
- Shared `<RichTextEditor>` extracted to `components/rich-text-editor.tsx`; adopted in `/drafts` editor + `/profile` signature
- Unblock-restores-contact soft-delete: `bulkBlockAction` sets `BLOCKED`, default list hides; `/blocklist` remove restores to `num=max+1`
- Schedule + Campaign per-row body preview (Eye toggle) + admin AI Improve (Sparkles) — `improveScheduledEmailAction` + `improveCampaignTemplateAction`, both audit-logged + rate-limited
- First-run onboarding modal (`components/onboarding-modal.tsx`) — 4-slide walkthrough gated on per-user `ONBOARDING_SEEN_VERSION`
- Rate-limit all admin write actions (60/min/admin) — delete user, suspend, bulk suspend, import, AI Improve (drafts/scheduled/campaigns), purge retention
- Admin diagnostic page richer: cron-secret-valid, libsql-reachable, ADMIN_EMAILS-populated checks
- Admin users CSV export streaming endpoint at `/api/admin/users/export` + Download button
- Admin bulk Suspend / Resume on /admin user table (checkbox column + select-all/indeterminate)
- /guide page refresh — new "First time?" section + updated Drafts/Schedule/Campaigns/Admin/API sections
- Top-level docs (README / FEATURES / AGENTS / DEPLOYMENT) refreshed to reflect every change

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

### M6. AI Improve undo (durable flavor — optional follow-up)
- Quick localStorage flavor shipped 2026-06-02. If you want it to survive
  closing the tab or sharing the draft across devices, add a `draft_history`
  table keyed by `(draft_id, version)` and have improveDraftAction write
  the previous body there instead of relying on the client.
- **Effort:** ~2 hr.

### M7. Raw-HTML escape in `personalize()`
- **Where:** [lib/escape.ts:personalize](../lib/escape.ts) — always
  escapes in html mode.
- **Impact:** A user-declared custom field named `bio_html` is escaped on
  substitution; templates can't have raw-HTML custom fields.
- **Fix (only if you actually want this):** add a `{{var|raw}}` modifier
  syntax that skips escaping for trusted fields. Document the safety
  trade-off in AGENTS.md.
- **Effort:** ~1 hr.

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

### L11. `EnrollOpts.contactIds` typing in v1
- Skip until v2 audit; internal types are fine.

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

1. **Operational (10 min)** — set ENCRYPTION_KEY in Vercel, run prod
   contact import once you sign in with the real ADMIN_EMAILS address.
2. **Infrastructure (~5 hr)** — H1 Redis (Upstash) rate-limit for `/api/dev-signin`
   + `/api/v1` once you go horizontal-scale.
3. **Editor migration (~4 hr)** — M1 TipTap (or Lexical) replacement for
   `components/rich-text-editor.tsx`; the shared component means one
   swap. Adopt in /templates editor body once switched.
4. **Templates editor adoption (~1 hr)** — wire `<RichTextEditor>` into
   `app/(app)/templates/template-editor.tsx` once the var-insertion
   palette is adapted for contentEditable cursor positioning (currently
   still on textarea so the chip insertion at cursor keeps working).
5. **Phase B (~2-4 weeks)** — B1-B7 workbook features as priorities
   dictate. Needs the Universal_Job_Tracker xlsx data the user has in
   Downloads.

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
