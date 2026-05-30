# Features

Everything Email Automator currently does, grouped by section.
Last refreshed: 2026-05-31.

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
- **One-click follow-up** — per-row "Schedule follow-up in N days" button. Pick a number, scheduler queues it.
- **CSV/Excel import** — `.csv`, `.xlsx`, `.xls`. Header names are fuzz-matched. Download the [starter template](https://email-automator-three.vercel.app/api/csv-template) for the canonical columns + sample rows.
- **CSV export** of all your contacts.
- **Tag filter** — comma-separated tags per contact; click a tag to filter, dropdown shows every tag you've used.
- **Search** by name / company / email / role.
- **Per-page select-all** + **bulk actions** — Add tag, Remove tag, Reset status, Block (one-step: add to blocklist + delete from contacts), Delete.
- **Per-contact timeline** — every event for this contact in one dialog.
- **Status field** — auto-tracks `Draft Created`, `Scheduled for …`, `Sent (…)`, `Replied!`, `BOUNCED`.

## Templates

- **20 starter templates** auto-seeded on first sign-in — 4 categories (Growth, Performance, SEO, Digital) × 5 tones (Formal, Friendly, Job-post, Referral, LinkedIn).
- **Clickable variable palette** — recipient fields (`{{name}}`, `{{company}}`, `{{role_name}}`, `{{email}}`, `{{location}}`, `{{platform}}`) plus HTML snippets (salutation, paragraph, bullet list, sign-off, divider). Click → token lands at cursor.
- **Live preview** — see how the email looks against a sample contact.
- **Email-safe styled wrapper** — every outgoing email gets a polished, Outlook-safe HTML shell automatically (rounded card, system font, max 600px, hidden preheader).
- **A/B subject lines** — set `subjectB`; the system deterministically splits 50/50 by contact id.
- **Active template** marker — exactly one per user; bulk-draft flow uses it.
- **Clone template** — duplicate any template with `-copy` suffix; useful for safe A/B without touching the original.
- **AI assist** — Groq (Llama 3.3): rewrite drafts in 5 tones, suggest subject lines, draft from scratch given a goal.

## Drafts

- **Bulk-create** drafts for every eligible contact (caps at 50/batch).
- **Live progress** via SSE — see send count tick up in real time.
- **Per-draft preview** — collapsible inline body view.
- **Inline edit** — fix subject + HTML body before sending without recreating from template.
- **Duplicate-send guard** — sending to a recipient you already emailed in the last 7 days surfaces a confirmation dialog with the previous send date.
- **One-click follow-up** — per draft, "Schedule follow-up in N days" button uses the active template + queues it in /schedule.
- **Send one** or **Send all**.
- **Retry failed** — re-run all pending drafts in one click.
- **Delete** individual drafts.

## Schedule

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

- **Multi-step sequences** — chain templates with per-step delays (hours) and "stop on reply".
- **Drag-orderable step list** (up/down arrows).
- **Enroll** by tag, by individual contacts, or all eligible.
- **Per-step performance** — sent / opens / clicks / replies / advanced counts per step, with % rates.
- **Pause / Resume / Archive** — soft-status flips without losing data.
- **Status filtering** in the campaign list.

## Analytics

- **KPIs (30d)** — sent, open rate, click rate, reply rate.
- **14-day line chart** — sent / open / click / reply / bounce by day.
- **Breakdown by template** (top 10, 30d) — sent count + open/click/reply rates.
- **Breakdown by campaign** (top 10, 30d).
- **Breakdown by tag** (top 10, 30d) — multi-tag contacts count for each.

## Dashboard

- **30-day KPIs** — contacts / pending drafts / sent / open / click / reply / bounce.
- **"Next send" card** — exactly when the worker will fire your next scheduled email + recipient + subject.
- **Recent activity (last 10)** — with contact email + campaign/step badge when applicable; live timestamps in user TZ.
- **First-run onboarding** banner with quick-start links.

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
- **CSV export** of the entire log.

## Blocklist

- **Per-user + global** patterns — email or domain.
- **Single add** or **bulk add** (paste a list, newline or comma separated; `@` autodetects type).
- **Auto-block** on unsubscribe click.
- **Auto-block** from the Contacts bulk-action toolbar.

## Diagnostic

- **One-click "Run checks"** — SMTP connect, AI key, Google OAuth config, DNS, SPF, DMARC.
- **Per-check Retry** button on any non-pass row.
- **Mailbox provider DMARC** is treated as pass (gmail.com, outlook.com, yahoo.com, icloud.com, proton.me, etc.) — you don't own these domains so you can't change their policy.
- **Send test email** to yourself.
- **Manual Reply / Bounce check** buttons (Gmail).

## Settings

- **General** — daily send limit, **timezone** (13-option dropdown, IST default), default role name, portfolio link, unsubscribe footer text + toggle, **emergency Pause Sends** kill-switch.
- **Email** — per-user SMTP (host, port, user, pass, From). Falls back to env if blank.
- **AI** — per-user Groq API key + model.
- **Auth** — current session info; sign out.
- **API keys** — create / revoke. SHA-256 hashed at rest; plaintext shown once at creation.
- **Webhooks** — subscribe a URL to event kinds; HMAC-signed (`X-EA-Signature`).
- **Data** — CSV export of contacts / DB backup (admin).
- **Danger zone** — wipe contacts / drafts / events / all-but-user.

## API & webhooks

- **`/api/v1/contacts`** — GET (list with search + tag + paging), POST (create). Bearer auth.
- **API keys** — `ea_…` prefix, SHA-256 hashed, last-used-at tracked.
- **Webhooks** — POST JSON to your URL on `sent / open / click / reply / bounce / unsubscribe`. HMAC-SHA256 signature header.

## Admin

- **User table** — email, name, contacts/drafts/events counts, joined-at.
- **Suspend / Resume** any non-admin user — soft-pause their worker tick (queue stays intact).
- **Delete user** — cascades to all their data.
- **Admin badge** on rows + admin list card.

## Deployment / Ops

- **Dual DB driver** — `better-sqlite3` locally, `@libsql/client` (Turso) on Vercel; picked from `DATABASE_URL` shape.
- **Vercel-ready** — works on Hobby plan (cron driven from GitHub Actions, not vercel.json).
- **CI** — typecheck, tests, build, `npm audit --audit-level=high` (blocking) on every PR + weekly schedule.
- **Pino structured logs** with secret redaction.
- **CSP** — `default-src 'self'` in prod; `unsafe-eval` allowed only in dev for Fast Refresh.

---

## Roadmap (not yet shipped)

- **User-defined custom fields** — declare your own `{{vars}}` per contact (needs schema migration).
- Per-recipient throttle (e.g. "max 1 email per contact per 30 days") — *partial: duplicate-send guard ships now*.
- Per-domain rate limit (e.g. "max 50/day to @gmail.com").
- Multiple email identities per user.
- Campaign-level A/B (split contacts across two variant step sequences).
- Send-time effectiveness heatmap (best hour to send).
- CSV import error report (per-row fail reasons).
- Searchable audit log with date-range filter.
- MX record check on Diagnostic.

If you want one of these, file an issue or open a PR.
