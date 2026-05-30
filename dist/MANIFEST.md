# Email Automator — Final Build (2026-05-30)

Built from git commit `45b8b12` on `main`.

## Verification matrix (all green)

| Check                                    | Result            |
|------------------------------------------|-------------------|
| `standalone/` Vitest                     | **29 / 29**       |
| `web/` Vitest (unit + integration)       | **23 / 23**       |
| `web/` `tsc --noEmit` (strict)           | clean             |
| `web/` `next build`                      | 15 / 15 routes    |
| `web/` Playwright E2E (chromium)         | **3 / 3**         |
| Live HTTP probes — standalone @ :3099    | all 200 / 401 / 403 as expected |
| Live HTTP probes — web @ :3000           | all 200 / 307 / 401 as expected |

## Bugs found and fixed during the verification round

1. `services/templates.activate` used an async `db.transaction()` — invalid for
   better-sqlite3 (sync only). Replaced with two sequential updates.
2. `requireUser()` threw on missing session; in Next 15 App Router pages stream
   alongside layouts, so the page rendered a 500 instead of letting the layout
   redirect. Both helpers now call `next/navigation` `redirect()`.
3. `scripts/migrate.ts` + `workers/scheduler.ts` imported `dotenv` (not in
   `package.json`). Both now use an inline minimal `.env` loader.
4. Scheduler backoff test depended on a specific `Math.random()` draw. Rewritten
   to assert on the full jitter window across 50 samples per attempt.

## Zip contents

| File                                          | Contents |
|-----------------------------------------------|----------|
| `Email-Automator-FINAL-2026-05-30.zip`        | **The whole repo** minus `node_modules`, `.next`, `data`, `.git`, `dist`. Drop-in replacement for the project folder. |
| `web-v2-2026-05-30.zip`                       | Just `web/` (Next.js 15 app, source only). |
| `standalone-v1-hardened-2026-05-30.zip`       | Just `standalone/` (Express, post-Phase-1 hardening). |
| `v1-express-2026-05-30.zip`                   | The pre-rewrite snapshot from `archive/`, identical to git tag `v1-pre-rewrite`. |

## After unzipping `Email-Automator-FINAL-...zip`

```powershell
# v2 (recommended)
cd web
cp .env.example .env        # then edit
npm install --legacy-peer-deps
npm run db:migrate
npm run dev                 # http://localhost:3000
npm run worker              # in another shell

# v1 (legacy hardened, for cutover)
cd standalone
npm install
npm start                   # http://localhost:3000 (set PORT to coexist with v2)
npm test                    # 29 vitest tests including the security suite
```

## SHA-256 fingerprints

Run `Get-FileHash <file> -Algorithm SHA256` to verify. Short hashes captured
at build time:

- `Email-Automator-FINAL-2026-05-30.zip` → `01D38A77BCA8BA1B…`
- `web-v2-2026-05-30.zip`                → `2F793F22CC9707E5…`
- `standalone-v1-hardened-2026-05-30.zip`→ `F9FD256AAC947685…`
- `v1-express-2026-05-30.zip`            → `59F4E89E00ADC760…`
