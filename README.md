# Email Automator

A job-application outreach tool with two implementations in this repo:

- **`web/`** — **the current v2.** Next.js 15 App Router, TypeScript strict,
  Tailwind + shadcn/ui, Drizzle ORM on better-sqlite3, Auth.js (magic-link +
  Google), Anthropic SDK for AI assist. See [`web/README.md`](web/README.md).
- **`standalone/`** — v1, Express + sql.js + vanilla-JS SPA. Hardened during
  Phase 1 (security fixes pinned by `standalone/test/security.test.js`). Kept
  running for cutover; will be removed once `web/` reaches parity.
- **`Code_Rewritten.gs`** — the original Google Apps Script (Gmail-bound).

A pre-rewrite snapshot of everything lives in
`archive/v1-express-2026-05-30/` and at git tag `v1-pre-rewrite`.

## Run v2

```bash
cd web
cp .env.example .env       # edit values
npm install
npm run db:generate && npm run db:migrate
npm run dev                # http://localhost:3000
npm run worker             # background scheduler in another shell
```

## Run v1 (legacy)

```bash
cd standalone
npm install
npm start                  # http://localhost:3000
npm test                   # vitest — 29 tests including the security suite
```

## Phases

The rewrite was driven by the plan at
`~/.claude/plans/do-a-deep-review-temporal-cherny.md`:

1. **Phase 0** — archive originals + git tag
2. **Phase 1** — fix-first in `standalone/` (security + correctness)
3. **Phase 2** — Next.js scaffold + DB + auth + services + UI
4. **Phase 3** — analytics, template editor, campaigns, AI assist
5. **Phase 4** — unit + integration + Playwright tests, lint, CI
