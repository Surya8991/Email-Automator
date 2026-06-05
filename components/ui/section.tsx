import * as React from 'react'
import { cn } from '@/lib/utils'

// <Section> — visual grouping primitive for pages that have multiple
// related cards. Pages used to stack 4–8 Cards vertically with no
// hierarchy; Section gives each cluster an eyebrow label, optional
// description, optional right-side action slot, and a hairline
// divider underneath so the eye groups them.
//
// Pattern: a page has one PageHeader at the top, then 1-N Sections.
// Each Section wraps either a Card / grid of cards / table / form.

// Omit `title` from HTMLAttributes so we can widen it to ReactNode
// (HTMLAttributes.title is a `string` for the native tooltip).
interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Short noun phrase used as the section eyebrow. */
  eyebrow?: string
  /** Slightly larger title rendered below the eyebrow. Optional — many
   *  pages only need the eyebrow for grouping. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Right-side slot for buttons, links, badges. */
  actions?: React.ReactNode
  /** Hide the bottom hairline (default: shown). */
  divider?: boolean
}

export function Section({
  eyebrow, title, description, actions, divider = true,
  className, children, ...rest
}: SectionProps) {
  return (
    <section className={cn('space-y-3', className)} {...rest}>
      {eyebrow || title || description || actions ? (
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="mt-0.5 text-base font-semibold tracking-tight">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div>{children}</div>
      {divider ? <div className="ea-hairline" aria-hidden /> : null}
    </section>
  )
}
