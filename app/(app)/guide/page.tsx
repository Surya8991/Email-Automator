import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 py-0.5 text-xs font-mono">{children}</kbd>
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
}
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
        <a href={`#${id}`} className="text-muted-foreground hover:text-primary">#</a>
        {title}
      </h2>
      {children}
    </section>
  )
}

const TOC = [
  ['quick-start', '1. Quick start (5 minutes)'],
  ['concepts',    '2. How it all fits together'],
  ['contacts',    '3. Contacts & tags'],
  ['templates',   '4. Templates (variables, A/B, AI)'],
  ['drafts',      '5. Drafts & sending'],
  ['schedule',    '6. Schedule (one-off blast)'],
  ['campaigns',   '7. Campaigns (multi-step sequences)'],
  ['analytics',   '8. Analytics & tracking'],
  ['blocklist',   '9. Blocklist & unsubscribe'],
  ['settings',    '10. Settings, profile, signature'],
  ['admin',       '11. Admin (multi-user)'],
  ['api',         '12. API reference'],
  ['env',         '13. Environment variables (A–Z)'],
  ['setup',       '14. Full setup from scratch'],
  ['deploy',      '15. Deployment options'],
  ['troubleshoot','16. Troubleshooting'],
  ['shortcuts',   '17. Keyboard shortcuts'],
] as const

export default function GuidePage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">User guide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything Email Automator does, how to use each feature, and the full API + env reference.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Contents</CardTitle></CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-2 text-sm">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-muted-foreground hover:text-primary hover:underline">{label}</a>
          ))}
        </CardContent>
      </Card>

      <Section id="quick-start" title="1. Quick start (5 minutes)">
        <ol className="list-decimal pl-6 space-y-2 text-sm">
          <li>Go to <Link href="/profile" className="underline">Profile</Link>. Set your name, portfolio link, and signature (HTML).</li>
          <li>Open <Link href="/templates" className="underline">Templates</Link>. Pick one (e.g. "Growth Marketer · Professional & Formal"), click <strong>Activate</strong>.</li>
          <li>Open <Link href="/contacts" className="underline">Contacts</Link> → <strong>Sample CSV</strong> downloads a starter. Edit it, save, then <strong>Import</strong>.</li>
          <li>Open <Link href="/dry-run" className="underline">Dry run</Link>. First 100 eligible contacts show with their personalized subject + body. Nothing is sent.</li>
          <li>Open <Link href="/drafts" className="underline">Drafts</Link> → set count to 5 → <strong>Create drafts</strong>. SSE progress fills.</li>
          <li>Click <strong>Send</strong> on each draft. The send injects a tracking pixel + rewrites links automatically.</li>
        </ol>
      </Section>

      <Section id="concepts" title="2. How it all fits together">
        <p className="text-sm">Three core objects:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Contacts</strong> — your audience, optionally tagged.</li>
          <li><strong>Templates</strong> — subject + HTML body with <Code>{'{{name}}'}</Code> variables. Exactly one is "active".</li>
          <li><strong>Drafts</strong> — a template applied to a contact. Review → send.</li>
        </ul>
        <p className="text-sm">Two ways to send at scale:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Schedule</strong> — pick a start time; worker sends all eligible contacts with 3–5 min random stagger.</li>
          <li><strong>Campaigns</strong> — a sequence of templates with per-step delays. Worker advances each contact step-by-step.</li>
        </ul>
        <p className="text-sm">Every send gets a <strong>1×1 tracking pixel</strong> + <strong>link rewriting</strong>. Opens/clicks land on <Link href="/analytics" className="underline">/analytics</Link>.</p>
      </Section>

      <Section id="contacts" title="3. Contacts & tags">
        <p className="text-sm">A contact needs an <strong>email</strong>. Everything else is optional.</p>
        <h3 className="text-sm font-semibold mt-3">CSV import format</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`Name,Company,Role / Title,Email,LinkedIn,Phone,Platform Met,Notes
Jane Doe,Acme Corp,HR Manager,jane@acme.com,https://linkedin.com/in/janedoe,+91 9876543210,LinkedIn,Sample
Bob Smith,Globex,CTO,bob@globex.com,,,,
`}</pre>
        <p className="text-xs text-muted-foreground">Header row auto-detected in the first 5 rows. Case-insensitive. <Code>.xlsx</Code>/<Code>.xls</Code> also works. Cap: 100k rows.</p>

        <h3 className="text-sm font-semibold mt-3">Tags</h3>
        <p className="text-sm">Comma-separated, auto-lower-cased. Use them to segment campaigns:</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`tags: vc, priority-a, london`}</pre>
        <p className="text-sm">Filter on the Contacts page (chip click or dropdown), or enroll just one tag into a campaign.</p>

        <h3 className="text-sm font-semibold mt-3">Bulk actions</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Check rows → <strong>Delete N</strong></li>
          <li><strong>Export</strong> dumps everything to CSV</li>
          <li><strong>Reset status</strong> clears <Code>emailStatus</Code> on every contact so they become draft-eligible again</li>
          <li>Click the clock icon on any row for the full event timeline</li>
        </ul>
      </Section>

      <Section id="templates" title="4. Templates (variables, A/B, AI)">
        <h3 className="text-sm font-semibold">Variables</h3>
        <div className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Code>{'{{name}}'}</Code><span className="text-muted-foreground">Recruiter name</span>
          <Code>{'{{company}}'}</Code><span className="text-muted-foreground">Company</span>
          <Code>{'{{role_name}}'}</Code><span className="text-muted-foreground">Job title; falls back to DEFAULT_ROLE_NAME</span>
          <Code>{'{{email}}'}</Code><span className="text-muted-foreground">Recipient address</span>
          <Code>{'{{location}}'}</Code><span className="text-muted-foreground">Location</span>
          <Code>{'{{platform}}'}</Code><span className="text-muted-foreground">Source platform</span>
        </div>

        <h3 className="text-sm font-semibold mt-3">Body — HTML allowed</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`<p>Hi {{name}},</p>
<p>I came across your work at <b>{{company}}</b> — would love to chat about the {{role_name}} role.</p>
<p><a href="https://yourname.com">Portfolio</a></p>`}</pre>
        <p className="text-xs text-muted-foreground">Values are HTML-escaped in body mode and CR/LF-stripped in subject mode automatically. Recipient input can't inject script.</p>

        <h3 className="text-sm font-semibold mt-3">A/B subject lines</h3>
        <p className="text-sm">Fill in optional <em>Subject B</em>. At send time the recipient gets A or B by <Code>contact.id % 2</Code> — deterministic, so the same person never sees both.</p>

        <h3 className="text-sm font-semibold mt-3">AI Improve (Groq)</h3>
        <p className="text-sm">Click <strong>AI Improve</strong> → sends your body to Groq (<Code>llama-3.3-70b-versatile</Code>) → replaces it with the rewrite. Needs <Code>GROQ_API_KEY</Code> in <Code>.env</Code>.</p>
      </Section>

      <Section id="drafts" title="5. Drafts & sending">
        <p className="text-sm">A draft is "this template, this contact". Two ways in:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Bulk on /drafts — pick how many; SSE shows live progress.</li>
          <li>Per-contact via campaign enrollment.</li>
        </ul>
        <p className="text-sm">Each <strong>Send</strong> writes an <Code>email_log</Code> row, then sends through SMTP with the tracking pixel + click rewrites injected.</p>
        <p className="text-sm">Daily limit defaults to <strong>50</strong> per user — change in <Link href="/settings" className="underline">Settings → General</Link>.</p>
      </Section>

      <Section id="schedule" title="6. Schedule (one-off blast)">
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Pick start date/time on <Link href="/schedule" className="underline">Schedule</Link>.</li>
          <li><strong>Preview</strong> — see the first 20 with staggered times.</li>
          <li><strong>Schedule</strong> to enqueue them all.</li>
          <li>Worker (<Code>npm run worker</Code>) ticks every 30 s and sends what's due.</li>
        </ol>
        <p className="text-sm"><strong>Cancel all</strong> flips Scheduled rows to Cancelled; already-sent rows stay.</p>
      </Section>

      <Section id="campaigns" title="7. Campaigns (multi-step sequences)">
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>New campaign → name it.</li>
          <li>Step 1: "Initial outreach" template, delay <Code>0h</Code>.</li>
          <li>Step 2: "Follow-up 1", delay <Code>72h</Code>, stop-on-reply.</li>
          <li>Step 3: "Final ask", delay <Code>168h</Code>.</li>
          <li>(Optional) filter by tag, then <strong>Enroll</strong>.</li>
          <li><strong>Activate</strong>.</li>
        </ol>
        <p className="text-sm">Worker advances each enrollment by its <Code>nextRunAt</Code>. Each step is its own send — analytics show per-step open rate. Statuses: <Code>draft</Code> · <Code>active</Code> · <Code>paused</Code> · <Code>archived</Code>.</p>
        <p className="text-sm">A contact is unique per (campaign, contact) — re-enrolling is a no-op.</p>
      </Section>

      <Section id="analytics" title="8. Analytics & tracking">
        <p className="text-sm">Every send injects a 1×1 GIF at <Code>/api/track/open?eid=…&t=HMAC</Code>. When the recipient's client renders it (Gmail does), an <Code>open</Code> event lands in the DB.</p>
        <p className="text-sm">Every <Code>http(s)</Code> link is rewritten to <Code>/api/track/click?eid=…&u=&t=HMAC</Code> → records the click + 302-redirects to the real URL.</p>
        <p className="text-sm">Tokens are HMAC-SHA256 signed with <Code>AUTH_SECRET</Code>. Forgery requires that secret.</p>
        <p className="text-sm">KPIs + 14-day chart on <Link href="/analytics" className="underline">/analytics</Link> read straight from the <Code>events</Code> table.</p>
      </Section>

      <Section id="blocklist" title="9. Blocklist & unsubscribe">
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Per-user</strong> — add from <Link href="/blocklist" className="underline">/blocklist</Link>.</li>
          <li><strong>Global</strong> — auto-created when a recipient clicks unsubscribe.</li>
        </ul>
        <p className="text-sm">Matched recipients are silently skipped during draft/schedule/campaign sends.</p>
        <h3 className="text-sm font-semibold mt-3">Unsubscribe footer</h3>
        <p className="text-sm">Toggle in Settings → General. Footer text is sanitized — only a small whitelist of inline tags survives. Link uses an HMAC token so only the recipient can unsub. RFC 8058 <Code>POST /unsubscribe</Code> wired — Gmail's one-click button works.</p>
      </Section>

      <Section id="settings" title="10. Settings, profile, signature">
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><Link href="/profile" className="underline">/profile</Link> — name, phone, company, role, LinkedIn, signature, unsub text.</li>
          <li><Link href="/settings" className="underline">/settings</Link> — tabbed: General · Email · AI · Auth · Data · <span className="text-destructive">Danger</span>.</li>
        </ul>
        <p className="text-sm">Danger tab supports scoped wipes (contacts / drafts / events / everything). Type <Code>DELETE</Code> to enable.</p>
      </Section>

      <Section id="admin" title="11. Admin (multi-user)">
        <p className="text-sm">Add comma-separated emails to <Code>ADMIN_EMAILS</Code> in <Code>.env</Code>. Admins:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>See the Admin sidebar entry.</li>
          <li>Can list every user with per-user stats.</li>
          <li>Can delete non-admin users (cascades through every table).</li>
          <li>Can download the whole DB at <Code>/api/backup</Code> (admin-only).</li>
        </ul>
      </Section>

      <Section id="api" title="12. API reference">
        <p className="text-xs text-muted-foreground">All routes return JSON unless noted. Protected routes require an Auth.js session cookie.</p>
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground"><tr><th className="p-1">Method · path</th><th className="p-1">Auth</th><th className="p-1">What it does</th></tr></thead>
          <tbody className="font-mono">
            {[
              ['GET /api/auth/session', 'open', 'Auth.js session JSON (or null)'],
              ['ALL /api/auth/[...]', 'open', 'Auth.js sign-in / sign-out / callbacks'],
              ['POST /api/dev-signin', 'dev-only', 'Issue a session for an allow-listed email'],
              ['GET /api/progress', 'user', 'SSE stream of draft progress events for the authed user'],
              ['GET /api/contacts/export', 'user', 'CSV of every contact you own'],
              ['GET /api/csv-template', 'open', 'Empty starter CSV with the right headers'],
              ['GET /api/backup', 'admin', 'Whole-DB .db file download (admin only)'],
              ['GET /api/track/open?eid=&t=', 'open (HMAC)', '1×1 GIF + records open event if HMAC verifies'],
              ['GET /api/track/click?eid=&u=&t=', 'open (HMAC)', '302 redirect + records click event'],
              ['GET /unsubscribe?e=&t=', 'open (HMAC)', 'Confirmation page; adds to global blocklist'],
              ['POST /unsubscribe?e=&t=', 'open (HMAC)', 'RFC 8058 one-click unsubscribe'],
              ['GET /api/cron/tick', 'CRON_SECRET', 'Worker tick — sends scheduled emails, advances campaign enrollments. GitHub Actions cron hits this every 5 min (Vercel Hobby blocks short crons). Authorization: Bearer ${CRON_SECRET} required (or ?secret=).'],
            ].map(([path, auth, what]) => (
              <tr key={path} className="border-t"><td className="p-1">{path}</td><td className="p-1 text-muted-foreground">{auth}</td><td className="p-1 font-sans text-muted-foreground">{what}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-2">Most mutations are <strong>Server Actions</strong> (in <Code>server/actions/*.ts</Code>) called directly from React components, not REST endpoints.</p>
      </Section>

      <Section id="env" title="13. Environment variables (A–Z)">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground"><tr><th className="p-1">Var</th><th className="p-1">Default</th><th className="p-1">Purpose</th></tr></thead>
          <tbody className="font-mono">
            {[
              ['ADMIN_EMAILS', '(empty)', 'Comma-separated emails that get admin privileges'],
              ['ALLOW_DEV_SIGNIN', 'false', 'Enable the dev sign-in API in production'],
              ['APP_URL', 'http://localhost:3000', 'Used in tracking + unsubscribe URLs'],
              ['AUTH_SECRET', '(required)', 'Auth.js session secret + signs tracking/unsubscribe HMACs'],
              ['DAILY_SEND_LIMIT', '50', 'Hard cap per user per day; worker honors it'],
              ['DATABASE_URL', './data/tracker.db', 'SQLite file path (or :memory: in tests)'],
              ['DEV_BYPASS_EMAILS', 'test@gmail.com', 'Emails the dev sign-in route accepts'],
              ['EMAIL_FROM', '(falls back to SMTP_USER)', 'From: header on outgoing mail'],
              ['GOOGLE_CLIENT_ID', '—', 'Google OAuth — Continue-with-Google'],
              ['GOOGLE_CLIENT_SECRET', '—', 'Google OAuth secret'],
              ['GROQ_API_KEY', '—', 'Powers AI Improve'],
              ['GROQ_MODEL', 'llama-3.3-70b-versatile', 'Which Groq model to use'],
              ['NEXTAUTH_URL', 'http://localhost:3000', 'Used by Auth.js for callback URLs'],
              ['SMTP_HOST', 'smtp.gmail.com', 'SMTP host'],
              ['SMTP_PASS', '—', 'SMTP password (Gmail App Password)'],
              ['SMTP_PORT', '587', 'SMTP port (465 → secure mode auto-on)'],
              ['SMTP_USER', '—', 'SMTP username / from address'],
              ['TIMEZONE', 'Asia/Kolkata', 'Display timezone for UI strings'],
            ].map(([v, d, p]) => (
              <tr key={v} className="border-t"><td className="p-1">{v}</td><td className="p-1 text-muted-foreground">{d}</td><td className="p-1 font-sans text-muted-foreground">{p}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="setup" title="14. Full setup from scratch">
        <h3 className="text-sm font-semibold">A. Install</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`git clone <repo> email-automator
cd email-automator/web
cp .env.example .env
npm install --legacy-peer-deps`}</pre>

        <h3 className="text-sm font-semibold mt-3">B. Generate AUTH_SECRET</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</pre>
        <p className="text-xs text-muted-foreground">Paste into <Code>AUTH_SECRET=</Code> in <Code>.env</Code>.</p>

        <h3 className="text-sm font-semibold mt-3">C. SMTP (Gmail) — magic-link + outbound</h3>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Enable 2FA on your Google account.</li>
          <li>Visit <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Passwords</a>, generate one.</li>
          <li>Set <Code>SMTP_USER=you@gmail.com</Code>, <Code>SMTP_PASS=&lt;16-char password&gt;</Code>.</li>
          <li>(Optional) <Code>EMAIL_FROM="Your Name &lt;you@gmail.com&gt;"</Code>.</li>
        </ol>

        <h3 className="text-sm font-semibold mt-3">D. Google OAuth — Continue-with-Google</h3>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Open <a className="underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud → Credentials</a>.</li>
          <li>Create OAuth Client ID → Web app.</li>
          <li>Authorized redirect URI: <Code>http://localhost:3000/api/auth/callback/google</Code> (+ production URL).</li>
          <li>Paste Client ID + Secret into <Code>.env</Code>, restart.</li>
        </ol>

        <h3 className="text-sm font-semibold mt-3">E. Groq AI key</h3>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li><a className="underline" href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a> → API Keys → Create.</li>
          <li><Code>GROQ_API_KEY=gsk_…</Code> in <Code>.env</Code>.</li>
        </ol>

        <h3 className="text-sm font-semibold mt-3">F. Initialize the DB</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`npm run db:migrate                                # creates ./data/tracker.db
npm run seed:templates -- you@example.com         # optional: load 20 starter templates`}</pre>

        <h3 className="text-sm font-semibold mt-3">G. Run</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`npm run build && npm start    # production, port 3000
npm run worker                 # in another shell — sends scheduled + advances campaigns`}</pre>
      </Section>

      <Section id="deploy" title="15. Deployment options">
        <h3 className="text-sm font-semibold">Self-hosted Linux box (recommended)</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`pm2 start npm --name email-automator-web    -- start
pm2 start npm --name email-automator-worker -- run worker
pm2 save`}</pre>

        <h3 className="text-sm font-semibold mt-3">Vercel</h3>
        <p className="text-sm">
          The UI runs on Vercel out of the box. <Code>server/db/client.ts</Code> is a dual driver — it
          uses better-sqlite3 for local file URLs and @libsql/client for <Code>libsql://</Code> /
          <Code>https://</Code> / <Code>file:</Code> URLs. <strong>No code swap needed.</strong>
        </p>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Create a Turso DB and grab the URL + auth token (CLI in DEPLOYMENT.md).</li>
          <li>Run <Code>DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run db:migrate</Code> from your laptop once.</li>
          <li>Set those two env vars + <Code>CRON_SECRET</Code> + the SMTP/auth vars in Vercel.</li>
          <li><Code>vercel --prod</Code>. <Code>vercel.json</Code> sets the build config.</li>
          <li>Set up the cron via <strong>GitHub Actions</strong> (Vercel Hobby plan blocks crons under 1 day). Add two repo secrets in GitHub → Settings → Actions: <Code>APP_URL</Code> (your Vercel URL) and <Code>CRON_SECRET</Code> (same value as Vercel). The included <Code>.github/workflows/cron-tick.yml</Code> hits <Code>/api/cron/tick</Code> every 5 min.</li>
        </ol>
        <p className="text-sm">Alternative: <strong>Vercel Postgres / Neon</strong> — heavier swap; change schema to <Code>pgTable</Code> and use Drizzle's pg adapter. Only worth it if Postgres is already in your stack.</p>

        <h3 className="text-sm font-semibold mt-3">Docker</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`docker build -t email-automator .
docker run -d -p 3000:3000 -v $PWD/data:/app/data --env-file .env email-automator`}</pre>
      </Section>

      <Section id="troubleshoot" title="16. Troubleshooting">
        <dl className="text-sm space-y-3">
          <div>
            <dt className="font-medium">Blank page after sign-in</dt>
            <dd className="text-muted-foreground">Hard-refresh (<Kbd>Ctrl+Shift+R</Kbd>) — stale chunk. Check DevTools console for CSP/eval errors.</dd>
          </div>
          <div>
            <dt className="font-medium">"SMTP not configured" on login</dt>
            <dd className="text-muted-foreground">Set <Code>SMTP_USER</Code> and <Code>SMTP_PASS</Code>, restart.</dd>
          </div>
          <div>
            <dt className="font-medium">Magic link 500s</dt>
            <dd className="text-muted-foreground">Bad SMTP password usually. Run <Link href="/diagnostic" className="underline">/diagnostic → Send test to self</Link>.</dd>
          </div>
          <div>
            <dt className="font-medium">Drafts queued but nothing sends</dt>
            <dd className="text-muted-foreground">The worker must be running in a separate process. <Code>npm run worker</Code>.</dd>
          </div>
          <div>
            <dt className="font-medium">Opens are zero</dt>
            <dd className="text-muted-foreground">Outlook + Apple Mail (with privacy protection) block remote images. Gmail / web mail render them — opens count there.</dd>
          </div>
          <div>
            <dt className="font-medium">"Template not found" when adding a campaign step</dt>
            <dd className="text-muted-foreground">That template id isn't yours. Refresh — the dropdown may be stale, or it was deleted.</dd>
          </div>
          <div>
            <dt className="font-medium">CSV import says "No valid rows"</dt>
            <dd className="text-muted-foreground">No Email column detected. Make sure one header contains "email" (case-insensitive) and that values match <Code>x@y.z</Code>.</dd>
          </div>
        </dl>
      </Section>

      <Section id="shortcuts" title="17. Keyboard shortcuts">
        <div className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Kbd>⌘/Ctrl + K</Kbd><span>Open command palette</span>
          <Kbd>↑ ↓</Kbd><span>Navigate the palette</span>
          <Kbd>↵</Kbd><span>Open the highlighted page</span>
          <Kbd>Esc</Kbd><span>Close palette / any dialog</span>
        </div>
      </Section>
    </div>
  )
}
