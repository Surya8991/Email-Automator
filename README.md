# Email Automator

A self-hosted email outreach tool. Templates with variables, multi-step
campaigns, open/click tracking, AI-assisted writing (Groq), per-user
multi-tenant isolation, full audit log.

Two implementations live in this repo:

- **`web/`** — current v2. Next.js 15 (App Router) + TypeScript strict +
  Tailwind + shadcn-style UI + Drizzle ORM on better-sqlite3 + Auth.js (magic
  link + Google). This is the one you should run.
- **`standalone/`** — v1. Express + sql.js + vanilla-JS SPA. Hardened during
  Phase 1 (security fixes pinned by `standalone/test/security.test.js`) and
  kept around for cutover. It runs.
- **`Code_Rewritten.gs`** — the original Google Apps Script (Gmail-bound).

A pre-rewrite snapshot lives in `archive/v1-express-2026-05-30/` and at git
tag `v1-pre-rewrite`.

---

## TL;DR — run v2 in 60 seconds

```bash
cd web
cp .env.example .env             # edit AUTH_SECRET, SMTP_*, (optionally GROQ_API_KEY)
npm install --legacy-peer-deps
npm run db:migrate
npm run dev                      # http://localhost:3000
# in another shell:
npm run worker                   # background scheduler / campaign advancer
```

Open <http://localhost:3000/login>. If you set `ALLOW_DEV_SIGNIN=true` and
`DEV_BYPASS_EMAILS=test@gmail.com` in `.env`, you'll see a one-click sign-in
button for testing without SMTP.

For the full A-to-Z setup (Gmail App Password, Google OAuth, Groq key,
deployment), open **`/guide`** in the running app — it's the most current
documentation.

---

## What it does

| Feature | Where |
|---|---|
| Contacts (CSV/XLSX import + export, tags, timeline) | `/contacts` |
| Templates (editor + live preview + variables + A/B subject + AI rewrite via Groq) | `/templates` |
| Drafts (bulk create with SSE progress, individual send) | `/drafts` |
| Dry-run preview (first 100 contacts × active template) | `/dry-run` |
| Schedule (date/time picker, preview, queue, cancel) | `/schedule` |
| Campaigns (multi-step sequences with delays + stop-on-reply) | `/campaigns` |
| Analytics (KPIs + 14-day chart, fed by tracking pixel + click rewriting) | `/analytics` |
| Blocklist (per-user + global; unsubscribe link auto-adds to global) | `/blocklist` |
| Audit log (last 500 actions) | `/audit` |
| Profile + Settings (tabbed: General/Email/AI/Auth/Data/Danger) | `/profile`, `/settings` |
| Diagnostic (SMTP test, DNS/SPF/DMARC, AI/OAuth checks) | `/diagnostic` |
| Admin (per-user stats, delete user, full DB backup) | `/admin` |
| Command palette (⌘K) | global |
| User guide | `/guide` |

Backend bits: Server Actions for every mutation, Drizzle migrations,
better-sqlite3 with WAL + `foreign_keys = ON`, per-user SSE fan-out,
HMAC-signed tracking + unsubscribe tokens.

---

## Project layout

```
.
├── archive/v1-express-2026-05-30/   # pre-rewrite snapshot (tag: v1-pre-rewrite)
├── standalone/                       # legacy Express + sql.js + vanilla SPA (hardened)
├── web/                              # ← current Next.js 15 app
│   ├── app/                            App Router pages, route handlers, layouts
│   ├── components/                     UI + shared components
│   ├── lib/                            env, escape, utils
│   ├── server/
│   │   ├── db/                         schema + client + migrations
│   │   ├── services/                   pure business logic (testable in isolation)
│   │   └── actions/                    typed Server Actions (Zod-validated)
│   ├── workers/scheduler.ts            standalone Node process — sends scheduled + advances campaigns
│   ├── scripts/{migrate,seed-templates}.ts
│   ├── test/{unit,integration,e2e}/    Vitest + Playwright
│   └── README.md
├── Code_Rewritten.gs                 # Google Apps Script (Gmail-bound) implementation
└── dist/                             # zipped builds (see dist/MANIFEST.md)
```

---

## Tests

```bash
# v2
cd web && npm run typecheck && npm test && npm run e2e

# v1 (legacy)
cd standalone && npm test
```

Current matrix:

| Suite | Result |
|---|---|
| standalone Vitest | 29/29 |
| web Vitest (unit + integration + worst-case) | 35/35 |
| web `tsc --noEmit` (strict) | clean |
| web Playwright (chromium) | 3/3 |

---

## Security model (short version)

- Every Server Action and protected page calls `requireUser()`; no implicit
  fallback user id exists
- All template variable substitution is HTML-escaped (body) or CR/LF-stripped
  (subject); `assertNoCrlf()` runs on every outgoing email header
- Tracking pixel and click URLs are HMAC-SHA256 signed with `AUTH_SECRET`
- Dev sign-in is hard-disabled in production unless `ALLOW_DEV_SIGNIN=true`
- DB backup endpoint is admin-only (`/api/backup`)
- Atomic template activation; unique constraint on campaign enrollments;
  per-tenant ownership re-check on cross-object references (e.g. attaching a
  template to a campaign step)
- Hardened CSP, X-Frame-Options DENY, no inline scripts in v2

Full audit + fix history is in the git log.

---

## License

Private project.
