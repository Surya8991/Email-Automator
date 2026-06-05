# Features

Everything Email Automator currently does, grouped by section.
Last refreshed: 2026-06-05.

## 🆕 What's new (2026-06-05, second batch)

- **AI Generate from JD / Post / URL / Text** — new tab in `/templates`. Paste a job description, social-media post body, free text, or any URL → AI returns subject + body + framing assumption. URL fetcher is SSRF-defended (HTTPS only in prod, private IPs / loopback / link-local blocked, 5 s timeout, 1 MB body cap, content-type whitelist).
- **AI quality controls** — every AI panel now has Length (short / medium / long) and CTA emphasis (none / soft / direct). Recipient context fields let you pass real name / role / company so personalization is concrete, not generic.
- **Brand voice samples** — `Settings → AI` accepts up to 2,400 chars of your own writing. Injected into every AI generation so output matches your cadence and vocabulary.
- **AI Improve in Drafts — for everyone** — was admin-only; lifted with a 30/min/user rate limit. Same tone / length / CTA controls. Undo for 1 h.
- **? Section help on every page** — small `?` next to each PageHeader title opens a popover with what / actions / pitfalls / link to the matching guide section. Authored per page, no generic fluff.
- **Design lift** — gradient icon halo on PageHeader, hairline section dividers, animated count-up on stat pills, hover-lift on cards, accent-stripe utility for stat cards.

## 🆕 What's new (2026-06-05)

- **Smart draft creation** — new `CreateDraftsDialog` with template picker (one-off override), count presets, platform / job-title / location filters, skip-recently-contacted toggle, live "X eligible of Y total" counter + first-5 contact sample.
- **Schedule selected drafts** — new `ScheduleSendDialog` converts pending drafts straight into scheduled emails with datetime + 3-5 min stagger.
- **Send confirmation dialog** — replaces the browser `confirm()` for *Send all* / *Send selected* with a recipient preview (subject, to-email, count, large-batch warning).
- **Templates polish** — Test-send to your own address with sample data (rate-limited 6/min), live unknown-variable validator that flags `{{typos}}` before they ship literally, per-template 30-day stats (sent / open-rate / reply-rate) inline next to each label.
- **Diagnostic** — grouped results (Connectivity / Background / Deliverability / Admin), Quick run (skips DNS) + Full run, per-row "How to fix" expandable, summary pill, copy-as-markdown for postmortems.
- **User guide** — sticky TOC sidebar (desktop) with IntersectionObserver scroll-spy + client-side substring search, collapsible "What's new" pinned at top.
- **⌘K palette upgraded** — also searches your contacts, templates, drafts, and campaigns (not just navigation).
- **Shortcuts cheatsheet** — `?` opens a dialog listing every keyboard shortcut.
- **PageHeader / EmptyState rolled out everywhere** — `/dashboard`, `/contacts`, `/companies`, `/templates`, `/drafts`, `/dry-run`, `/schedule`, `/campaigns`, `/analytics`, `/blocklist`, `/audit`, `/diagnostic`, `/guide`.
- **Sidebar Admin section** — `/diagnostic` and `/admin` moved into their own group under a divider; non-admins no longer see the dead `/diagnostic` link.
- **Per-user accent color** — 5-swatch picker in `/profile` (Indigo / Emerald / Rose / Amber / Violet), CSS-var-injected, survives theme.
- **PWA install** — `manifest.webmanifest` + dismissible install banner (30-day suppression). iOS fallback hint for Add-to-Home-Screen.
- **Slack / Discord notifications** — per-user webhook URL in `/profile` (`hooks.slack.com` / `discord.com` whitelist-checked to avoid SSRF), fires on `send.completed` / `send.failed` / `bounce` / `reply`. Per-event filter.
- **GDPR data export** — `/api/export/my-data` returns a JSON dump of every row you own across all tables, 1/day/user rate-limited, audit-logged. Secrets redacted.
- **Lightweight presence pill** — campaign-detail shows "X others editing (approx)" via 30s heartbeat. Per-Lambda-instance — accurate on single-region deploys, approximate cross-region. Redis upgrade path documented in `server/presence.ts`.

> If you're new here, start with the [Getting Started](README.md#getting-started) section of the README, then come back to this file to discover what's available.

---

## Auth & accounts

- **Google sign-in** (one-click, recommended) — also grants Gmail API scopes used for signature import, reply detection, and bounce checks.
- **Magic-link sign-in** via Auth.js + Nodemailer — no password to manage.
- **Per-user data isolation** — every query filters by `userId`; you can never see another user's contacts, drafts, or sends.
- **Multiple admins** — set `ADMIN_EMAILS` (comma-separated) in env; admins see the `/admin` panel.
- **Dev sign-in** (local only) — bypass auth for testing. Guarded by `NODE_ENV !== 'production' || ALLOW_DEV_SIGNIN=true`.

## Contacts

- **CRUD** — add one-by-one or import in bulk.
- **Search + filter** — search by name/company/email/role · tag · status (Pending / Draft created / Scheduled / Sent / Replied / Bounced / Cancelled) · **company** · **location** · **platform**. All dropdowns populated from your actual data. Filters compose; URL-persisted.
- **CSV/Excel import with per-row error report** — bad rows aren't silently dropped: a collapsible panel lists every rejected row with line number + reason (missing email / invalid format / duplicate within file / already in your contacts). First 200 issues shown.
- **Custom fields per contact** — keys declared in Settings (`region`, `tier`, `deal_stage`, etc.), values stored in `contacts.notes` as a JSON suffix (legacy plain-text notes still work). Insertable as `{{key}}` in templates, substituted at send time.
- **One-click follow-up** — per-row "Schedule follow-up in N days" button. Pick a number, scheduler queues it.
- **CSV/Excel import** — `.csv`, `.xlsx`, `.xls`. Header names are fuzz-matched. Download the [starter template](https://email-automator-three.vercel.app/api/csv-template) for the canonical columns + sample rows.
- **CSV export** of all your contacts.
- **Tag filter** — comma-separated tags per contact; click a tag to filter, dropdown shows every tag you've used.
- **Search** by name / company / email / role.
- **Per-page select-all** + **bulk actions** — **Create drafts for selected** · **Schedule…** (date/time + gap, calls the scheduler with just your selection) · **Enroll in campaign…** (drop-down of your active/draft campaigns) · Add tag · Remove tag · Reset status · Block (one-step: add to blocklist + delete from contacts) · Delete.
- **Dedupe toolbar** — Dedupe (removes rows where both name + email match an existing row, keeping the oldest), Delete matching (scoped to current filter set), Delete all (requires typing `DELETE ALL`).
- **Page-size selector** — 50 / 100 / 500 / 1000. Server cap at 1000.
- **SSE import progress bar** — both the per-user CSV upload and the admin bulk-import card stream `contact_import_progress` events so you watch the bar move instead of staring at a spinner.
- **Per-contact timeline** — every event for this contact in one dialog.
- **Status field** — auto-tracks `Draft Created`, `Scheduled for …`, `Sent (…)`, `Replied!`, `BOUNCED`.
- **Duplicate detection** — single-add + every import path key on `(name + email)`, case- and whitespace-insensitive. Same email under a different name is allowed (shared inboxes, name updates across imports).
- **Soft-block + unblock-restore** — bulk-Block sets `emailStatus=BLOCKED` rather than deleting. The default contacts list hides BLOCKED rows. Removing the email from `/blocklist` restores the contact at the bottom of the list (`num = max + 1`) so it lands where you'd look for it.

## Templates

- **Split seed sets** — every new user gets a **public starter set of 5 generic templates** auto-seeded on first sign-in. Accounts whose email is in `ADMIN_EMAILS` additionally receive a **23-template admin overlay** with role-targeted copy (Growth / Performance / SEO / Digital × 5 styles + 3 universal). The split lives in `data/seed-templates.json` (public) and `data/seed-templates.admin.json` (admin overlay).
- **`{{var|fallback}}` syntax** in `personalize()` — `{{name|there}}` renders "there" when the CSV row's name is empty, so "Hi ," never happens.
- **Sidebar search + category filter** for picking among your templates.
- **Clickable variable palette** — recipient fields (`{{name}}`, `{{company}}`, `{{role_name}}`, `{{email}}`, `{{location}}`, `{{platform}}`) plus HTML snippets (salutation, paragraph, bullet list, sign-off, divider) plus any **user-declared custom fields** (Settings → Custom contact fields). Click → token lands at cursor.
- **Live preview** — see how the email looks against a sample contact.
- **Email-safe styled wrapper** — every outgoing email gets a polished, Outlook-safe HTML shell automatically (rounded card, system font, max 600px, hidden preheader).
- **A/B subject lines** — set `subjectB`; the system deterministically splits 50/50 by contact id.
- **Active template** marker — exactly one per user; bulk-draft flow uses it.
- **Clone template** — duplicate any template with `-copy` suffix; useful for safe A/B without touching the original.
- **AI assist** — Groq (Llama 3.3): rewrite drafts in 5 tones, suggest subject lines, draft from scratch given a goal.

## Drafts

- **Search + per-row selection** — substring match on recipient/subject; per-row checkbox + "Select all visible".
- **Bulk-create** drafts for every eligible contact (caps at 50/batch). Live SSE progress.
- **Rich-text editor** — default Rich tab renders the htmlBody as formatted text in a `contentEditable` view with a Bold / Italic / List / Link toolbar (Ctrl+B, Ctrl+I shortcuts). HTML tab still available for power-users; both modes stay in sync on save. Lives in `components/rich-text-editor.tsx` and is reused by `/profile` for the signature.
- **AI Improve (admin only)** — per-row Sparkles button picks a tone (professional / friendly / concise / enthusiastic / formal) and rewrites the draft via Groq, then opens the editor so the admin reviews before sending. Audit-logged. Rate-limited 60/min/admin.
- **AI Improve Undo (1 h)** — the success toast surfaces an Undo action that restores the pre-improve body from `localStorage` for up to 1 hour. Survives page navigation; expires on tab close + 1 h.
- **Page-size selector** — 50 / 100 / 500 / 1000 with Prev/Next at the bottom.
- **Send selected (N)** + **Discard selected (N)** + **Discard all** — `Discard all` requires typing `DISCARD ALL` to confirm.
- **Duplicate-send guard** — sending to a recipient you already emailed in the last 7 days surfaces a confirmation dialog with the previous send date.
- **One-click follow-up** — per draft, "Schedule follow-up in N days" button uses the active template + queues it in /schedule.
- **Send one** or **Send all**.
- **Retry failed** — re-run all pending drafts in one click.
- **Delete** individual drafts.

## Schedule

- **Atomic claim on tick** — scheduler-tick flips Scheduled → Sending in one UPDATE per row gated on `status='Scheduled'`, so two overlapping ticks (Vercel cron + long-running worker) can't double-send. Stuck-Sending rows (older than 10 min) auto-recover to Scheduled on the next tick.
- **Per-row Eye preview** — toggle the rendered `email_log.body` for any queued row (the exact HTML the worker will send, with `{{vars}}` still in place).
- **Per-row AI Improve (admin)** — Sparkles popover picks a tone and rewrites `email_log.body` in place. Scheduler picks up the new body on its next pass — no schedule change. Audit-logged, rate-limited 60/min/admin.
- **Queue search + status filter + per-row selection** — search by recipient/subject, filter Scheduled vs Retrying, per-row checkbox + "Cancel selected (N)" alongside "Cancel all".
- **Pick start date + time** — IST by default; you change TZ in Settings.
- **Configurable interval** — set min/max minutes between sends (default 3–5).
- **Recurring presets** — Tomorrow 9:30 AM, Next weekday 10:00 AM, Next Monday 9:00 AM, In 3 days 11:00 AM, Tonight 7:00 PM.
- **Preview** — see who gets scheduled at what time before committing; shows total count, first/last times, spacing.
- **Queue table** — Run-at, To, Subject, Status (Scheduled / Retrying tinted amber), Attempts count, Last result message.
- **Cancel all** still-pending sends in one click.
- **Worker** — long-running scheduler tick (every 30 s) + GitHub Actions cron (every 5 min) for redundancy.
- **Exponential backoff with jitter** on retry; 3 attempts then marked Failed.
- **Daily send limit** per user, enforced by the tick.

## Campaigns / sequences

- **Search + status filter** on the campaigns list.
- **Multi-step sequences** — chain templates with per-step delays (hours) and "stop on reply".
- **Drag-orderable step list** (up/down arrows).
- **Enroll** by tag, by individual contacts, or all eligible.
- **Per-step performance** — sent / opens / clicks / replies / advanced counts per step, with % rates.
- **Pause / Resume / Archive** — soft-status flips without losing data.
- **Status filtering** in the campaign list.
- **Per-step Eye preview** — toggle the underlying template's body inline next to each step.
- **Per-step AI Improve (admin)** — Sparkles popover rewrites the underlying template body. Future sends use the new body; past sends are unchanged. Audit-logged, rate-limited 60/min/admin.

## Analytics

- **KPIs (30d)** — sent, open rate, click rate, reply rate.
- **Admin-only pipeline row** — Total applied / Active pipeline / Offers / Response rate / Rejections derived from `contacts.status`. Only renders when `session.user.isAdmin`.
- **14-day line chart** — sent / open / click / reply / bounce by day.
- **Breakdown by template** (top 10, 30d) — sent count + open/click/reply rates.
- **Breakdown by campaign** (top 10, 30d).
- **Breakdown by tag** (top 10, 30d) — multi-tag contacts count for each.
- **Send-time heatmap** (7 days × 24 hrs IST) — cell shade = send volume, hover shows open rate for that hour. Attributes opens back to the original send-hour, not the open-hour.

## Dashboard

- **30-day KPIs** — contacts / pending drafts / sent / open / click / reply / bounce.
- **"Next send" card** — exactly when the worker will fire your next scheduled email + recipient + subject.
- **Recent activity (last 10)** — with contact email + campaign/step badge when applicable; live timestamps in user TZ.
- **First-run onboarding** banner with quick-start links.
- **First-time onboarding modal** — 4-slide walkthrough (Contacts → Templates → Drafts → Schedule/Campaigns) overlay shown until the user dismisses it. Persists `ONBOARDING_SEEN_VERSION` per user; bump the constant in `components/onboarding-modal.tsx` to re-show after a major UX change.

## Tracking

- **1×1 open pixel** — HMAC-signed, hidden, placed before `</body>`.
- **Click rewriting** — every `<a href>` becomes a signed redirect (records click → forwards).
- **Per-event row** in `events` table for sent / open / click / reply / bounce / unsubscribe.
- **RFC 8058 List-Unsubscribe** header on every outgoing email — one-click compliant unsubscribe for Gmail / Apple Mail.

## Gmail integration (Google sign-in only)

- **Signature import** — pull your Gmail primary signature with one click in Settings.
- **Reply detection** — scan inbox for replies to contacted addresses; mark contact as "Replied!".
- **Bounce detection** — scan mailer-daemon messages; auto-mark bounced contacts.

## Audit log

- **Last 500 events** with action / detail / IP / timestamp.
- **Search + action filter + date range** — substring across all columns, dropdown of distinct action types, From/To date inputs (inclusive at day granularity).
- **CSV export** of the entire log.
- **Cross-user scope (admin only)** — `?scope=all` toggles a Mine | All users pill; the table adds a User column populated via a LEFT JOIN on `users.email`. The CSV export mirrors the flag and prepends a `user` column. Admin write actions (delete user, suspend/resume, contact import, AI Improve) are auto-logged so the All-users view records who did what.

## Blocklist

- **Search + type filter** (Email / Domain).
- **Per-user + global** patterns — email or domain.
- **Single add** or **bulk add** (paste a list, newline or comma separated; `@` autodetects type).
- **Row checkboxes + Remove selected** — pick multiple rows and drop them in one click. Global rows (admin-set) stay read-only and aren't selectable.
- **Auto-block** on unsubscribe click.
- **Auto-block** from the Contacts bulk-action toolbar.

## Diagnostic

- **Admin-only page** — `/diagnostic` redirects non-admins to `/dashboard`. Probes hit external DNS resolvers, so the page is gated behind `ADMIN_EMAILS`.
- **One-click "Run checks"** — SMTP connect, AI key, Google OAuth config, DNS, SPF, DMARC, MX records, **CRON_SECRET set + ≥16 chars**, **libsql/SQLite reachability** (1-row probe), **ADMIN_EMAILS populated**.
- **Per-check Retry** button on any non-pass row.
- **Mailbox provider DMARC** is treated as pass (gmail.com, outlook.com, yahoo.com, icloud.com, proton.me, etc.) — you don't own these domains so you can't change their policy.
- **Send test email** to yourself.
- **Manual Reply / Bounce check** buttons (Gmail).

## Settings

- **General** — daily send limit, **timezone** (13-option dropdown, IST default), default role name, portfolio link, unsubscribe footer text + toggle, **emergency Pause Sends** kill-switch, **per-recipient throttle (days)**, **per-domain daily cap** (`gmail.com=50,outlook.com=30`), **custom contact field keys**.
- **Email** — per-user SMTP (host, port, user, pass, From). Falls back to env if blank.
- **AI** — per-user Groq API key + model.
- **Auth** — current session info; sign out.
- **API keys** — create / revoke. SHA-256 hashed at rest; plaintext shown once at creation. **Per-key scopes** (read:contacts, write:contacts) — pick at creation; routes check the required scope and return 403 if missing. Pre-0004 keys with no scopes recorded keep working as full-access for back-compat.
- **Webhooks** — subscribe a URL to event kinds; HMAC-signed (`X-EA-Signature`).
- **Data** — CSV export of contacts / DB backup (admin).
- **Danger zone** — wipe contacts / drafts / events / all-but-user.

## API & webhooks

- **`/api/v1/contacts`** — GET (list with search + tag + paging, requires `read:contacts` scope), POST (create, requires `write:contacts`). Bearer auth. Returns 403 with `requiredScopes` when the key is missing a scope.
- **API keys** — `ea_…` prefix, SHA-256 hashed, last-used-at tracked, scope-tagged (read:contacts / write:contacts).
- **Webhooks** — POST JSON to your URL on `sent / open / click / reply / bounce / unsubscribe`. HMAC-SHA256 signature header.
- **`/api/audit/export`** — streams the user's audit log as CSV in 1000-row pages so a large user history doesn't OOM the Lambda. Admins can pass `?scope=all` for the instance-wide log.
- **`/api/admin/users/export`** — admin-only, streams a users CSV (id, email, name, joined, contacts, drafts pending, events, suspended). Audit-logged.
- **`/api/progress`** + **`/api/progress/poll?since=ts`** — SSE primary, polling fallback for environments like Vercel where the emitter and SSE consumer live in different Lambdas. Clients use both transports and dedupe by timestamp.

## Admin

The admin surface lives at `/admin`, split into **6 tabs** so the page doesn't become a scroll marathon. Every page is gated by `requireAdmin()`; every write is audit-logged + rate-limited (60/min/admin).

### `/admin` — Overview
- **Six KPI cards** — Users, Contacts, Templates, Drafts pending, Sent (30d), Active campaigns.
- **Queue snapshot** — Scheduled / Sending / Retrying / **Stuck (>10m)** / Sent 24h / Failed 24h / Cancelled 24h.
- **30-day send activity chart** — instance-wide sent/open/click/reply/bounce series across all users (Recharts, lazy-loaded).
- **Top senders leaderboard** — top-10 users by sends in the last 30 days.
- **Failure heatmap** — 7×24 grid of failed sends by IST hour, surfaces SMTP throttling windows.
- **Recent admin actions** — last 10 `admin.*` audit rows inline with a link to the full `/audit?scope=all` view.

### `/admin/users` — User management
- **Search + status filter** — All / Active / Suspended / Admins.
- **User table** — email, name, contacts/drafts/events counts, **Quota/day** column showing per-user override or "default", joined-at. Counts via 3 grouped queries instead of N+1.
- **Per-row drill-down drawer** (Eye icon) — slide-out panel with 30-day activity (sent/opens/clicks/replies/bounces/queued), inventory, settings (quota, throttle, domain caps, last-sent), and the last 10 sends with status badges.
- **Per-user quota override** (Key icon) — prompt sets `DAILY_SEND_LIMIT_OVERRIDE` in `settings`; scheduler-tick honors it instead of the env default. Empty/0 clears the override.
- **Impersonate** (UserCog icon) — mints a fresh 1h session for the target user, **revokes the admin's current session row** (so a leaked old cookie can't be replayed), and replaces the cookie. Refuses to impersonate another admin so the audit trail can't be laundered. Audit-logged with actor + target. Admin signs out and back in to recover their admin session.
- **Suspend / Resume** any non-admin user — soft-pauses their worker tick (queue stays intact).
- **Bulk Suspend / Resume** — checkbox column with select-all/indeterminate state. Skips admins + caller. Audit-logged.
- **Delete user** — cascades to all their data via FK.
- **Streamed users CSV** — `Download` button hits `/api/admin/users/export`. Pages 1000 rows at a time; safe past 100k users.

### `/admin/queue` — Queue health
- **Queue stats** — counts across all users with color-coded tones (stuck/failed in red, retrying in amber).
- **Active send queue** (next 50) — when, user, recipient, subject, status badge.
- **Recent failures** (last 20) — when, user, recipient, attempts, reason. Green "✓ No failures" when clean.
- **Recover stuck button** — flips any `Sending`-status row older than 10 min back to `Scheduled` so the next tick picks it up. Scoped to the exact ids seen at SELECT time so the reported count is accurate. Audit-logged.

### `/admin/webhooks` — Webhook delivery health
- **Health stats** — Total / Healthy (last < 400) / Failing (last ≥ 400) / Untested.
- **All webhooks table** — owner, URL, subscribed events, last HTTP status (color-coded), last delivery, last error.

### `/admin/system` — Operational config + tools
- **Database card** — driver (SQLite vs Turso/libSQL), file size (or "remote"), events 7d/prev-7d growth comparison, row counts across 12 tables.
- **Quota usage today** (rolling 24h) — top 20 users with sent/limit progress bars, color-coded green/amber/red at 70%/90% of their limit.
- **Global blocklist editor** — add/remove `null`-userId blocklist entries (apply to every user). Dedupes on add. Audit-logged.
- **Active campaigns table** — campaign, owner, status, enrollment counts (active/replied/completed/stopped). Hides archived.
- **Admins card** — chips for every email in `ADMIN_EMAILS`.
- **Runtime configuration card** — env values: `DAILY_SEND_LIMIT`, `TIMEZONE`, `SMTP_HOST`, `EMAIL_FROM`, `ALLOW_DEV_SIGNIN` (red when `true`), `CRON_SECRET` / `GROQ_API_KEY` / `GOOGLE_CLIENT_ID` / `ENCRYPTION_KEY` shown as set/unset (never raw), `DATABASE_URL` shape.
- **Bulk import contacts card** — admin-only XLSX/CSV upload with SSE progress. Tags rows `crm-import,job-tracker`. Idempotent (name+email dedupe).
- **Retention card** — manual "Purge now" runs `purgeOldEvents` + `purgeOldAudit` across every user immediately (bypasses the daily gate). Stamps `LAST_PURGE_AT` so the scheduler doesn't re-purge on its next tick.

### `/admin/broadcast` — Site-wide announcement
- 280-char message posts as an amber banner at the top of every signed-in page until cleared. Persisted as the latest `admin.broadcast` audit row; layout reads it via an `unstable_cache(['broadcast'], …)` wrapper that `broadcastAction` invalidates by tag. Empty submission clears it.

### Audit logging
- Every admin write action (delete user, suspend/resume, bulk suspend/resume, contact import, AI Improve draft/scheduled/campaign template, **set/clear quota**, **impersonate**, **global block add/remove**, **broadcast**, **recover stuck**, retention purge, backup download, users export) writes a row to `auditLog` so the cross-user audit view captures the trail.

### Sticky banners
- **Red** — when `ALLOW_DEV_SIGNIN=true` on a deployed env. Operator can't miss it.
- **Amber** — when an admin has posted a broadcast.

### `npm run import:admin-contacts -- <file>`

CLI alternative to the upload card. Refuses to run unless `ADMIN_EMAILS` is set and the target user matches. Idempotent. Same (name + email) dedupe rule. Tracks db-dupes vs in-file-dupes separately in the summary.

## Security & data hygiene

- **Encryption at rest** — `SMTP_PASS` + `GROQ_API_KEY` are AES-GCM encrypted before being written to `settings`. Key derives from `ENCRYPTION_KEY` (preferred) or falls back to `AUTH_SECRET`. See `lib/crypto.ts`.
- **Error sanitization** — server actions log full errors through pino but never echo driver / DB internals (SQLite / libsql / SQLSTATE / stack frames / file paths) to the client. Lives in `lib/action-error.ts`.
- **Mailer cache invalidation** — saving/clearing SMTP creds clears the cached nodemailer transports immediately, so credential rotations take effect on the next send instead of waiting for a process restart.
- **Cascade-delete safety net** — integration test covers user removal across 11 user-scoped tables + campaign children so the schema's FK cascades stay correct.
- **Retention purge** — `EVENTS_RETENTION_DAYS` (180), `AUDIT_RETENTION_DAYS` (365) per-user defaults. Scheduler runs `purgeOldEvents` + `purgeOldAudit` once per 24 h per user; manual "Purge now" on /admin bypasses the gate.

## Deployment / Ops

- **Dual DB driver** — `better-sqlite3` locally, `@libsql/client` (Turso) on Vercel; picked from `DATABASE_URL` shape.
- **Vercel-ready** — works on Hobby plan (cron driven from GitHub Actions, not vercel.json).
- **CI** — typecheck, tests, build, `npm audit --audit-level=high` (blocking) on every PR + weekly schedule.
- **Pino structured logs** with secret redaction.
- **CSP** — `default-src 'self'` in prod; `unsafe-eval` allowed only in dev for Fast Refresh.
- **Migrations** — drizzle-managed; `0004_api_keys_scopes` adds the `scopes` column (empty = back-compat full-access).

---

## AI features (Groq-powered)

All AI runs through the user's own Groq API key (Settings → AI) with env fallback. Default model `llama-3.3-70b-versatile`. Rate-limited 20/min/user.

- **AI Improve** on /drafts (admin-only), /schedule (admin-only), and /campaigns (admin-only) per step — pick a tone, rewrite the body, audit-logged. Drafts also get a 1-hour Undo via localStorage.
- **AI subject suggester** in the templates editor — generates 5 subject-line variants from the template's label/body. Click any to swap in.
- **AI company auto-fill** in `/companies` — given a company name, Groq fills industry, HQ, size, funding, tech stack, salary range, hiring frequency, and notes. Only writes to empty fields so it never clobbers user edits. Toast asks for manual verify (model can hallucinate).
- **AI opener generator** (server action ready) — `aiSuggestOpenerAction(contact, goal)` returns one short personalized opening line per contact. Used by /drafts AI Improve under the hood; a per-row button in /drafts and a /contacts bulk action will follow.

## Recently shipped (2026-06-05 — feature wave)

- **GitHub OAuth** — secondary social sign-in alongside Google + magic link. `GITHUB_ID` / `GITHUB_SECRET` env vars; Auth.js wires it automatically when present.
- **B1 Company Research** — per-user `/companies` page with industry, HQ, size, funding, tech stack, salary range, hiring frequency, notes. One row per (user, company-name); linked to contacts by case-insensitive name match. CRUD UI at `/companies`, `/companies/new`, `/companies/[id]`.
- **Multiple email identities per user** — `email_identities` table holds additional from-addresses beyond the legacy `settings.SMTP_*`. SMTP passwords AES-GCM encrypted at rest. `sendMail(m, userId, identityId)` honors the picked identity; falls back to the legacy creds when identityId is unset or resolves to a deleted row.
- **Campaign A/B testing** — `campaign_step_variants` table per step (multiple templates with weights). Scheduler-tick picks deterministically via `hash(stepId, contactId) % totalWeight` so the same contact always sees the same variant on every replay. Empty variant set → falls back to `step.templateId` (existing campaigns unchanged).
- **CSP nonce middleware** (opt-in) — `middleware.ts` generates a per-request nonce and emits a strict `script-src 'self' 'nonce-X' 'strict-dynamic'` CSP. Off by default (`CSP_NONCE=true` to enable) because every inline script in the app needs to thread the nonce first.
- **Playwright E2E impersonation spec** — `test/e2e/impersonation.spec.ts` exercises the admin → impersonate → banner → exit flow + a cookie-forgery attempt that the HMAC-signed `ea_impersonator` cookie defends against.

## Roadmap (not yet shipped)

- Multiple email identities per user (L).
- Campaign-level A/B testing — split contacts across two variant step sequences (L).
- Per-contact custom-field editor UI in the AddContact dialog (today you set them via the notes JSON suffix or the API).

If you want one of these, file an issue or open a PR.
