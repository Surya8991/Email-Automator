# Deployment

Three supported targets. The user-facing version of this doc lives at
`/guide#deploy` inside the running app.

---

## 1. Self-hosted Linux (recommended)

The cleanest setup. SQLite file persists, worker is a long-running process.

```bash
# one-time
git clone <repo> /opt/email-automator
cd /opt/email-automator/web
cp .env.example .env                 # fill in everything
npm install --legacy-peer-deps
npm run build
npm run db:migrate
npm run seed:templates -- you@example.com   # optional

# run
npm install -g pm2
pm2 start npm --name email-automator-web    -- start
pm2 start npm --name email-automator-worker -- run worker
pm2 save
pm2 startup                           # auto-start on boot
```

Reverse-proxy with nginx/Caddy. Back up `./data/` (rsync, restic).

---

## 2. Docker

A `Dockerfile` is in this folder.

```bash
docker build -t email-automator .
docker run -d \
  --name email-automator \
  -p 3000:3000 \
  -v $PWD/data:/app/data \
  --env-file .env \
  email-automator
```

Run the worker as a sidecar container with `--entrypoint "npm run worker"`,
or run `npm run worker` inside the main container under tini/s6/etc.

---

## 3. Vercel

Works for the UI, but Vercel is serverless — **the SQLite file does not
persist**. You need a hosted DB and a cron-triggered worker.

### Database

Pick one:

**Turso (recommended)** — libSQL, near drop-in for SQLite:

```bash
npm i @libsql/client
```

Swap `server/db/client.ts`:

```ts
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
export const db = drizzle(client, { schema })
```

Set:

```
DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<token>
```

**Vercel Postgres / Neon** — change schema to `pgTable` + use Drizzle's pg
adapter. Heavier migration; only do this if you already have a Postgres in your stack.

### Worker → Vercel Cron

The repo includes `app/api/cron/tick/route.ts` and `vercel.json` already
configured to hit it every minute:

```json
{ "crons": [{ "path": "/api/cron/tick", "schedule": "*/1 * * * *" }] }
```

Set `CRON_SECRET` in Vercel env vars; the route checks the `Authorization: Bearer ${CRON_SECRET}`
header (Vercel sets it automatically) or `?secret=...` query param.

### Env vars to set in Vercel

```
AUTH_SECRET=<openssl rand -hex 32>
APP_URL=https://your-domain.com
NEXTAUTH_URL=https://your-domain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=<gmail app password>
EMAIL_FROM="You <you@gmail.com>"
GROQ_API_KEY=gsk_...                  # optional
GOOGLE_CLIENT_ID=...                  # optional
GOOGLE_CLIENT_SECRET=...              # optional
ADMIN_EMAILS=you@gmail.com
DATABASE_URL=libsql://...             # required for Vercel
TURSO_AUTH_TOKEN=...                  # required for Vercel
CRON_SECRET=<openssl rand -hex 24>    # required for Vercel cron
DAILY_SEND_LIMIT=50
```

Do **not** set `ALLOW_DEV_SIGNIN=true` in a hosted environment.

### Push

```bash
# from the project root
vercel link
vercel --prod
```

---

## Smoke checklist after deploy

1. Visit `/login` → page renders
2. Sign in via your configured method
3. `/dashboard` shows zero KPIs + the onboarding card
4. `/diagnostic` → "Run checks" → SMTP / Groq / OAuth / SPF / DMARC all
   show ✓ or a clear "set X in .env" message
5. Add one contact, activate a template, create one draft, send it to
   yourself — verify it arrives and `/analytics` shows one `sent` event
   (and `open` after you view the mail)
