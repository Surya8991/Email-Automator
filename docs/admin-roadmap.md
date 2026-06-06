# Admin & Feature Roadmap

> Last updated 2026-06-05. Pick items off as priorities shift. Items already shipped this session were removed.

## Shipped in the 2026-06-05 admin overhaul

The single-page /admin grew past 500 lines and the cross-user observability gaps were real — both got addressed.

**Sub-route split (was deferred)**
- `/admin` is now 6 tabs: Overview / Users / Queue / Webhooks / System / Broadcast. `app/(app)/admin/layout.tsx` owns the requireAdmin gate; individual pages don't re-check.

**Observability**
- Overview: KPI cards + Queue snapshot + 30-day cross-user send chart + Top-10 senders + Failure heatmap (7×24 IST) + last 10 admin actions.
- Queue tab: live queue stats, active queue (50), recent failures (20), **Recover stuck** button (scoped to ids seen at SELECT, accurate count).
- Webhooks tab: per-webhook last status, last delivery, last error.

**User management**
- Per-row drill-down drawer (Eye) — 30-day activity + inventory + settings + last 10 sends with status badges.
- Per-user **DAILY_SEND_LIMIT_OVERRIDE** (Key icon) — scheduler-tick reads it before falling back to env.
- **Impersonation** (UserCog) — 1h session, REVOKES the admin's current session row so a leaked old cookie can't be replayed, refuses admin-to-admin (audit-trail laundering risk), audit-logged with actor + target.

**System**
- DB size + table row counts + events 7d-vs-prev-7d growth.
- Quota usage today (rolling 24h) with green/amber/red progress bars at 70/90% of the user's effective limit.
- Global blocklist editor (`userId=null` entries) with dedupe-on-add.
- Active campaigns table (owner, status, enrollment counts).

**Broadcast**
- `/admin/broadcast` — 280-char banner that renders site-wide. Stored as latest `admin.broadcast` audit row; layout reads via `unstable_cache(['current-broadcast'], …)` and `broadcastAction` invalidates by tag (`revalidateTag('broadcast')`). Empty submission clears it.

**Code-review refactors (R1-R3)**
- `lib/csv-stream.ts` — shared `csvCell` + `streamCsv` + `csvResponse`; audit + users CSV routes refactored.
- `components/ai-improve-picker.tsx` — reusable tone-picker for the next call site.
- `lib/rate-limit.ts` — loud one-shot warning when running on Vercel without `REDIS_URL`.

**Code-review bug fixes layered on top of the admin overhaul**
- Impersonation: revoke admin's current session row before issuing the impersonation cookie (closes replay window) + refuse admin-to-admin.
- Global blocklist: pre-check existing row before insert (dedupe).
- Recover-stuck: scope UPDATE to ids seen at SELECT so reported count matches actual.
- `currentBroadcast` wrapped in `unstable_cache` so the layout doesn't query DB per page render.

## Recently shipped (for reference — do not re-implement)

- Public/admin seed template split, `{{var|fallback}}` syntax
- Admin contact bulk-import CLI + `/admin` upload card with SSE progress, (name+email) dedupe
- `/admin` system stats card + runtime configuration card + N+1 fix
- `/analytics` admin-only pipeline KPI row
- `/audit` cross-user view (`?scope=all`) + admin CSV export scope
- `/audit` records every admin write action (delete user, suspend, import, AI Improve)
- `/contacts`: Dedupe, Delete matching, Delete all, page-size selector (50/100/500/1000), **Schedule…** + **Enroll in campaign…** bulk buttons
- `/drafts`: rich-text editor + HTML toggle, Discard selected, Discard all, AI Improve (admin-only)
- `/blocklist`: row checkboxes + Remove selected

## Shipped in the 2026-06-02 follow-up

- Sticky banner for `ALLOW_DEV_SIGNIN=true` in deployed env (top of every (app) route)
- `/admin` Retention card with manual "Purge now" backed by `purgeOldEvents` / `purgeOldAudit`
- Audit CSV export now streams in 1000-row pages (no longer OOMs on large user histories)
- Mailer transport cache invalidates on SMTP save/clear
- **Bulk user actions** — checkbox column + bulk suspend/resume on `/admin`'s user table
- **CSV export of users list** — `/api/admin/users/export` streams per-user counts; Download button on the user-table toolbar
- **Diagnostic page enriched** — CRON_SECRET valid, libsql/SQLite reachable, ADMIN_EMAILS populated checks; page itself is now admin-gated
- **Rate-limit admin write actions** — 60/min/admin for delete user, suspend, bulk suspend, import contacts, AI Improve (drafts/scheduled/campaigns), purge retention
- **`/api/backup` download → auditLog** — `admin.download_backup` row written on every download
- **`/diagnostic` admin-only** — non-admins redirect to /dashboard

## Admin enhancements (still deferred)

- **Audit trail for impersonation activity** — currently `admin.impersonate` logs the START of the session, but every subsequent action while impersonating is recorded under the TARGET user's id with no impersonator marker. Add an `ea_impersonator` cookie set at impersonation start, and have `logAdmin` (and a parallel `logUser` helper) read it to attach the impersonator id to every audit row. Compliance + forensics.
- **AI Improve picker — adopt the shared `<AiImprovePicker>` component** in drafts/schedule/campaigns. The component is shipped; the 3 call sites still inline their own tone-picker state + JSX. Low-risk dedupe.
- **Per-user template / contact drill-down extension** — the drawer already shows last 10 sends + 30-day activity. Extend with: their templates list, active campaigns names, recent drafts. Helps debug "why isn't my campaign sending" without impersonating.
- **Send-rate quotas in a dedicated `user_quotas` table** — the current `DAILY_SEND_LIMIT_OVERRIDE` setting works fine for now, but a real `user_quotas(userId, daily, weekly, monthly, plan_tier)` table is the right shape once the instance has paying tiers.
- **Redis-backed rate limiter** — `lib/rate-limit.ts` now warns when running on Vercel with no `REDIS_URL` but doesn't enforce. Wire `@upstash/ratelimit` for the security-sensitive call sites (dev-signin brute-force, AI 20/min, v1 API 60/min) before relying on these limits at scale.

## Workbook Phase B features (from the Universal Job Tracker xlsx)

> **Update 2026-06-06**: the core Job Tracker module shipped (adapter
> architecture + normalization + cross-board dedup + triage UI). The Phase B
> items below are enrichment features that build on top of it; they remain
> unimplemented but are no longer blocked.

Each is admin-exclusive (gate on `adminEmails`). Source data lives in `Test Universal_Job_Tracker_FINAL.xlsx` in Downloads. None implemented yet.

- **B1 Company Research panel** — 344 rows of per-company enrichment (industry, HQ, size, funding, Glassdoor, tech stack, salary range, hiring frequency). New `companies` table + sidebar on contact-detail page. Quick win.
- **B2 Salary Negotiation Tracker** — per-offer record (base, bonus, ESOPs, gap vs target). Lives next to email-log per contact. Real build.
- **B3 Skills Gap Analyzer** — per-user skills inventory (skill, level, years, confidence, target). Could feed back into template placeholders for auto-fill. Real build.
- **B4 Offer Comparison** — weighted scoring across multiple offers. Depends on B2. Small build.
- **B5 Interview Prep / STAR bank** — per-(company, role) interview log: date, interviewer, questions, STAR stories used, outcome. Small build.
- **B6 Follow-up Reminders dashboard** — surface "Overdue 14+ / Soon 7–13 / On track <7" buckets on `/contacts` as a widget. Nice-to-have.
- **B7 Per-platform activity tracker** — slice existing email-log by `contact.platform`; surface response rate per source. Small build.

## Resume punch list (review-only — no code, no commits)

Findings from the 2026-06-01 review of the three role-tailored resumes against [suryalokesh.me](https://suryalokesh.me). No file edits — these are notes for the next time the user updates the PDFs.

- Growth resume profile summary still opens "Digital Marketing Analyst" — should say "Growth Marketer" or "Growth Marketing Analyst" (the file is the growth variant). The other two correctly say "Executive". Most visible inconsistency across the three.
- Edstellar title varies across the three resumes (Analyst / Executive / SEO Analyst). Cross-check with LinkedIn — if LinkedIn says "Digital Marketing Executive" a hiring manager spot-checking will flag the SEO variant.
- Performance resume's HiringHut bullet 2 mixes SEO work (organic visibility, first-page rankings) into a PPC story. Drop or reframe.
- SEO resume's HiringHut bullet 3 mixes PPC into an SEO story. Same fix.
- Missing from all three but present on the portfolio: Google Ads Search Certification (In Progress, Q2 2026), BigQuery, Surfer SEO, dev stack (React / Webflow / Tailwind CSS / Node.js).
- "Architected" leads the Edstellar bullet on all three — reads AI-flavored. Vary the verb (Led / Built / Drove).
- Profile summaries are 4–5 dense lines. Trim to 2 lines + a metric line — recruiters scan, they don't read.
- Filename `Surya_L_Resume_Growth_Marketer (1).pdf` should drop the `(1)` suffix before sharing.

## Prod-import follow-up

The 2188 contacts imported on 2026-06-01 only live in the local `data/tracker.db`. On Vercel / Turso production, re-run `npm run import:admin-contacts -- <file>` against the prod DB once signed in with the real `ADMIN_EMAILS` address (locally that's still the placeholder `you@gmail.com`). The import is idempotent — safe to re-run; dupes get skipped.
