// Public landing page that renders the project README as styled HTML.
// Lives in the (no-layout) root so it's accessible without authentication,
// useful for sharing the deployed URL with a collaborator before they sign in.
import Link from 'next/link'
import { Workflow, ExternalLink } from 'lucide-react'

export const metadata = { title: 'Email Automator — README' }

export default function ReadmePage() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-background to-muted/30">
      <header className="border-b bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <Workflow className="h-5 w-5 text-primary" /> Email Automator
          </Link>
          <Link href="/login" className="text-sm underline">Sign in →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 prose prose-sm dark:prose-invert
        prose-headings:tracking-tight prose-h1:text-4xl prose-h2:mt-10 prose-h2:border-b prose-h2:pb-1
        prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-md prose-a:text-primary">

        <h1>Email Automator</h1>
        <p className="lead">
          Self-hosted email outreach. Templates with variables, multi-step campaigns,
          open/click tracking, AI-assisted writing (Groq), per-user multi-tenant
          isolation, full audit log.
        </p>

        <p>
          <Link href="/login" className="inline-flex items-center gap-1 no-underline rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
            Try the live app <ExternalLink className="h-3 w-3" />
          </Link>
          {' '}
          <Link href="/guide" className="inline-flex items-center gap-1 no-underline rounded-md border px-4 py-2 hover:bg-accent">
            Read the user guide
          </Link>
        </p>

        <h2 id="run">Run in 60 seconds</h2>
        <pre>{`cd web
cp .env.example .env             # edit AUTH_SECRET, SMTP_*, (optionally GROQ_API_KEY)
npm install --legacy-peer-deps
npm run db:migrate
npm run dev                      # http://localhost:3000
# in another shell:
npm run worker                   # background scheduler / campaign advancer`}</pre>

        <h2 id="features">What it does</h2>
        <table>
          <thead><tr><th>Feature</th><th>Where</th></tr></thead>
          <tbody>
            <tr><td>Contacts (CSV/XLSX import + export, tags, timeline)</td><td><code>/contacts</code></td></tr>
            <tr><td>Templates (editor + live preview + A/B subject + AI rewrite)</td><td><code>/templates</code></td></tr>
            <tr><td>Drafts (bulk with SSE progress, individual send)</td><td><code>/drafts</code></td></tr>
            <tr><td>Dry-run preview (first 100 × active template)</td><td><code>/dry-run</code></td></tr>
            <tr><td>Schedule (date/time, preview, queue, cancel)</td><td><code>/schedule</code></td></tr>
            <tr><td>Campaigns (multi-step sequences with delays)</td><td><code>/campaigns</code></td></tr>
            <tr><td>Analytics (opens + clicks + replies)</td><td><code>/analytics</code></td></tr>
            <tr><td>Blocklist (per-user + global; unsubscribe auto-adds)</td><td><code>/blocklist</code></td></tr>
            <tr><td>Audit log (last 500 actions)</td><td><code>/audit</code></td></tr>
            <tr><td>Profile + Settings (tabbed)</td><td><code>/profile</code>, <code>/settings</code></td></tr>
            <tr><td>Diagnostic (SMTP / DNS / SPF / DMARC)</td><td><code>/diagnostic</code></td></tr>
            <tr><td>Admin (per-user stats, delete user, DB backup)</td><td><code>/admin</code></td></tr>
            <tr><td>Command palette (⌘K)</td><td>global</td></tr>
            <tr><td>User guide (the whole manual)</td><td><Link href="/guide"><code>/guide</code></Link></td></tr>
          </tbody>
        </table>

        <h2 id="stack">Stack</h2>
        <ul>
          <li><strong>Next.js 16</strong> App Router (Turbopack) + TypeScript strict (<code>noUncheckedIndexedAccess</code>)</li>
          <li><strong>Tailwind</strong> + shadcn-style components</li>
          <li><strong>Drizzle ORM</strong> on <strong>better-sqlite3</strong> (WAL, foreign keys on)</li>
          <li><strong>Auth.js v5</strong> — Email (magic link) + Google providers, DB-backed sessions</li>
          <li><strong>Groq</strong> (Llama 3.3 70B) for AI-assist writes</li>
          <li><strong>Vitest</strong> + <strong>Playwright</strong> for tests</li>
          <li><strong>Nodemailer</strong> for outbound</li>
        </ul>

        <h2 id="tests">Tests</h2>
        <pre>{`npm run typecheck && npm test && npm run e2e`}</pre>
        <ul>
          <li>Web Vitest (unit + integration + worst-case): <strong>35/35</strong></li>
          <li><code>tsc --noEmit</code> strict: <strong>clean</strong></li>
          <li>Playwright (chromium): <strong>3/3</strong></li>
          <li>Standalone (legacy v1) Vitest: <strong>29/29</strong></li>
        </ul>

        <h2 id="security">Security model</h2>
        <ul>
          <li>Every Server Action and protected page calls <code>requireUser()</code></li>
          <li>HTML-escape body / CRLF-strip subject / <code>assertNoCrlf</code> on every header</li>
          <li>HMAC-SHA256 signed tracking and unsubscribe tokens (keyed by <code>AUTH_SECRET</code>)</li>
          <li>Dev sign-in disabled in production unless <code>ALLOW_DEV_SIGNIN=true</code></li>
          <li>DB backup endpoint is admin-only</li>
          <li>Atomic template activation; unique <code>(campaign, contact)</code> enrollment</li>
          <li>100k row hard cap on CSV/XLSX imports</li>
          <li>Strict CSP headers</li>
        </ul>

        <h2 id="deploy">Deployment</h2>
        <p>Full details in <Link href="/guide#deploy">/guide → 15. Deployment options</Link>. Short version:</p>
        <ul>
          <li><strong>Self-hosted Linux:</strong> <code>pm2</code> + the SQLite file in <code>./data/</code>.</li>
          <li><strong>Vercel:</strong> swap SQLite → Turso/Postgres; worker → Vercel Cron.</li>
          <li><strong>Docker:</strong> mount <code>./data</code> as a volume.</li>
        </ul>

        <h2 id="links">Links</h2>
        <ul>
          <li><Link href="/login">Sign in</Link></li>
          <li><Link href="/guide">User guide (in-app)</Link></li>
        </ul>

        <hr />
        <p className="text-xs text-muted-foreground">
          Email Automator v2 · Next 16 · React 19 · Drizzle · Auth.js v5 · Groq · 100% self-hosted
        </p>
      </main>
    </div>
  )
}
