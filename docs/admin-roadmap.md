# Admin & Feature Roadmap

> Last updated 2026-06-01. Pick items off as priorities shift. Items already shipped this session were removed.

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

## Admin enhancements (still deferred)

- **Bulk user actions** — checkbox column on `/admin`'s user table; suspend/resume many at once. Useful for trial expiration or onboarding-batch cleanup. File: `app/(app)/admin/admin-table.tsx`.
- **CSV export of users list** — new `/api/admin/users/export` route, mirrors the existing `/api/audit/export` pattern.
- **Admin impersonation** — sign in as user X for support debugging, audited via `auditLog`. Security-sensitive; needs a dedicated `/admin/impersonate` route + cookie scoping. Defer until a real support need exists.
- **Per-user template / contact drill-down** — click a row in `/admin`'s user table → see their templates, recent drafts, last-sent timestamps. Helps debug "why isn't my campaign sending". Medium build.
- **Send-rate quotas per user** — replace the global `DAILY_SEND_LIMIT` with a per-user override stored in a new `user_quotas` table. Needed once the instance has paying tiers.
- **`/admin` sub-routes** — split into `/admin/users`, `/admin/system`, `/admin/audit-all`, `/admin/imports` once the page grows past ~500 lines. Currently fine.
- **Diagnostic page admin-richer** — add cron-secret-valid, libsql-reachable, ADMIN_EMAILS-populated checks. File: `app/(app)/diagnostic/`.
- **Rate-limit admin write actions** — apply `lib/rate-limit.ts` (60/min/userId) to `deleteUserAction`, `suspendUserAction`, `adminImportContactsAction`, `improveDraftAction`.
- **`/api/backup` download → auditLog** — currently fires silently; should write a row capturing the admin who downloaded.
- **Sticky banner for `ALLOW_DEV_SIGNIN=true` in non-local env** — already shown red on `/admin`, promote to app-wide banner so it can't be left on in prod by accident.

## Workbook Phase B features (from the Universal Job Tracker xlsx)

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
