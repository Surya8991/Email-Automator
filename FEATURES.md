# Features

Everything Email Automator currently does, grouped by section.
Last refreshed: 2026-06-02.

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

- **Admin badge** in the topbar whenever the signed-in email is in `ADMIN_EMAILS`.
- **System-wide stats card** — instance-wide totals: Users, Contacts, Templates, Drafts pending, Sent (30d), Active campaigns. Fired in parallel; non-`admin` users never see the card.
- **Runtime configuration card** — env values that matter to instance operators: `DAILY_SEND_LIMIT`, `TIMEZONE`, `SMTP_HOST`, `EMAIL_FROM`, `ALLOW_DEV_SIGNIN` (red when `true`), `CRON_SECRET` / `GROQ_API_KEY` / `GOOGLE_CLIENT_ID` shown as set/unset only (never the raw value), `DATABASE_URL` shape (libsql vs file).
- **Bulk import contacts card** — admin-only XLSX/CSV upload with SSE progress bar. Same parser as the CLI; tags imported rows `crm-import,job-tracker`. Idempotent (skips on (name + email) match).
- **Search + status filter** — search by email/name, filter All / Active / Suspended / Admins.
- **User table** — email, name, contacts/drafts/events counts, joined-at. Counts use 3 grouped queries instead of the prior N+1 loop.
- **Suspend / Resume** any non-admin user — soft-pause their worker tick (queue stays intact).
- **Delete user** — cascades to all their data.
- **Audit logging** — every admin write action (delete user, suspend/resume, bulk suspend/resume, contact import, AI Improve draft/scheduled/campaign template, retention purge, backup download, users export) writes a row to `auditLog` so the cross-user audit view captures the trail.
- **Bulk suspend / resume** — per-page checkbox column with select-all/indeterminate state. Skips admins + the caller themselves with a clear "skipped" count. Audit-logged.
- **Streamed users CSV** — `Download` button on the user table hits `/api/admin/users/export`. Pages 1000 rows at a time so the user table can grow past 100k without OOMing.
- **Retention card** — manual "Purge now" runs `purgeOldEvents` + `purgeOldAudit` across every user immediately (bypassing the daily gate). Scheduler-tick runs the same purge once per 24 h per user by default (gated by `LAST_PURGE_AT` setting), so admins rarely need the button.
- **Sticky red banner** — when `ALLOW_DEV_SIGNIN=true` on a deployed env (Vercel or NODE_ENV=production), every (app) page renders a top-of-page banner so the operator can't ship it accidentally.
- **Rate-limited admin writes** — 60/min/admin per operation, capping accidental loops + Groq spend on AI Improve actions.

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

## Roadmap (not yet shipped)

- Multiple email identities per user (L).
- Campaign-level A/B testing — split contacts across two variant step sequences (L).
- Per-contact custom-field editor UI in the AddContact dialog (today you set them via the notes JSON suffix or the API).

If you want one of these, file an issue or open a PR.
