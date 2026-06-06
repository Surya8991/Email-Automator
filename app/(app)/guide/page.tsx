import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { GuideToc, WhatsNew } from './guide-toc'

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
  ['whats-new',  '★ What\'s new'],
  ['first-time', '0. First time? Start here'],
  // Last updated 2026-06-05: admin section now covers the 6-tab layout
  // (Overview / Users / Queue / Webhooks / System / Broadcast).
  ['quick-start', '1. Quick start (5 minutes)'],
  ['concepts',    '2. How it all fits together'],
  ['contacts',    '3. Contacts & tags'],
  ['templates',   '4. Templates (variables, A/B, AI)'],
  ['drafts',      '5. Drafts & sending'],
  ['schedule',    '6. Schedule (one-off blast)'],
  ['campaigns',   '7. Campaigns (multi-step sequences)'],
  ['analytics',   '8. Analytics & tracking'],
  ['jobs',        '8b. Job tracker (board / careers scanning)'],
  ['blocklist',   '9. Blocklist & unsubscribe'],
  ['settings',    '10. Settings, profile, signature'],
  ['custom-fields','10b. Custom contact fields'],
  ['admin',       '11. Admin (multi-user)'],
  ['api',         '12. API reference'],
  ['env',         '13. Environment variables (A–Z)'],
  ['setup',       '14. Full setup from scratch'],
  ['deploy',      '15. Deployment options'],
  ['troubleshoot','16. Troubleshooting'],
  ['shortcuts',   '17. Keyboard shortcuts'],
] as const

// Bridge, convert the const tuple TOC into the {id,label} shape the
// client TOC component expects. Kept in this file so the section JSX
// below remains the source of truth for which sections exist.
const TOC_ITEMS = TOC.map(([id, label]) => ({ id, label }))

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        title="User guide"
        description="Everything Email Automator does, how to use each feature, and the full API + env reference."
        pills={[
          { label: 'last updated', value: '2026-06-05', tone: 'info' },
          { label: 'sections', value: TOC.length },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[220px,1fr]">
        <GuideToc items={TOC_ITEMS} />

        <div className="space-y-8 min-w-0">
          {/* What's new pinned at the top, collapsible so power users
              who already know the changes can hide it. */}
          <WhatsNew />

          {/* Mobile TOC fallback, the sticky sidebar collapses below
              lg, but a flat list of jump links is still useful so the
              user doesn't have to scroll the whole guide to navigate. */}
          <Card className="lg:hidden">
            <CardHeader><CardTitle>Contents</CardTitle></CardHeader>
            <CardContent className="grid gap-1 sm:grid-cols-2 text-sm">
              {TOC.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="text-muted-foreground hover:text-primary hover:underline">{label}</a>
              ))}
            </CardContent>
          </Card>

      <Section id="first-time" title="0. First time? Start here">
        <p className="text-sm">
          On your first sign-in you'll see a 4-slide <strong>onboarding modal</strong> that walks through
          Contacts → Templates → Drafts → Schedule/Campaigns. Skip or step through, it gets out of
          your way as soon as you dismiss it.
        </p>
        <p className="text-sm">
          To re-trigger it later (e.g. after a major UI change, or to show it to a new teammate), an
          admin bumps <Code>ONBOARDING_CURRENT_VERSION</Code> in <Code>components/onboarding-modal.tsx</Code> and ships.
          The modal will then re-appear once per user until they dismiss it again.
        </p>
        <p className="text-sm">
          Prefer to read instead? The <strong>Quick start</strong> section below covers the same path in
          5 minutes.
        </p>
      </Section>

      <Section id="quick-start" title="1. Quick start (5 minutes)">
        <p className="text-sm text-muted-foreground">
          On first sign-in the in-app onboarding modal walks the same path with one slide per step.
          If you skipped it, this section is the same flow in 5 minutes.
        </p>
        <ol className="list-decimal pl-6 space-y-2 text-sm">
          <li>Go to <Link href="/profile" className="underline">Profile</Link>. Set your name, portfolio link, and signature (rich-text or HTML).</li>
          <li>Open <Link href="/templates" className="underline">Templates</Link>. 5 public starter templates are auto-seeded on first visit (admins get an additional 23-template overlay). Pick one, click <strong>Activate</strong>.</li>
          <li>Open <Link href="/contacts" className="underline">Contacts</Link> → <strong>Sample CSV</strong> downloads a starter file with canonical headers and 5 realistic rows. Edit, save, then <strong>Import</strong>, SSE progress bar shows live import status.</li>
          <li>Open <Link href="/dry-run" className="underline">Dry run</Link>. First 100 eligible contacts render with their personalized subject + body. Nothing is sent, just visual verification before you commit.</li>
          <li>Open <Link href="/drafts" className="underline">Drafts</Link> → set count to 5 → <strong>Create drafts</strong>. SSE progress fills as drafts materialize.</li>
          <li>Click <strong>Send</strong> on each draft. The send injects a tracking pixel + rewrites links automatically, then writes an <Code>email_log</Code> row.</li>
          <li>Visit <Link href="/analytics" className="underline">Analytics</Link>, opens and clicks start landing as recipients interact.</li>
        </ol>
        <p className="text-sm">For scale, swap step 5–6 for <Link href="/schedule" className="underline">Schedule</Link> (one-off staggered blast) or <Link href="/campaigns" className="underline">Campaigns</Link> (multi-step sequences).</p>
      </Section>

      <Section id="concepts" title="2. How it all fits together">
        <p className="text-sm">Three core objects:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Contacts</strong>, your audience, optionally tagged.</li>
          <li><strong>Templates</strong>, subject + HTML body with <Code>{'{{name}}'}</Code> variables. Exactly one is "active".</li>
          <li><strong>Drafts</strong>, a template applied to a contact. Review → send.</li>
        </ul>
        <p className="text-sm">Two ways to send at scale:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Schedule</strong>, pick a start time; worker sends all eligible contacts with 3–5 min random stagger.</li>
          <li><strong>Campaigns</strong>, a sequence of templates with per-step delays. Worker advances each contact step-by-step.</li>
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

        <h3 className="text-sm font-semibold mt-3">Search & filter</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Search by name / company / email / role (top-left).</li>
          <li>Tag dropdown filters to one tag.</li>
          <li>Status dropdown filters by send state (Pending / Draft created / Scheduled / Sent / Replied / Bounced / Cancelled).</li>
          <li>Company / Location / Platform dropdowns, populated from your actual data, exact match.</li>
          <li>All filters compose with each other and with search; "Clear filters" resets them.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">Bulk actions</h3>
        <p className="text-sm">Per-page select-all checkbox at the top of the table. With rows checked, a toolbar appears:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Create drafts</strong>, creates drafts using your active template for just the selected contacts (cap 200). Skips anyone already drafted/sent.</li>
          <li><strong>Schedule…</strong>, pop a date/time picker and queue exactly the selected contacts (cap 2000). Goes through the same staggered scheduler as the page-level <em>Schedule</em>, but scoped.</li>
          <li><strong>Enroll in campaign…</strong>, pick a campaign from the dropdown and enroll the selected contacts into it (cap 10000).</li>
          <li><strong>Add tag</strong> / <strong>Remove tag</strong>, comma-separated; lower-cased automatically.</li>
          <li><strong>Reset status</strong>, makes them eligible for a fresh draft.</li>
          <li><strong>Block</strong>, adds emails to your blocklist <em>and soft-deletes</em> the contact rows (sets <Code>emailStatus=BLOCKED</Code>). They disappear from the default list. Remove the entry from <Link href="/blocklist" className="underline">/blocklist</Link> later and the contact reappears at the bottom of the list (num bumped to max+1).</li>
          <li><strong>Delete</strong>, permanent.</li>
        </ul>
        <h3 className="text-sm font-semibold mt-3">Dedupe + delete-all + page size</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Dedupe</strong> button, removes rows whose (name + email) tuple matches another row (lower-cased, trimmed). Same email with a different display name is kept, useful when a shared inbox is reached by multiple people.</li>
          <li><strong>Delete matching</strong>, destroys every row that matches the current filter set (search/tag/status/company/location/platform). Scoped by your filters.</li>
          <li><strong>Page size</strong>, switch between 50 / 100 / 500 / 1000 rows per page from the bottom of the table.</li>
        </ul>
        <p className="text-sm mt-2 text-muted-foreground">
          Tip: combine filters (e.g. <Code>company=Acme</Code> + <Code>status=Pending</Code>) → select-all → Create drafts, that's how you blast to one company without touching others.
        </p>
        <p className="text-sm mt-2">Per-row icons:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Calendar clock</strong>, schedule a one-off follow-up using your active template (1-60 days out).</li>
          <li><strong>Clock</strong>, full event timeline for that contact.</li>
          <li><strong>Trash</strong>, delete the single row.</li>
        </ul>
        <p className="text-sm mt-2">Toolbar buttons:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Import</strong>, CSV / XLSX upload, fuzz-matched headers.</li>
          <li><strong>Export</strong>, full CSV dump of your contacts.</li>
          <li><strong>Sample CSV</strong>, starter file with the exact headers + 5 realistic sample rows.</li>
          <li><strong>Reset status</strong>, clears <Code>emailStatus</Code> on every contact (re-runnable for the whole list).</li>
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

        <h3 className="text-sm font-semibold mt-3">Body, HTML allowed</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`<p>Hi {{name}},</p>
<p>I came across your work at <b>{{company}}</b>, would love to chat about the {{role_name}} role.</p>
<p><a href="https://yourname.com">Portfolio</a></p>`}</pre>
        <p className="text-xs text-muted-foreground">Values are HTML-escaped in body mode and CR/LF-stripped in subject mode automatically. Recipient input can't inject script. Every outgoing email is wrapped in an email-safe styled container (table layout, system font, max 600 px), the JSON body just needs the copy, not the chrome.</p>

        <h3 className="text-sm font-semibold mt-3">Clickable insertion palette</h3>
        <p className="text-sm">Below the body textarea: two rows of clickable chips.</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Recipient</strong>, clicking <Code>{'{{name}}'}</Code> etc. inserts the variable at your cursor (substituted per recipient on send).</li>
          <li><strong>Common HTML</strong>, salutation lines ("Hi {'{{'}name{'}}'}", "Dear {'{{'}name{'}}'}"), empty paragraph, 3-bullet list, sign-offs ("Best regards,", "Thanks,"), divider. Inserts raw HTML.</li>
        </ul>
        <p className="text-sm">Hover any chip to see what it does. The clicked snippet lands wherever you last placed your cursor (subject or body).</p>

        <h3 className="text-sm font-semibold mt-3">Search / filter / clone</h3>
        <p className="text-sm">Sidebar search box filters by label, key, or category. Category dropdown filters to one bucket. <strong>Clone</strong> button (next to Activate) duplicates the selected template with a <Code>-copy</Code> suffix, safe A/B without touching the original.</p>

        <h3 className="text-sm font-semibold mt-3">A/B subject lines</h3>
        <p className="text-sm">Fill in optional <em>Subject B</em>. At send time the recipient gets A or B by <Code>contact.id % 2</Code>, deterministic, so the same person never sees both.</p>

        <h3 className="text-sm font-semibold mt-3">AI Improve (Groq)</h3>
        <p className="text-sm">Click the <strong>Sparkles</strong> button → pop a tone picker (Professional / Friendly / Concise / Enthusiastic / Formal) → Groq (<Code>llama-3.3-70b-versatile</Code>) rewrites the body in your chosen tone. Needs <Code>GROQ_API_KEY</Code> in <Code>.env</Code>.</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Admin-only</strong> on /drafts, /schedule, and /campaigns. The /templates editor is open to every user.</li>
          <li><strong>Rate-limited</strong> 60/min/admin per operation, stops accidental loops from chewing through Groq quota.</li>
          <li><strong>Audit-logged</strong>, every rewrite writes a row to <Code>auditLog</Code> visible at <Link href="/audit?scope=all" className="underline">/audit?scope=all</Link>.</li>
          <li><strong>Undo</strong> (drafts only, 1 hour), the success toast surfaces an Undo action that restores the pre-improve body from <Code>localStorage</Code>. Survives page navigation; expires on tab close + 1 h.</li>
          <li><strong>Variables stay intact</strong>, the prompt explicitly tells Groq to preserve <Code>{'{{placeholders}}'}</Code>, so personalization still works on the rewrite.</li>
        </ul>
      </Section>

      <Section id="drafts" title="5. Drafts & sending">
        <p className="text-sm">A draft is "this template, this contact". Two ways in:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Bulk on /drafts, pick how many; SSE shows live progress.</li>
          <li>Per-contact via campaign enrollment.</li>
        </ul>
        <p className="text-sm">Each <strong>Send</strong> writes an <Code>email_log</Code> row, then sends through SMTP with the tracking pixel + click rewrites injected.</p>
        <p className="text-sm">Daily limit defaults to <strong>50</strong> per user, change in <Link href="/settings" className="underline">Settings → General</Link>.</p>

        <h3 className="text-sm font-semibold mt-3">Editor (rich text + HTML toggle)</h3>
        <p className="text-sm">Per-row <strong>Pencil</strong> opens an inline subject + body editor. The body uses a shared <Code>&lt;RichTextEditor /&gt;</Code> with two modes:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Rich</strong> (default), a WYSIWYG view with Bold / Italic / Bullet list / Link buttons. Ctrl/Cmd+B and Ctrl/Cmd+I work.</li>
          <li><strong>HTML</strong>, raw markup textarea for power-users who want to paste / hand-edit. Switching modes preserves your content.</li>
        </ul>
        <p className="text-sm">The same component drives <Link href="/profile" className="underline">/profile</Link> signature.</p>
        <h3 className="text-sm font-semibold mt-3">In-row actions</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Checkbox</strong>, select rows; <em>Send selected (N)</em> / <em>Discard selected</em> appear in the toolbar. <em>Discard all</em> wipes every pending draft in one click.</li>
          <li><strong>Pencil</strong>, open the rich-text editor for subject + body before sending.</li>
          <li><strong>Send</strong>, sends. If the same recipient was emailed in the last 7 days, a confirmation dialog shows the previous send timestamp; confirm to send anyway.</li>
          <li><strong>Sparkles (admin only)</strong>, <em>AI Improve</em>. Pick a tone, rewrite the draft body, then review. The success toast exposes <strong>Undo</strong> for 1 hour, restores the pre-improve body from <Code>localStorage</Code>.</li>
          <li><strong>Calendar clock</strong>, schedules a follow-up for this contact (uses active template).</li>
          <li><strong>Trash</strong>, drops the draft.</li>
        </ul>
        <p className="text-sm mt-2"><strong>Page size</strong> 50 / 100 / 500 / 1000 + Prev/Next at the bottom, same pagination shape as Contacts.</p>
        <p className="text-sm mt-2"><strong>Search</strong> box at the top of the list filters by recipient or subject. <strong>Select all visible</strong> checkbox to pick everything currently shown.</p>
      </Section>

      <Section id="schedule" title="6. Schedule (one-off blast)">
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Use one of the 5 <strong>presets</strong> (Tomorrow 9:30 AM / Next weekday 10 AM / Next Monday 9 AM / In 3 days / Tonight 7 PM), or pick a custom date/time.</li>
          <li>Adjust <strong>Gap min / Gap max</strong> (minutes between sends). Defaults to 3–5 min.</li>
          <li><strong>Preview</strong> shows total contacts, first/last times, exact spacing, and the first 20 rows.</li>
          <li><strong>Schedule</strong> enqueues them all.</li>
          <li>Worker (<Code>npm run worker</Code>) ticks every 30 s and sends what's due. On Vercel, GitHub Actions cron pings every 5 min.</li>
        </ol>
        <p className="text-sm"><strong>Cancel all</strong> flips every Scheduled/Retrying row to Cancelled. <strong>Cancel selected (N)</strong> cancels only the checked rows. Already-sent rows stay either way.</p>
        <p className="text-sm">The Queue table supports search (recipient/subject) + status filter (Scheduled / Retrying) + per-row checkbox. Each row shows attempts + last result so you can debug stuck retries (e.g. "Throttled: already sent within 30d on …" if you've set the per-recipient throttle in Settings).</p>
        <h3 className="text-sm font-semibold mt-3">Per-row preview + admin AI Improve</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Eye</strong>, toggle the rendered body of the queued email (the exact HTML the worker will send, still with <Code>{'{{personalized}}'}</Code> placeholders).</li>
          <li><strong>Sparkles (admin only)</strong>, pick a tone, rewrite the queued <Code>email_log.body</Code> in place. The scheduler picks up the new body on its next pass, no schedule change.</li>
        </ul>
        <h3 className="text-sm font-semibold mt-3">How the worker tick actually works</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Atomic claim</strong>, every candidate row is flipped <Code>Scheduled → Sending</Code> in a single conditional UPDATE before the SMTP attempt. A second concurrent tick (Vercel cron + long-running worker can overlap) sees the row already in <Code>Sending</Code> and skips it, no double-sends.</li>
          <li><strong>Stuck recovery</strong>, if a row sits in <Code>Sending</Code> for more than 10 minutes the next tick auto-reverts it to <Code>Scheduled</Code> for retry. Means a crashed mid-send doesn't leave a row stuck forever. Admins can also click <strong>Recover stuck</strong> on <Link href="/admin/queue" className="underline">/admin/queue</Link> to flip them immediately.</li>
          <li><strong>Daily limit window</strong> is a rolling 24-hour count (now − 24h), so your limit resets continuously instead of jumping at UTC midnight. IST users no longer hit "limit reached" at 5:30am.</li>
          <li><strong>Per-user override</strong>, admins can override <Code>DAILY_SEND_LIMIT</Code> per user from <Link href="/admin/users" className="underline">/admin/users</Link> → key icon. Scheduler honors the override before falling back to env default.</li>
          <li><strong>Failure retries</strong>, failed SMTP attempts retry up to 3 times with exponential backoff (1m → 2m → 4m, capped at 30 min). After 3 attempts the row is marked <Code>Failed</Code> with the SMTP error message in <Code>lastResult</Code>.</li>
        </ul>
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
        <p className="text-sm">Worker advances each enrollment by its <Code>nextRunAt</Code>. Each step is its own send, analytics show per-step open rate. Statuses: <Code>draft</Code> · <Code>active</Code> · <Code>paused</Code> · <Code>archived</Code>.</p>
        <p className="text-sm">A contact is unique per (campaign, contact), re-enrolling is a no-op (enforced by a unique index, not just an application check).</p>

        <h3 className="text-sm font-semibold mt-3">stop-on-reply</h3>
        <p className="text-sm">Tick the <strong>stop on reply</strong> checkbox on any step. When the worker is about to send that step, it checks the contact's <Code>emailStatus</Code>, if it starts with <Code>Replied</Code>, the enrollment status flips to <Code>replied</Code> and no further steps fire.</p>
        <p className="text-sm">Replies are detected by <Link href="/diagnostic" className="underline">/diagnostic → Check Replies (Gmail)</Link>, that action scans your Gmail inbox for replies from contacts you've sent to and marks both the contact (<Code>emailStatus = "Replied! (timestamp)"</Code>) AND any active campaign enrollments for that contact (<Code>status = "replied"</Code>) in one pass. Run it before you launch a follow-up step if your last manual check was a while ago.</p>

        <h3 className="text-sm font-semibold mt-3">Send-safety guards (all apply to campaign sends)</h3>
        <p className="text-sm">Every campaign step send goes through the same gates as a one-off scheduled send:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Daily limit</strong> (env <Code>DAILY_SEND_LIMIT</Code> or admin per-user override), campaign sends count against the same rolling-24h budget as scheduled sends.</li>
          <li><strong>Blocklist</strong>, per-user + global. Enrollment is auto-stopped if the contact is blocked.</li>
          <li><strong>Per-recipient throttle</strong>, if you set "max 1 per N days" in Settings, the enrollment defers (<Code>nextRunAt</Code> pushed) until the window clears, instead of double-tapping the contact.</li>
          <li><strong>Per-domain daily cap</strong>, same domain-cap defer-by-1h logic as one-off sends.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">Per-step preview + admin AI Improve</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Eye</strong> on each step, shows the underlying template's <Code>initialMsg</Code> body so you don't have to jump to /templates.</li>
          <li><strong>Sparkles (admin only)</strong>, rewrites the template body for future sends. Past sends are unchanged. The improved body is audit-logged.</li>
        </ul>
      </Section>

      <Section id="analytics" title="8. Analytics & tracking">
        <p className="text-sm">Every send injects a 1×1 GIF at <Code>/api/track/open?eid=…&t=HMAC</Code>. When the recipient's client renders it (Gmail does), an <Code>open</Code> event lands in the DB.</p>
        <p className="text-sm">Every <Code>http(s)</Code> link is rewritten to <Code>/api/track/click?eid=…&u=&t=HMAC</Code> → records the click + 302-redirects to the real URL.</p>
        <p className="text-sm">Tokens are HMAC-SHA256 signed with <Code>AUTH_SECRET</Code>. Forgery requires that secret.</p>
        <p className="text-sm">/analytics shows:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>KPI cards</strong>, 30-day sent / open / click / reply rates.</li>
          <li><strong>14-day chart</strong>, daily sent / open / click / reply / bounce. Recharts loaded via <Code>dynamic(&hellip;, {`{ ssr: false }`})</Code> so the bundle stays small.</li>
          <li><strong>Three breakdown cards</strong> (30d, top 10), by template, by campaign, by tag. Multi-tag contacts count for each tag they have, so totals can exceed the underlying send count.</li>
          <li><strong>Send-time heatmap</strong>, 7-day × 24-hour grid bucketed in IST regardless of where the server runs. Cell shade scales with send count; hover for open-rate. <strong>Opens are attributed to the original send-hour</strong>, not the open-hour, so the grid actually answers "when should I send?" rather than "when do people open mail?".</li>
        </ul>
        <p className="text-sm">Admins also get a <strong>Job-search pipeline KPI row</strong> at the top, Applied / Active pipeline / Offers / Response rate / Rejections, derived from <Code>contacts.status</Code> (Applied / Phone Screen / Interview 1-2 / Final Round / Offer* / Hired / Reject*). Only renders when <Code>session.user.isAdmin</Code>.</p>
        <p className="text-sm text-muted-foreground">Cross-user instance-wide analytics (top senders, 30-day chart across all users, failure heatmap) live at <Link href="/admin" className="underline">/admin</Link>.</p>
      </Section>

      <Section id="jobs" title="8b. Job tracker (board / careers scanning)">
        <p className="text-sm">Polls job-board search URLs and company careers pages on a cron tick, structured-extracts new listings via 14 dedicated adapters (or AI fallback), and surfaces them at <Link href="/jobs" className="underline">/jobs</Link> for triage. Lead → outreach draft in one click. No LinkedIn or Indeed scraping; no auto-apply.</p>
        <p className="text-sm font-semibold">Adapter coverage (zero AI cost)</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>ATS APIs</strong>: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Breezy HR, Personio, Recruitee, Teamtailor, Workday. Public JSON, no auth.</li>
          <li><strong>India</strong>: Naukri, Foundit, Internshala. Native API where exposed; HTML otherwise.</li>
          <li><strong>Remote aggregators</strong>: Remote OK, Remotive. Public JSON.</li>
          <li><strong>Meta-aggregators</strong>: Adzuna (free key), Jooble (free key). Gated on env vars — no-op when unset.</li>
          <li><strong>RSS feeds</strong>: Indeed RSS, TimesJobs RSS, generic.</li>
          <li><strong>Fallback</strong>: JSON-LD <Code>schema.org/JobPosting</Code> (covers most Google-Jobs-indexed boards), then Groq AI extraction as the last resort.</li>
        </ul>
        <p className="text-sm font-semibold">Add a source</p>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Click <strong>Add from preset</strong> — the <em>Public APIs</em> tab (featured first) groups ATS-backed presets that never pay Groq tokens. Enter a company slug like <Code>airbnb</Code> for Greenhouse, <Code>stripe</Code> for Lever, etc.</li>
          <li>Or paste any URL via <strong>Add source</strong> — the adapter registry auto-detects host patterns. URLs that don&apos;t match any adapter fall through to JSON-LD + AI.</li>
          <li>Multi-role batch: type a comma list in the role field — <Code>SEO, Performance Marketing, Paid Media</Code> creates three sources in one click.</li>
          <li>Optional keyword filter (comma list). Empty = capture everything the board returns.</li>
        </ol>
        <p className="text-sm font-semibold">Normalization at insert</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Salary</strong>: <Code>6-9 LPA</Code>, <Code>$80k-$120k</Code>, <Code>₹50k/month</Code> all parse to <Code>salary_min/max/ccy/period</Code>. Filter by min-INR-equivalent on the toolbar.</li>
          <li><strong>Location</strong>: <Code>Bengaluru</Code> + <Code>Bangalore</Code> collapse to <Code>bangalore</Code>. <Code>Remote (India)</Code> → <Code>remote-in</Code>, <Code>Anywhere</Code> → <Code>remote-global</Code>. Remote / Hybrid / Office chips on the toolbar.</li>
          <li><strong>Cross-board dedup</strong>: SHA-1 of (companyNorm, titleNorm, locationNorm). When the same role appears on multiple boards, only the canonical row shows (aggregators yield to direct ATSes); the card flags <Code>↻ N sources</Code>.</li>
        </ul>
        <p className="text-sm font-semibold">Triage flow</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>New</strong> tab — incoming leads, filter by salary / remote / source / company / location / search.</li>
          <li><strong>Saved</strong> tab — bookmarked for follow-up.</li>
          <li><strong>Archive</strong> — split into <em>Applied</em> and <em>Ignored</em> sub-tabs. Click <strong>Restore</strong> on any row to bounce it back to Saved.</li>
          <li><strong>Sources</strong> — adapter badge per row (green = zero AI cost; amber = AI fallback). Pause / refresh / edit per source.</li>
          <li><strong>Draft outreach</strong> — one click creates a contact + pre-filled HTML draft with metadata block, marks the lead as applied.</li>
          <li>CSV export per tab via the <strong>CSV</strong> button (<Code>/api/jobs/export?status=…</Code>).</li>
        </ul>
        <p className="text-sm font-semibold">Cron + limits</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><Code>/api/cron/job-tracker?secret=$CRON_SECRET</Code> — hourly recommended. Vercel cron config in <Code>vercel.json</Code>.</li>
          <li>40 sources scanned per cron tick (LRU oldest-fetched first). 50 new leads per source per tick.</li>
          <li>Non-admin users: 3-source cap (<Code>NON_ADMIN_SOURCE_CAP</Code>) to bound Groq fan-out.</li>
          <li>Pruning: <Code>new</Code> + <Code>ignored</Code> leads older than 30 days are deleted; <Code>saved</Code> + <Code>applied</Code> are kept indefinitely.</li>
        </ul>
        <p className="text-sm text-muted-foreground"><strong>Gotchas:</strong> the LinkedIn / Glassdoor / Indeed HTML presets were removed in the 2026-06-06 prune — their unauthenticated pages return login walls that the AI extractor would hallucinate against. Paste a specific JD URL via the <em>Paste a company URL</em> category if you need to ingest a particular listing. For Indeed, the RSS preset still works.</p>
      </Section>

      <Section id="blocklist" title="9. Blocklist & unsubscribe">
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Per-user</strong>, add from <Link href="/blocklist" className="underline">/blocklist</Link>. Single pattern or <strong>Bulk add</strong> paste-list (newline/comma; <Code>@</Code> autodetects email vs domain).</li>
          <li><strong>Global</strong> (<Code>userId = null</Code>), applies to every user on the instance. Auto-created when a recipient clicks unsubscribe. Admins can also add/remove global entries manually from <Link href="/admin/system" className="underline">/admin/system → Global blocklist</Link>, duplicates are deduplicated on add so a double-click is safe.</li>
          <li><strong>Search + type filter</strong> over the list.</li>
        </ul>
        <p className="text-sm">Matched recipients are silently skipped during draft / schedule / campaign sends, every send path consults <Code>isBlocked()</Code> before SMTP.</p>

        <h3 className="text-sm font-semibold mt-3">Soft-block + unblock-restore</h3>
        <p className="text-sm">Using the <strong>Block</strong> bulk action on /contacts soft-deletes those contacts (sets <Code>emailStatus = "BLOCKED"</Code>) AND adds them to your blocklist. The default contacts list hides BLOCKED rows. If you later remove the email from /blocklist, the contact reappears at the bottom of your list (<Code>num</Code> bumped to <Code>max + 1</Code>), useful when you unblock by mistake or change your mind.</p>

        <h3 className="text-sm font-semibold mt-3">Unsubscribe footer</h3>
        <p className="text-sm">Toggle in Settings → General. Footer text is sanitized, only a small whitelist of inline tags survives. Link uses an HMAC token signed with <Code>AUTH_SECRET</Code> so only the recipient can unsub. RFC 8058 <Code>POST /unsubscribe</Code> wired, Gmail's one-click button works without rendering the confirmation page.</p>
      </Section>

      <Section id="settings" title="10. Settings, profile, signature">
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><Link href="/profile" className="underline">/profile</Link>, name, phone, company, role, LinkedIn, signature, unsub text.</li>
          <li><Link href="/settings" className="underline">/settings</Link>, tabbed: General · Email · AI · Auth · API keys · Webhooks · Data · <span className="text-destructive">Danger</span>.</li>
        </ul>
        <h3 className="text-sm font-semibold mt-3">General tab fields</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Daily send limit</strong>, hard cap per user over a rolling 24-hour window. Worker enforces. The default comes from <Code>env.DAILY_SEND_LIMIT</Code>; admins can override per-user from <Link href="/admin/users" className="underline">/admin/users</Link> → key icon (stored in <Code>DAILY_SEND_LIMIT_OVERRIDE</Code> setting and read by the scheduler before falling back to env).</li>
          <li><strong>Timezone</strong>, dropdown of 13 zones (IST default). Drives every visible timestamp in the UI via <Code>useFormatDate()</Code>. Server-rendered pages read it via <Code>getSetting(u.id, 'TIMEZONE')</Code>.</li>
          <li><strong>Per-recipient throttle (days)</strong>, worker cancels any queued one-off send (or defers any campaign step) to a recipient already emailed in the window. <Code>0</Code> = off. Stops overlapping campaigns from double-tapping a contact.</li>
          <li><strong>Custom contact fields</strong>, comma-separated keys (snake_case). Inputs appear in the AddContact dialog and chips appear in the template editor.</li>
          <li><strong>Per-domain daily cap</strong>, <Code>gmail.com=50,outlook.com=30</Code> format. Worker <em>defers</em> (not cancels) over-cap rows by 1h so they eventually send on a less-busy day.</li>
          <li><strong>Default role / Portfolio link</strong>, fallbacks for <Code>{'{{role_name}}'}</Code> / <Code>{'{{portfolio_link}}'}</Code> when the contact has none.</li>
          <li><strong>Unsubscribe footer + toggle</strong>.</li>
          <li><strong>Emergency Pause sends</strong>, kill-switch (<Code>SENDS_PAUSED=true</Code>); worker skips your queue entirely while on. Same setting an admin's "Suspend user" toggle flips.</li>
        </ul>
        <h3 className="text-sm font-semibold mt-3">Email tab</h3>
        <p className="text-sm">Per-user SMTP credentials (host, port, user, pass, From). Stored AES-GCM encrypted at rest via <Code>ENCRYPTION_KEY</Code> (falls back to <Code>AUTH_SECRET</Code>). Falls back to env <Code>SMTP_*</Code> vars when unset. Saving or clearing creds invalidates the cached nodemailer transport so rotations take effect on the next send instead of waiting for a process restart.</p>
        <h3 className="text-sm font-semibold mt-3">AI tab</h3>
        <p className="text-sm">Per-user <Code>GROQ_API_KEY</Code> override + model selection. Encrypted at rest the same way SMTP creds are. Falls back to env when unset.</p>
        <h3 className="text-sm font-semibold mt-3">API keys tab</h3>
        <p className="text-sm">Create / revoke. <Code>ea_…</Code> prefix, SHA-256 hashed at rest, plaintext shown ONCE at creation. Pick scopes (<Code>read:contacts</Code>, <Code>write:contacts</Code>) at creation, routes return 403 if the required scope is missing. Pre-0004 keys with no scopes recorded keep working as full-access for back-compat.</p>
        <p className="text-sm">Danger tab supports scoped wipes (contacts / drafts / events / everything). Type <Code>DELETE</Code> to enable.</p>
      </Section>

      <Section id="custom-fields" title="10b. Custom contact fields">
        <p className="text-sm">User-defined <Code>{'{{vars}}'}</Code> with zero schema migration. Two-step setup:</p>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Settings → General → <strong>Custom contact fields</strong>: add keys, e.g. <Code>region, tier, deal_stage</Code>. Lowercase snake_case only.</li>
          <li>When you click <strong>Add contact</strong>, a "Custom fields" section appears with one input per key. Values are saved as a JSON suffix on the contact's <Code>notes</Code> column (legacy plain-text notes still render).</li>
          <li>In the template editor, your custom keys appear as a third row of clickable chips (primary tint). Click to insert <Code>{'{{region}}'}</Code> at cursor.</li>
          <li>At send time, <Code>buildEmail()</Code> reads the JSON suffix and substitutes. Built-in vars (name/email/etc.) always win on key collision.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Roadmap: schema-backed columns + per-contact edit UI. The current design intentionally avoids a migration so we can ship it today.</p>
      </Section>

      <Section id="admin" title="11. Admin (multi-user)">
        <p className="text-sm">Add comma-separated emails to <Code>ADMIN_EMAILS</Code> in <Code>.env</Code>. Admins land on <Link href="/admin" className="underline">/admin</Link>, which is split into <strong>6 tabs</strong>:</p>

        <h3 className="text-sm font-semibold mt-3">/admin, Overview</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Six KPI cards (Users / Contacts / Templates / Drafts pending / Sent 30d / Active campaigns).</li>
          <li><strong>Queue snapshot</strong>, Scheduled / Sending / Retrying / Stuck (&gt;10m) / Sent 24h / Failed 24h / Cancelled 24h, color-coded.</li>
          <li><strong>30-day cross-user send chart</strong>, sent/open/click/reply/bounce series across all users.</li>
          <li><strong>Top senders leaderboard</strong>, top-10 users by sends in the last 30 days.</li>
          <li><strong>Failure heatmap</strong>, 7×24 IST grid; darker cell = more failures. Surfaces SMTP throttling windows.</li>
          <li><strong>Recent admin actions</strong>, last 10 <Code>admin.*</Code> audit rows inline, with a link to the full <Link href="/audit?scope=all" className="underline">/audit?scope=all</Link>.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">/admin/users, User management</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Search + status filter (All / Active / Suspended / Admins).</li>
          <li>Per-row stats columns including a new <strong>Quota/day</strong> column showing the user's override or "default".</li>
          <li><strong>Eye icon</strong>, slide-out drawer with 30-day activity (sent/opens/clicks/replies/bounces/queued), inventory, current settings (throttle, domain caps, last-sent), and last 10 sends with status badges.</li>
          <li><strong>Key icon</strong>, prompt to set a per-user <Code>DAILY_SEND_LIMIT_OVERRIDE</Code>. Scheduler honors it instead of <Code>env.DAILY_SEND_LIMIT</Code>. Empty / 0 clears the override.</li>
          <li><strong>UserCog icon</strong>, <strong>impersonate</strong>. Mints a 1-hour session as the target user, REVOKES your current admin session row (so a leaked old cookie can't be replayed), and replaces your cookie. Refuses to impersonate another admin. Audit-logged with actor + target. Sign out and back in to recover your admin session.</li>
          <li>Single + bulk <strong>Suspend / Resume</strong>, reuses <Code>SENDS_PAUSED</Code>; data stays, worker stops sending.</li>
          <li>Delete user (cascades through every table).</li>
          <li><strong>CSV</strong> button → <Code>/api/admin/users/export</Code> streams a 1000-row-paged users dump.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">/admin/queue, Queue health</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Queue counts (Scheduled / Sending / Retrying / Stuck / Sent 24h / Failed 24h / Cancelled 24h).</li>
          <li>Active queue (next 50): when, user, recipient, subject, status badge.</li>
          <li>Recent failures (last 20): when, user, recipient, attempts, reason.</li>
          <li><strong>Recover stuck</strong> button, flips any <Code>Sending</Code>-status row older than 10 min back to <Code>Scheduled</Code> so the next tick picks it up. Scoped to the exact ids seen at SELECT, so the reported count is accurate. Audit-logged.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">/admin/webhooks, Delivery health</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Counts: Total / Healthy (last &lt; 400) / Failing (last ≥ 400) / Untested.</li>
          <li>All webhooks table: owner, URL, subscribed events, last HTTP status (color-coded), last delivery, last error.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">/admin/system, Ops + config</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li><strong>Database card</strong>, driver (SQLite vs Turso), file size, events 7d vs prev-7d growth comparison, row counts across 12 tables.</li>
          <li><strong>Quota usage today</strong> (rolling 24h), top 20 users with sent/limit progress bars, green/amber/red at 70%/90% of their effective limit.</li>
          <li><strong>Global blocklist editor</strong>, add/remove <Code>userId=null</Code> blocklist entries that apply to every user. Dedupes on add; audit-logged.</li>
          <li><strong>Active campaigns</strong>, campaign, owner, status, enrollment counts (active/replied/completed/stopped). Hides archived.</li>
          <li>Admins, Runtime configuration, Bulk import contacts, Retention "Purge now", all the original cards moved here.</li>
        </ul>

        <h3 className="text-sm font-semibold mt-3">/admin/broadcast, Site-wide announcement</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Post a 280-char message that renders as an amber banner at the top of every signed-in page until cleared. Persisted as the latest <Code>admin.broadcast</Code> audit row.</li>
          <li>Empty submission clears the broadcast. Layout reads it via an <Code>unstable_cache(['current-broadcast'], &hellip;)</Code> wrapper that <Code>broadcastAction</Code> invalidates by tag, no per-request DB hit on most page loads.</li>
        </ul>

        <p className="text-sm mt-4">Other admin powers from anywhere in the app:</p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>If <Code>ALLOW_DEV_SIGNIN=true</Code> on a deployed env, a sticky <strong>red banner</strong> rides on top of every page so it can't be forgotten.</li>
          <li><Code>/api/backup</Code> downloads the whole DB (admin-only, audit-logged). Streams the file with <Code>createReadStream</Code> so large DBs don't OOM the Lambda; returns 501 on Turso/libSQL deployments since there's no local file.</li>
          <li><Link href="/diagnostic" className="underline">/diagnostic</Link>, admin-gated. Probes SMTP / AI / OAuth / MX / SPF / DMARC + CRON_SECRET / libsql / ADMIN_EMAILS.</li>
          <li><Link href="/audit?scope=all" className="underline">/audit?scope=all</Link>, cross-user audit log. Every admin write writes a row automatically.</li>
          <li>All admin write actions are rate-limited 60/min/admin to cap accidental loops + Groq spend.</li>
          <li>Per-draft / per-row / per-step <strong>AI Improve</strong> Sparkles buttons at <Link href="/drafts" className="underline">/drafts</Link>, <Link href="/schedule" className="underline">/schedule</Link>, and /campaigns, admin-only, audit-logged.</li>
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
              ['GET /api/progress', 'user', 'SSE stream of progress events (drafts / contact import) for the authed user'],
              ['GET /api/progress/poll?since=ts', 'user', 'Polling fallback for /api/progress. Returns 204 if no event newer than ts'],
              ['GET /api/contacts/export', 'user', 'CSV of every contact you own'],
              ['GET /api/audit/export', 'user', 'CSV of your full audit log (streams 1000-row pages). Admins can pass ?scope=all'],
              ['GET /api/csv-template', 'open', 'Starter CSV with 5 realistic sample rows + canonical headers'],
              ['GET /api/v1/contacts', 'API key · read:contacts', 'List your contacts (page, pageSize, search, tag)'],
              ['POST /api/v1/contacts', 'API key · write:contacts', 'Create a contact. Body: {recruiterEmail, recruiterName?, company?, …}'],
              ['GET /api/backup', 'admin', 'Whole-DB .db file download (admin only, audit-logged)'],
              ['GET /api/admin/users/export', 'admin', 'Streamed CSV of every user with per-user counts. Audit-logged'],
              ['GET /api/track/open?eid=&t=', 'open (HMAC)', '1×1 GIF + records open event if HMAC verifies'],
              ['GET /api/track/click?eid=&u=&t=', 'open (HMAC)', '302 redirect + records click event'],
              ['GET /unsubscribe?e=&t=', 'open (HMAC)', 'Confirmation page; adds to global blocklist'],
              ['POST /unsubscribe?e=&t=', 'open (HMAC)', 'RFC 8058 one-click unsubscribe'],
              ['GET /api/cron/tick', 'CRON_SECRET', 'Worker tick, sends scheduled emails, advances campaign enrollments. GitHub Actions cron hits this every 5 min (Vercel Hobby blocks short crons). Authorization: Bearer ${CRON_SECRET} required (or ?secret=).'],
            ].map(([path, auth, what]) => (
              <tr key={path} className="border-t"><td className="p-1">{path}</td><td className="p-1 text-muted-foreground">{auth}</td><td className="p-1 font-sans text-muted-foreground">{what}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-2">Most mutations are <strong>Server Actions</strong> (in <Code>server/actions/*.ts</Code>) called directly from React components, not REST endpoints.</p>
        <h3 className="text-sm font-semibold mt-3">Outbound webhooks</h3>
        <p className="text-sm">Subscribe a URL in Settings → Webhooks to one or more event kinds (<Code>sent / open / click / reply / bounce / unsubscribe</Code>). Payload is POST JSON:</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`{
  "kind": "sent",
  "payload": { ...event-specific... },
  "ts": 1780000000000
}`}</pre>
        <p className="text-sm">Each request is HMAC-SHA256 signed with your per-subscription secret; verify the <Code>X-EA-Signature</Code> header.</p>
      </Section>

      <Section id="env" title="13. Environment variables (A–Z)">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground"><tr><th className="p-1">Var</th><th className="p-1">Default</th><th className="p-1">Purpose</th></tr></thead>
          <tbody className="font-mono">
            {[
              ['ADMIN_EMAILS', '(empty)', 'Comma-separated emails that get admin privileges'],
              ['ALLOW_DEV_SIGNIN', 'false', 'Enable the dev sign-in API in production. Triggers red sticky banner.'],
              ['APP_URL', 'http://localhost:3000', 'Used in tracking + unsubscribe URLs'],
              ['AUTH_SECRET', '(required)', 'Auth.js session secret + signs tracking/unsubscribe HMACs. Also the fallback ENCRYPTION_KEY source.'],
              ['CRON_SECRET', '—', 'Bearer token GitHub Actions sends to /api/cron/tick. UNSET = endpoint is OPEN to the public, logs a loud console.error in prod.'],
              ['DAILY_SEND_LIMIT', '50', 'Default hard cap per user (rolling 24h). Admins override per-user from /admin/users.'],
              ['DATABASE_URL', './data/tracker.db', 'SQLite file path locally, or a libsql:// URL (Turso) on Vercel. Driver picked from prefix.'],
              ['DEV_BYPASS_EMAILS', 'test@gmail.com', 'Emails the dev sign-in route accepts'],
              ['EMAIL_FROM', '(falls back to SMTP_USER)', 'From: header on outgoing mail'],
              ['ENCRYPTION_KEY', '(falls back to AUTH_SECRET)', 'AES-GCM key for at-rest encryption of SMTP_PASS + GROQ_API_KEY in settings. RECOMMENDED to set explicitly on prod, decouples credential encryption from Auth.js. Rotating it invalidates every saved per-user credential.'],
              ['EVENTS_RETENTION_DAYS', '180', 'Per-user setting (not env). Override from settings table. Scheduler purges events older than this once per 24h.'],
              ['AUDIT_RETENTION_DAYS', '365', 'Per-user setting. Audit-log rows older than this are purged.'],
              ['GOOGLE_CLIENT_ID', '—', 'Google OAuth, Continue-with-Google'],
              ['GOOGLE_CLIENT_SECRET', '—', 'Google OAuth secret'],
              ['GROQ_API_KEY', '—', 'Powers AI Improve. Encrypted at rest when set per-user.'],
              ['GROQ_MODEL', 'llama-3.3-70b-versatile', 'Which Groq model to use for AI Improve'],
              ['MULTI_INSTANCE', 'false', 'Set to "true" alongside VERCEL=1 to acknowledge the in-memory rate-limiter is ineffective. Real fix: REDIS_URL.'],
              ['NEXTAUTH_URL', 'http://localhost:3000', 'Used by Auth.js for callback URLs'],
              ['NODE_ENV', '—', 'Standard. "production" enables several invariants (CSP unsafe-eval off, dev-signin banner trigger, pino JSON logs).'],
              ['REDIS_URL', '—', 'Future: backend for a distributed rate limiter. Not yet wired, lib/rate-limit.ts warns when running on Vercel without this.'],
              ['SMTP_HOST', 'smtp.gmail.com', 'SMTP host'],
              ['SMTP_PASS', '—', 'SMTP password (Gmail App Password recommended). Encrypted at rest when stored per-user.'],
              ['SMTP_PORT', '587', 'SMTP port (465 → secure mode auto-on)'],
              ['SMTP_USER', '—', 'SMTP username / from address'],
              ['TIMEZONE', 'Asia/Kolkata', 'Display timezone for UI strings'],
              ['TURSO_AUTH_TOKEN', '—', 'Auth token for the libSQL/Turso connection (Vercel only)'],
              ['UPSTASH_REDIS_REST_URL', '—', 'Alternative to REDIS_URL for Upstash; same purpose.'],
              ['VERCEL', '—', 'Auto-set by Vercel. Triggers multi-instance warnings + production code paths.'],
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

        <h3 className="text-sm font-semibold mt-3">C. SMTP (Gmail), magic-link + outbound</h3>
        <ol className="list-decimal pl-6 text-sm space-y-1">
          <li>Enable 2FA on your Google account.</li>
          <li>Visit <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Passwords</a>, generate one.</li>
          <li>Set <Code>SMTP_USER=you@gmail.com</Code>, <Code>SMTP_PASS=&lt;16-char password&gt;</Code>.</li>
          <li>(Optional) <Code>EMAIL_FROM="Your Name &lt;you@gmail.com&gt;"</Code>.</li>
        </ol>

        <h3 className="text-sm font-semibold mt-3">D. Google OAuth, Continue-with-Google</h3>
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
npm run seed:templates -- you@example.com         # optional: load 5 public + 23 admin-overlay starter templates`}</pre>

        <h3 className="text-sm font-semibold mt-3">G. Run</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`npm run build && npm start    # production, port 3000
npm run worker                 # in another shell, sends scheduled + advances campaigns`}</pre>
      </Section>

      <Section id="deploy" title="15. Deployment options">
        <h3 className="text-sm font-semibold">Self-hosted Linux box (recommended)</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`pm2 start npm --name email-automator-web    -- start
pm2 start npm --name email-automator-worker -- run worker
pm2 save`}</pre>

        <h3 className="text-sm font-semibold mt-3">Vercel</h3>
        <p className="text-sm">
          The UI runs on Vercel out of the box. <Code>server/db/client.ts</Code> is a dual driver, it
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
        <p className="text-sm">Alternative: <strong>Vercel Postgres / Neon</strong>, heavier swap; change schema to <Code>pgTable</Code> and use Drizzle's pg adapter. Only worth it if Postgres is already in your stack.</p>

        <h3 className="text-sm font-semibold mt-3">Docker</h3>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`docker build -t email-automator .
docker run -d -p 3000:3000 -v $PWD/data:/app/data --env-file .env email-automator`}</pre>
      </Section>

      <Section id="troubleshoot" title="16. Troubleshooting">
        <dl className="text-sm space-y-3">
          <div>
            <dt className="font-medium">Blank page after sign-in</dt>
            <dd className="text-muted-foreground">Hard-refresh (<Kbd>Ctrl+Shift+R</Kbd>), stale chunk. Check DevTools console for CSP/eval errors.</dd>
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
            <dd className="text-muted-foreground">Outlook + Apple Mail (with privacy protection) block remote images. Gmail / web mail render them, opens count there.</dd>
          </div>
          <div>
            <dt className="font-medium">"Template not found" when adding a campaign step</dt>
            <dd className="text-muted-foreground">That template id isn't yours. Refresh, the dropdown may be stale, or it was deleted.</dd>
          </div>
          <div>
            <dt className="font-medium">CSV import says "No valid rows"</dt>
            <dd className="text-muted-foreground">No Email column detected. Make sure one header contains "email" (case-insensitive) and that values match <Code>x@y.z</Code>. Check the import report (auto-shown after upload) for per-row reasons.</dd>
          </div>
          <div>
            <dt className="font-medium">A queued row was marked "Cancelled" with "Throttled: already sent…"</dt>
            <dd className="text-muted-foreground">The per-recipient throttle in <Link href="/settings" className="underline">Settings → General</Link> caught it (you set "max 1 per N days"). Set it to <Code>0</Code> to disable, or wait out the window.</dd>
          </div>
          <div>
            <dt className="font-medium">A queued row's <em>Run at</em> keeps slipping forward by 1 hour</dt>
            <dd className="text-muted-foreground">The per-domain daily cap (Settings → General) is deferring it because today's count for that domain hit the cap. It'll send on the next day with capacity.</dd>
          </div>
          <div>
            <dt className="font-medium">"You already emailed X on …" confirmation when sending</dt>
            <dd className="text-muted-foreground">Duplicate-send guard: this recipient was already emailed in the last 7 days. Confirm to send anyway, or cancel.</dd>
          </div>
          <div>
            <dt className="font-medium">Worker isn't running on Vercel</dt>
            <dd className="text-muted-foreground">Vercel is serverless, there's no long-running worker process. Instead, GitHub Actions cron (<Code>.github/workflows/cron-tick.yml</Code>) hits <Code>/api/cron/tick</Code> every 5 min. Verify <Code>CRON_SECRET</Code> matches in both Vercel env + GitHub Actions secrets.</dd>
          </div>
          <div>
            <dt className="font-medium">Vercel deploy returns 500 on every route</dt>
            <dd className="text-muted-foreground">Check Vercel Logs. The known traps: (1) <Code>"type":"module"</Code> in package.json, Vercel's CJS wrapper can't <Code>require()</Code> ESM page output; (2) missing <Code>TURSO_AUTH_TOKEN</Code> env in Production; (3) missing redirect URI in Google OAuth (<Code>https://yourapp.vercel.app/api/auth/callback/google</Code>); (4) a sync function exported from a <Code>'use server'</Code> file, Turbopack rejects this at build with "Server Actions must be async functions".</dd>
          </div>
          <div>
            <dt className="font-medium">Queue shows rows stuck in "Sending"</dt>
            <dd className="text-muted-foreground">Normal, the scheduler auto-recovers any row older than 10 min back to <Code>Scheduled</Code> on the next tick. For an immediate flip, an admin can hit <Link href="/admin/queue" className="underline">/admin/queue → Recover stuck (N)</Link>. The button is scoped to the exact ids seen at SELECT, so the count it reports is accurate.</dd>
          </div>
          <div>
            <dt className="font-medium">Broadcast banner doesn't appear right after posting</dt>
            <dd className="text-muted-foreground">The layout caches the latest broadcast via <Code>unstable_cache(['current-broadcast'], &hellip;, {`{ revalidate: 300 }`})</Code>. <Code>broadcastAction</Code> calls <Code>revalidatePath('/', 'layout')</Code> so it should refresh immediately on the next navigation; worst-case staleness is 5 minutes if revalidation misses. Hard-refresh forces re-render.</dd>
          </div>
          <div>
            <dt className="font-medium">Per-user quota override isn't applying</dt>
            <dd className="text-muted-foreground">Check the user's <strong>Quota/day</strong> column on <Link href="/admin/users" className="underline">/admin/users</Link>. It should show your override as a primary-tinted chip rather than "default". If empty, the env <Code>DAILY_SEND_LIMIT</Code> is in effect. The scheduler reads <Code>DAILY_SEND_LIMIT_OVERRIDE</Code> from the user's settings BEFORE the env default, so any positive integer here wins. Setting to 0 or empty clears the override.</dd>
          </div>
          <div>
            <dt className="font-medium">SSE progress bar stays empty during a bulk operation</dt>
            <dd className="text-muted-foreground">On Vercel the SSE socket may connect but the emitter (server action) runs in a different Lambda, events never arrive over SSE. The client falls back to <Code>/api/progress/poll?since=&hellip;</Code> every 2 s. If the poll is also failing, check Network tab for 401s (session expired) or 204s (no events, the operation may have already completed).</dd>
          </div>
          <div>
            <dt className="font-medium">Campaign step keeps firing after the contact replied</dt>
            <dd className="text-muted-foreground">Reply detection is not automatic, run <Link href="/diagnostic" className="underline">/diagnostic → Check Replies (Gmail)</Link>. That scans your inbox, marks the contact (<Code>emailStatus = "Replied!"</Code>) AND any active campaign enrollments (<Code>status = "replied"</Code>) so the scheduler's <Code>stopOnReply</Code> gate fires on the next tick. Without running it, the scheduler has no way to know the contact replied.</dd>
          </div>
          <div>
            <dt className="font-medium">Rate-limit doesn't seem to enforce on Vercel</dt>
            <dd className="text-muted-foreground">The in-memory limiter is per-Lambda. With multiple concurrent instances, the effective limit is <Code>max × instance_count</Code>. A loud one-shot warning logs on first use; until <Code>REDIS_URL</Code> is wired, treat the limits as soft hints, not hard security gates.</dd>
          </div>
        </dl>
      </Section>

      <Section id="shortcuts" title="17. Keyboard shortcuts">
        <h3 className="text-sm font-semibold">Command palette</h3>
        <div className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Kbd>⌘/Ctrl + K</Kbd><span>Open command palette (fuzzy search across every page)</span>
          <Kbd>↑ ↓</Kbd><span>Navigate the palette</span>
          <Kbd>↵</Kbd><span>Open the highlighted page</span>
          <Kbd>Esc</Kbd><span>Close palette / any dialog</span>
        </div>
        <h3 className="text-sm font-semibold mt-3">Rich-text editor</h3>
        <div className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Kbd>⌘/Ctrl + B</Kbd><span>Bold</span>
          <Kbd>⌘/Ctrl + I</Kbd><span>Italic</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          The palette is the fastest way to jump anywhere, start typing a page name (e.g. "drafts" → /drafts, "admin webhooks" → /admin/webhooks) and hit Enter. Admin-only pages only appear in the list for admins.
        </p>
      </Section>
        </div>
      </div>
    </div>
  )
}
