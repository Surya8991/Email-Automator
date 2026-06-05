import * as React from 'react'
import { cn } from '@/lib/utils'

// EmptyState — friendlier replacement for the "No rows yet…" text we use
// in every list. Centered icon + headline + sub + action row. Use inside
// a Card or directly inside a section.

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  /** Primary CTA and optional secondaries — buttons or links. */
  action?: React.ReactNode
  /** Subtle hint shown below the action row. */
  hint?: React.ReactNode
  className?: string
  /** Reduces vertical padding when shown inside a small card. */
  compact?: boolean
}

export function EmptyState({ icon: Icon, title, description, action, hint, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center ea-fade-in',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground"
        >
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{action}</div> : null}
      {hint ? <p className="pt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
