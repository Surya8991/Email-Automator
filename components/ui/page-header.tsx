import * as React from 'react'
import { cn } from '@/lib/utils'

// PageHeader — consistent top chrome for every app page.
//   ┌────────────────────────────────────────────────┐
//   │  [Icon]  Title                  [Right slot]   │
//   │          Description / subtitle text           │
//   │          [Stat pills row, optional]            │
//   └────────────────────────────────────────────────┘
// The right slot lives on the same row as the title on >= sm, then
// wraps below on mobile so the title isn't crushed.

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  /** Right-side action region (buttons, badges, links). */
  actions?: React.ReactNode
  /** Row of compact stat pills under the description. */
  pills?: Array<{
    label: string
    value: React.ReactNode
    tone?: 'default' | 'success' | 'warn' | 'danger' | 'info'
  }>
  /** Section help slot — render <SectionHelp /> here for the inline ? icon. */
  help?: React.ReactNode
  className?: string
}

const PILL_TONE: Record<NonNullable<NonNullable<PageHeaderProps['pills']>[number]['tone']>, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warn:    'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger:  'bg-destructive/10 text-destructive',
  info:    'bg-primary/10 text-primary',
}

export function PageHeader({ title, description, icon: Icon, actions, pills, help, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 ea-fade-in', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            // ea-icon-halo adds a soft gradient ring behind the icon —
            // lifts the header out of the "flat card" look without
            // changing the layout.
            <span
              aria-hidden
              className="ea-icon-halo mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-sm"
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight">{title}</h1>
              {help}
            </div>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {pills && pills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-12">
          {pills.map((p, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ea-transition',
                PILL_TONE[p.tone ?? 'default'],
              )}
            >
              <span className="opacity-70">{p.label}</span>
              <span className="font-semibold tabular-nums ea-count-up">{p.value}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="ea-hairline mt-1" aria-hidden />
    </header>
  )
}
