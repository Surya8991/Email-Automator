# Deployment

Three supported targets. The user-facing version of this doc lives at
`/guide#deploy` inside the running app.

---

## 1. Self-hosted Linux (recommended)

The cleanest setup. SQLite file persists, worker is a long-running process.

```bash
# one-time
git clone <repo> /opt/email-automator
cd /opt/email-automator
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

The UI runs as Lambdas. SQLite files don't persist between invocations, so
you need a hosted DB and a cron-triggered worker — **both are wired**.

### Database — Turso (zero code changes needed)

`server/db/client.ts` auto-detects the driver from `DATABASE_URL`:
- relative or absolute path → better-sqlite3 (local dev)
- `libsql://…` or `https://…` → @libsql/client (Vercel)

Same schema, same migrations, same SQL — Turso is wire-compatible with SQLite.

1. Create the Turso DB once from your laptop:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth signup
   turso db create email-automator
   turso db show email-automator --url      # → libsql://email-automator-<org>.turso.io
   turso db tokens create email-automator   # → eyJ…
   ```
2. Apply migrations to the new Turso DB:
   ```bash
   DATABASE_URL=libsql://email-automator-<org>.turso.io \
   TURSO_AUTH_TOKEN=eyJ… \
   npm run db:migrate
   ```
3. (Optional) Seed starter templates after you sign in once via Vercel:
   ```bash
   DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… \
   npm run seed:templates -- you@example.com
   ```

**Alternative: Vercel Postgres / Neon** — heavier swap; change `sqliteTable`
to `pgTable` in `server/db/schema.ts` and use Drizzle's pg adapter. Only
worth it if Postgres is already part of your stack.

### Worker → GitHub Actions cron (free)

Vercel's Hobby plan caps cron schedules at **1 per day**, so we use GitHub
Actions instead — runs every 5 min, free, no credit card.

The workflow `.github/workflows/cron-tick.yml` is already in the repo. To
enable it on your fork:

1. **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**
   - `APP_URL` = your Vercel URL (e.g. `https://email-automator-three.vercel.app`)
   - `CRON_SECRET` = same value you set in Vercel env vars
2. Done. First run fires within 5 min of the push.

You can also trigger a tick manually: GitHub → Actions tab → "Cron tick" → "Run workflow".

**If you upgrade to Vercel Pro**, you can re-enable the in-platform cron by
adding back `"crons": [{ "path": "/api/cron/tick", "schedule": "*/1 * * * *" }]`
in `vercel.json` and disabling the GitHub workflow.

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
ENCRYPTION_KEY=<openssl rand -base64 32>   # recommended (decouples SMTP_PASS/GROQ_API_KEY encryption from AUTH_SECRET)
DAILY_SEND_LIMIT=50
```

Do **not** set `ALLOW_DEV_SIGNIN=true` in a hosted environment. If you do anyway,
every (app) page renders a sticky red banner so the operator can't miss it.

### Encryption key rotation

`SMTP_PASS` and `GROQ_API_KEY` are AES-GCM encrypted at rest. The key is
derived from `ENCRYPTION_KEY` if present, else from `AUTH_SECRET`. Rotating
the key invalidates every saved credential — the decrypt path returns `""`
so the app keeps running but users have to re-enter SMTP / Groq creds. If you
need a hard rotation, plan a re-encrypt CLI step in the same change.

### Retention

Events and audit-log rows are auto-pruned daily by the scheduler tick.
Defaults: events 180 days, audit 365 days. Override per-user via the
`EVENTS_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS` settings. Admins can hit
"Purge now" on `/admin` to bypass the daily gate.

### API key scopes

API keys carry per-key scopes (`read:contacts`, `write:contacts`). Routes
check the required scope on every call — keys without a scope return 403.
Keys created before migration `0004_api_keys_scopes` keep working as
full-access (empty scopes = legacy back-compat).

### Admin dashboard

The admin surface lives at `/admin` with 6 tabs: **Overview** (KPIs, queue
snapshot, top-senders leaderboard, failure heatmap), **Users** (per-user
quota override, impersonation, drill-down drawer), **Queue** (active queue
view + recover-stuck button), **Webhooks** (per-webhook delivery health),
**System** (DB size, table row counts, quota usage, global blocklist,
active campaigns, runtime config, retention purge), and **Broadcast**
(post a banner across every signed-in page).

Every admin write action is rate-limited 60/min/admin and audit-logged.
Impersonation revokes the admin's current session row when entering so a
leaked old cookie can't be replayed; admin-to-admin impersonation is
refused. Admin signs out and back in to recover their own session.

### Per-user quota override

The global `DAILY_SEND_LIMIT` env var is the default. Admins can override
on a per-user basis from `/admin/users` → key icon → set a number;
scheduler-tick honors `settings.DAILY_SEND_LIMIT_OVERRIDE` before falling
back to env. Empty / 0 clears the override.

### Rate limiter on multi-instance deploys

`lib/rate-limit.ts` is an in-memory sliding-window limiter. On Vercel, each
Lambda has its own bucket — the effective limit is `max × instance_count`.
A one-shot warning logs to stderr on first use when `VERCEL=1` and no
`REDIS_URL` is set. Swap to a Redis-backed implementation before relying
on these for security at scale.

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
