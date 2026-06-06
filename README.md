# 📬 Email Automator

Self-hosted email outreach. Templates with variables, multi-step campaigns
with A/B testing, open/click tracking, AI-assisted writing (Groq), per-user
multi-tenant isolation, company research, multiple from-identities, audit
log, JSON API + Slack/Discord webhooks, GDPR data export, PWA install, and
a 6-tab admin dashboard for operators.

**Sign in with** Google · GitHub · email magic link.

**Stack:** Next.js 16 · React 19 · TypeScript strict · Tailwind / shadcn ·
Drizzle ORM on SQLite (better-sqlite3 local / Turso on Vercel) · Auth.js v5
· Groq (Llama 3.3) · Pino.

📖 [FEATURES.md](FEATURES.md) · 🚀 [DEPLOYMENT.md](DEPLOYMENT.md) · 🤖 [AGENTS.md](AGENTS.md) · ⚙️ [OPERATOR_TODO.html](OPERATOR_TODO.html)

## Highlights

- 💼 **AI Job Tracker** — 14 dedicated adapters (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Breezy HR, Recruitee, Personio, Teamtailor, Workday, Naukri, Foundit, Internshala, Remote OK, Remotive, Adzuna, Jooble) + JSON-LD + AI fallback. Salary / location / remote-scope normalization at ingest. Cross-board dedup (canonical adapters win over aggregators). **15-day ingest window** keeps only fresh roles. **2 000-lead limit** per status bucket. Marketing-first sort with 📣 DM badge + seniority chips (Intern / Jr / Senior+ / Exec). Relative posted date. Delete-by-age (7 d / 2 w / 1 m / 2 m). Cancel button for mid-run fetches. New → Saved → Applied / Ignored triage with Restore to New or Saved.
- 🎨 **Polished UI** — consistent `PageHeader` + `EmptyState` everywhere, 5-color accent picker, dark/light themes, PWA-installable.
- ⚡ **Smart draft creation** — pick template + filters (platform, job title, location, skip-recently-contacted), live eligible counter + sample preview.
- 📅 **Schedule from drafts** — convert selected drafts straight into staggered scheduled sends.
- 🔍 **⌘K palette searches your data** — contacts, templates, drafts, campaigns. Plus `?` for shortcut help.
- 🧪 **Diagnostic Quick + Full runs** — grouped by Connectivity / Background / Deliverability / Admin with inline "how to fix" per warn.
- 📚 **Sticky guide TOC** with scroll-spy and client-side search.
- 🪝 **Slack / Discord notifications** for send-completed / bounce / reply.
- 📦 **GDPR data export** — one-click JSON dump of every row you own.
- 👀 **Presence pill** on campaign detail (lightweight, per-instance).

---

## Run locally

```bash
cp .env.example .env             # fill in AUTH_SECRET, SMTP_*, etc.
npm install --legacy-peer-deps
npm run db:migrate
npm run dev                      # http://localhost:3000
# in another shell:
npm run worker                   # scheduler / campaign advancer
```

For one-click dev sign-in (no SMTP), add to `.env`:

```
ALLOW_DEV_SIGNIN=true
DEV_BYPASS_EMAILS=you@gmail.com
```

You'll see a "Sign in (dev)" button on `/login`. **Turn off before
sharing the instance** — a red banner reminds you if you forget.

---

## Test & build

```bash
npm run typecheck   # tsc --noEmit, strict
npm test            # Vitest
npm run build       # Next prod build
```

---

## Deploy

Vercel (recommended, Hobby plan works) or self-hosted Linux / Docker. The
DB driver auto-detects from `DATABASE_URL`. Walk through it with
[SETUP.html](SETUP.html) or read [DEPLOYMENT.md](DEPLOYMENT.md).

---

## License

MIT — see [LICENSE](LICENSE).
