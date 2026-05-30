# Archive — v1 Express App (2026-05-30)

**Snapshot of the original Express + sql.js + vanilla-JS implementation** taken immediately before the Phase 1 security hardening pass and the Phase 2 Next.js rewrite.

- **Date:** 2026-05-30
- **Source commit:** `7c0972f5e4f91152c16659c821535598e2fa7b9f` (branch `main`)
- **Git tag:** `v1-pre-rewrite`

## Why this archive exists

The live `standalone/` tree is about to receive (1) security fixes that change behavior (CSP, OTP RNG, scheduler isolation, debounced DB flush) and (2) eventual deprecation in favor of `web/` (Next.js 15). This snapshot preserves the pre-change codebase for diffing, rollback, and side-by-side cutover testing.

## What's included

- `standalone/` — full source tree minus `node_modules/`, `uploads/`, and `data/tracker.db`
- `Code_Rewritten.gs` — Google Apps Script implementation
- `package.json`, `package-lock.json` — repo root
- `README.v1.md` — the original README
- `Universal_Job_Tracker_FINAL.xlsx` — sample data

## How to run the archived app

```powershell
cd archive\v1-express-2026-05-30\standalone
npm install
$env:PORT = "3001"   # avoid colliding with the live app on 3000
npm start
```

Then open <http://localhost:3001>.

## Known issues fixed AFTER this snapshot

See `C:\Users\surya\.claude\plans\do-a-deep-review-temporal-cherny.md` Phase 1 punch-list. The most serious are:

1. Scheduler multi-tenant data leak (`scheduler.js:42`)
2. Google OAuth missing `state` (CSRF)
3. SSE endpoint had no auth
4. HTML / CRLF injection in template personalization
5. OTP used `Math.random()`
6. CSP disabled
