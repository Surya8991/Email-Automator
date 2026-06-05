'use client'
import * as React from 'react'

// Segmented control — small pill-style option group. Replaces
// shadcn Tabs for short (≤ 4-option) toggles where the labels are
// short enough to fit on one line.
//
// Visual is driven by .ea-segmented in globals.css. Markup is just
// a <div> with <button> children — no Radix dep, no JS for the
// active state beyond a controlled value/onChange.
//
// Use for: Edit/Generate toggle in /templates, Quick/Full in
// Diagnostic, segment-by-status filters, etc.

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }>
  className?: string
  ariaLabel?: string
}

export function Segmented<T extends string>({ value, onChange, options, className, ariaLabel }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`ea-segmented ${className ?? ''}`}>
      {options.map((o) => {
        const Icon = o.icon
        const active = o.value === value
        return (
          <button
            key={o.value} type="button" role="radio"
            aria-checked={active}
            data-active={active ? 'true' : 'false'}
            onClick={() => onChange(o.value)}
            className="inline-flex items-center gap-1.5 ea-transition"
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
