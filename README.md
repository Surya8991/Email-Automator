# 📬 Email Automator

Self-hosted email outreach. Templates with variables, multi-step campaigns
with A/B testing, open/click tracking, AI-assisted writing (Groq), per-user
multi-tenant isolation, company research, multiple from-identities, audit
log, JSON API + webhooks, and a 6-tab admin dashboard for operators.

**Sign in with** Google · GitHub · email magic link.

**Stack:** Next.js 16 · React 19 · TypeScript strict · Tailwind / shadcn ·
Drizzle ORM on SQLite (better-sqlite3 local / Turso on Vercel) · Auth.js v5
· Groq (Llama 3.3) · Pino.

📖 [FEATURES.md](FEATURES.md) · 🚀 [DEPLOYMENT.md](DEPLOYMENT.md) · 🤖 [AGENTS.md](AGENTS.md)

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

Private project.
