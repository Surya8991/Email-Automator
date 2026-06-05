import { requireUser } from '@/auth'
import { getMany } from '@/server/services/settings'
import { db } from '@/server/db/client'
import { accounts, contacts, drafts, events } from '@/server/db/schema'
import { and, eq, gte, sql } from 'drizzle-orm'
import { env } from '@/lib/env'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProfileForm } from './profile-form'
import { GmailCard } from './gmail-card'
import { Mail, BriefcaseBusiness, CalendarDays, BadgeCheck, ShieldCheck } from 'lucide-react'

const KEYS = [
  'PROFILE_NAME', 'PROFILE_PHONE', 'PROFILE_COMPANY', 'PROFILE_ROLE',
  'PROFILE_LINKEDIN', 'USER_PORTFOLIO_LINK', 'DEFAULT_ROLE_NAME',
  'CACHED_SIGNATURE', 'UNSUBSCRIBE_TEXT', 'UNSUBSCRIBE_ENABLED',
  'TIMEZONE',
]

const DAY_MS = 24 * 60 * 60 * 1000

export default async function ProfilePage() {
  const u = await requireUser()
  const since30 = Date.now() - 30 * DAY_MS

  const [settings, contactsN, draftsN, eventBuckets, googleRows] = await Promise.all([
    getMany(u.id, KEYS),
    db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.userId, u.id)),
    db.select({ n: sql<number>`COUNT(*)` }).from(drafts).where(and(eq(drafts.userId, u.id), eq(drafts.status, 'draft'))),
    db.select({ kind: events.kind, n: sql<number>`COUNT(*)` }).from(events)
      .where(and(eq(events.userId, u.id), gte(events.ts, since30)))
      .groupBy(events.kind),
    // Did this user sign in with Google? If so we can offer Gmail-API features.
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? db.select().from(accounts).where(and(eq(accounts.userId, u.id), eq(accounts.provider, 'google')))
      : Promise.resolve([]),
  ])

  const counts = Object.fromEntries(eventBuckets.map((b) => [b.kind, Number(b.n)]))
  const sent30 = counts.sent ?? 0
  const replies30 = counts.reply ?? 0
  const opens30 = counts.open ?? 0
  const replyRate = sent30 > 0 ? Math.round((replies30 / sent30) * 100) : 0
  const openRate = sent30 > 0 ? Math.round((opens30 / sent30) * 100) : 0

  // Profile completeness — checks the fields that materially affect outreach.
  const checklist = [
    { key: 'PROFILE_NAME', label: 'Display name', done: Boolean(settings.PROFILE_NAME?.trim()) },
    { key: 'PROFILE_ROLE', label: 'Current role', done: Boolean(settings.PROFILE_ROLE?.trim()) },
    { key: 'DEFAULT_ROLE_NAME', label: 'Default {{role_name}}', done: Boolean(settings.DEFAULT_ROLE_NAME?.trim()) },
    { key: 'USER_PORTFOLIO_LINK', label: 'Portfolio link', done: Boolean(settings.USER_PORTFOLIO_LINK?.trim()) },
    { key: 'PROFILE_LINKEDIN', label: 'LinkedIn URL', done: Boolean(settings.PROFILE_LINKEDIN?.trim()) },
    { key: 'CACHED_SIGNATURE', label: 'Email signature', done: Boolean(settings.CACHED_SIGNATURE?.trim()) },
  ]
  const completion = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100)

  // Initials: ASCII-letters-only, codepoint-aware. Emoji, surrogate pairs,
  // and non-letter chars are stripped so we never render a broken glyph
  // or tofu box in the avatar. Falls back to '?' when nothing usable
  // is left — handles edge cases like "@example.com" or " " or "🎯🎯".
  function deriveInitials(name: string, email: string): string {
    const source = name.trim() || email
    const words = source.split(/[\s@._-]+/).filter(Boolean)
    const chars: string[] = []
    for (const w of words) {
      const ch = [...w].find((c) => /^[a-zA-Z]$/.test(c))
      if (ch) chars.push(ch.toUpperCase())
      if (chars.length >= 2) break
    }
    return chars.length > 0 ? chars.join('') : '?'
  }
  const initials = deriveInitials(settings.PROFILE_NAME ?? '', u.email)

  const hasGoogleAccount = googleRows.length > 0
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Hero — identity at a glance + completion + admin/auth badges */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-2xl font-semibold text-white shadow">
            {initials}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {settings.PROFILE_NAME || 'Your name'}
              </h1>
              {u.isAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <ShieldCheck className="h-3 w-3" /> Admin
                </span>
              ) : null}
              {hasGoogleAccount ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck className="h-3 w-3" /> Google connected
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{u.email}</span>
              {settings.PROFILE_ROLE ? (
                <span className="inline-flex items-center gap-1.5"><BriefcaseBusiness className="h-3.5 w-3.5" />{settings.PROFILE_ROLE}{settings.PROFILE_COMPANY ? ` at ${settings.PROFILE_COMPANY}` : ''}</span>
              ) : null}
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Timezone: {settings.TIMEZONE || 'Asia/Kolkata'}</span>
            </div>
          </div>
          <div className="w-full shrink-0 sm:w-48">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Profile completeness</span>
              <span className="font-mono tabular-nums">{completion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${completion === 100 ? 'bg-emerald-500' : completion >= 60 ? 'bg-primary' : 'bg-amber-500'}`}
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats — last 30 days */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Contacts" value={Number(contactsN[0]?.n ?? 0)} />
        <Stat label="Pending drafts" value={Number(draftsN[0]?.n ?? 0)} />
        <Stat label="Sent (30d)" value={sent30} />
        <Stat label="Reply rate" value={`${replyRate}%`} hint={`${replies30}/${sent30} replies`} />
      </div>

      {/* Profile completion checklist — collapsed when 100% so it doesn't nag */}
      {completion < 100 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finish setting up</CardTitle>
            <CardDescription>Templates pull these for {'{{role_name}}'}, {'{{portfolio_link}}'}, signature, and more.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${c.done ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  <span className={c.done ? 'text-muted-foreground line-through decoration-1' : ''}>{c.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Form: identity + outreach defaults + signature + unsubscribe */}
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>Used in template variables and on every outgoing email.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm email={u.email} initial={settings} />
        </CardContent>
      </Card>

      {/* Gmail integration — visible whether connected or not so users know the path */}
      {hasGoogleAccount ? (
        <Card>
          <CardHeader>
            <CardTitle>Gmail integration</CardTitle>
            <CardDescription className="text-xs">
              You're signed in with Google. Pull your real Gmail signature into your profile
              (overwrites the signature field above) or run inbox-side checks (replies / bounces).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GmailCard />
          </CardContent>
        </Card>
      ) : googleConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect Gmail</CardTitle>
            <CardDescription className="text-xs">
              Sign out and back in with <strong>Continue with Google</strong> on the login page
              to unlock Gmail signature import, reply detection, and bounce check.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="text-xs text-muted-foreground" title={hint}>{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
