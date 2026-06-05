'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  LayoutDashboard, Users, FileText, Send, CalendarClock, Workflow, BarChart3, Ban, ScrollText,
  UserCircle2, Settings, FlaskConical, Eye, BookOpen, Shield, Building2, User2, Mail, Workflow as CampaignIcon,
  Sparkles, Plus, Keyboard, HelpCircle, Briefcase,
} from 'lucide-react'
import { globalSearchAction, type SearchResult } from '@/server/actions/search'

// Quick actions — common "do something" verbs the user might type
// rather than navigating manually. Each one is a router push to a page
// that already exposes the entry point (we keep palette stateless).
interface QuickAction {
  href: string
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  /** Match against the typed query so the action surfaces when
   *  relevant. We bias toward verbs ("create", "new", "send", "import"). */
  keywords: string
}
const QUICK_ACTIONS: QuickAction[] = [
  { href: '/drafts',        label: 'Create drafts',       hint: 'Open the new-drafts dialog',          icon: Sparkles, keywords: 'new draft create batch generate compose write' },
  { href: '/templates',     label: 'New template',        hint: 'Add a template via the editor',       icon: Plus,     keywords: 'template new create add' },
  { href: '/campaigns',     label: 'New campaign',        hint: 'Open the new-campaign flow',          icon: Workflow, keywords: 'campaign sequence new create automate' },
  { href: '/contacts',      label: 'Import contacts',     hint: 'CSV or Excel upload',                 icon: Users,    keywords: 'import upload csv xlsx contact add' },
  { href: '/companies/new', label: 'Add company',         hint: 'AI-fillable research record',         icon: Building2,keywords: 'company add new research enrich' },
  { href: '/jobs',          label: 'Track jobs',          hint: 'Add a job-board URL to monitor',      icon: Briefcase,keywords: 'job jobs career careers track watch monitor source listing' },
  { href: '/schedule',      label: 'Schedule send',       hint: 'Bulk schedule with stagger',          icon: CalendarClock, keywords: 'schedule queue stagger send later' },
  { href: '/diagnostic',    label: 'Run diagnostic',      hint: 'Pre-flight SMTP / DNS / cron checks', icon: FlaskConical, keywords: 'diagnose check test smtp dns deploy' },
  { href: '/profile',       label: 'Export my data',      hint: 'GDPR JSON dump',                      icon: ScrollText, keywords: 'export download gdpr backup data' },
]

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; admin?: boolean }
const ITEMS: Item[] = [
  { href: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/contacts',   label: 'Contacts',    icon: Users },
  { href: '/companies',  label: 'Companies',   icon: Building2 },
  { href: '/jobs',       label: 'Job tracker', icon: Briefcase },
  { href: '/templates',  label: 'Templates',   icon: FileText },
  { href: '/drafts',     label: 'Drafts',      icon: Send },
  { href: '/dry-run',    label: 'Dry run',     icon: Eye },
  { href: '/schedule',   label: 'Schedule',    icon: CalendarClock },
  { href: '/campaigns',  label: 'Campaigns',   icon: Workflow },
  { href: '/analytics',  label: 'Analytics',   icon: BarChart3 },
  { href: '/blocklist',  label: 'Blocklist',   icon: Ban },
  { href: '/audit',      label: 'Audit log',   icon: ScrollText },
  { href: '/profile',    label: 'Profile',     icon: UserCircle2 },
  { href: '/settings',   label: 'Settings',    icon: Settings },
  { href: '/diagnostic', label: 'Diagnostic',  icon: FlaskConical, admin: true },
  { href: '/guide',      label: 'User guide',  icon: BookOpen },
  { href: '/admin',      label: 'Admin',       icon: Shield, admin: true },
]

const KIND_ICON: Record<SearchResult['kind'], React.ComponentType<{ className?: string }>> = {
  contact: User2,
  template: FileText,
  draft: Mail,
  campaign: CampaignIcon,
}
const KIND_LABEL: Record<SearchResult['kind'], string> = {
  contact: 'Contacts',
  template: 'Templates',
  draft: 'Drafts',
  campaign: 'Campaigns',
}

export function CommandPalette({ isAdmin }: { isAdmin?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  // Race-condition guard: each fetch increments seq; only the latest
  // response is written to state. Without this, typing fast then deleting
  // can leave stale results from an in-flight request lingering.
  const seq = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Debounced server search. Skip short queries — palette degrades to
  // pure nav list. 200ms debounce keeps the search snappy without
  // hammering on every keystroke.
  //
  // We synchronously CLEAR results when the query goes back under 2
  // chars by deriving from state instead of calling setResults() inside
  // the effect (react-hooks/set-state-in-effect would otherwise fire).
  const needle = q.trim()
  const shouldSearch = open && needle.length >= 2
  useEffect(() => {
    if (!shouldSearch) {
      // No request to make. We deliberately don't reset `searching` here
      // — it's render-gated by `shouldSearch` in the JSX below, so a
      // stale `true` doesn't surface to the user. Avoids a synchronous
      // setState inside the effect.
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    // Defer setSearching(true) inside the timeout so we don't call
    // setState synchronously during the effect (would re-render
    // immediately on every keystroke).
    debounce.current = setTimeout(async () => {
      setSearching(true)
      const my = ++seq.current
      const r = await globalSearchAction(needle)
      if (my === seq.current) {
        setResults(r.results)
        setSearching(false)
      }
    }, 200)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [needle, shouldSearch])

  // Effective results: hide stale matches as soon as the query drops
  // below the search threshold so the palette doesn't show contacts
  // for a query the user just deleted.
  const effectiveResults = shouldSearch ? results : []

  if (!open) return null
  const items = ITEMS.filter((it) => !it.admin || isAdmin)

  // Group results by kind so the palette renders a section per type.
  const grouped: Partial<Record<SearchResult['kind'], SearchResult[]>> = {}
  for (const r of effectiveResults) {
    if (!grouped[r.kind]) grouped[r.kind] = []
    grouped[r.kind]!.push(r)
  }
  // Quick actions surface when the query matches the action label or
  // any of its keywords (substring). Cmdk filters within the group too,
  // so even with an inexact match the right ones float up.
  const queryLower = needle.toLowerCase()
  const matchingActions = needle ? QUICK_ACTIONS.filter((a) =>
    a.label.toLowerCase().includes(queryLower) || a.keywords.toLowerCase().includes(queryLower)
  ) : []

  function pick(href: string) { setOpen(false); router.push(href) }

  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette"
      className="fixed inset-0 z-50 grid place-items-start bg-black/50 p-4 pt-[15vh]"
      onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-lg border bg-card shadow-2xl ea-pop"
        onClick={(e) => e.stopPropagation()}>
        <Command className="[&_[cmdk-list]]:max-h-[60vh] [&_[cmdk-list]]:overflow-auto" loop shouldFilter={q.trim().length < 2}>
          <div className="flex items-center gap-2 border-b px-4">
            <Command.Input
              autoFocus
              value={q}
              onValueChange={setQ}
              placeholder="Jump to a page — or type to search contacts, templates, drafts, campaigns…"
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search"
            />
            {searching && shouldSearch ? <span className="text-xs text-muted-foreground">searching…</span> : null}
          </div>
          <Command.List>
            <Command.Empty className="px-4 py-6 text-sm text-muted-foreground">
              {q.trim().length >= 2 ? 'No matches.' : 'Start typing to search your data.'}
            </Command.Empty>

            {/* Quick actions — only when the user has typed something
                and at least one action keyword matches. Renders above
                the data-search results so verbs are reachable in 1-2
                keystrokes ("new" → "Create drafts", "imp" → "Import
                contacts"). */}
            {matchingActions.length > 0 ? (
              <Command.Group
                heading="Quick actions"
                className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {matchingActions.map((a, i) => {
                  const Icon = a.icon
                  return (
                    <Command.Item
                      key={`qa-${i}`}
                      value={`qa-${a.label}-${a.keywords}`}
                      onSelect={() => pick(a.href)}
                      className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm aria-selected:bg-accent"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{a.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{a.hint}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ) : null}

            {/* Search results (only when q is set). Each section has at
                most 5 rows from the server. */}
            {Object.entries(grouped).map(([kind, rs]) => {
              const Icon = KIND_ICON[kind as SearchResult['kind']]
              return (
                <Command.Group
                  key={kind}
                  heading={KIND_LABEL[kind as SearchResult['kind']]}
                  className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {rs!.map((r, i) => (
                    <Command.Item
                      key={`${kind}-${i}`}
                      value={`${kind}-${r.label}-${i}`}
                      onSelect={() => pick(r.href)}
                      className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm aria-selected:bg-accent"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{r.label}</span>
                      {r.sub ? <span className="ml-auto truncate text-xs text-muted-foreground">{r.sub}</span> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              )
            })}

            {/* Nav links — always shown so the palette still works when
                offline / API errors. cmdk's filter handles the "matches
                what you typed" client side via shouldFilter (set above). */}
            <Command.Group
              heading="Navigation"
              className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {items.map((it) => (
                <Command.Item key={it.href} value={it.label} onSelect={() => pick(it.href)}
                  className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm aria-selected:bg-accent">
                  <it.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{it.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{it.href}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
        <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <kbd className="rounded border bg-background px-1">↑↓</kbd> navigate ·{' '}
          <kbd className="rounded border bg-background px-1">↵</kbd> open ·{' '}
          <kbd className="rounded border bg-background px-1">esc</kbd> close ·{' '}
          <kbd className="rounded border bg-background px-1">?</kbd> shortcuts ·{' '}
          <span className="inline-flex items-center gap-1"><Keyboard className="h-3 w-3" /><HelpCircle className="h-3 w-3" /> tip: type a verb (new, send, import)</span>
        </div>
      </div>
    </div>
  )
}
