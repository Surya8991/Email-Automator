'use client'
import { useRef, useState, useEffect } from 'react'
import { Pencil, Code, Bold, Italic, List, Link as LinkIcon } from 'lucide-react'

/**
 * Shared rich-text editor. Picks up where document.execCommand left off —
 * we'll swap for TipTap when M1 lands, but this keeps the bundle small and
 * gives the same API to every caller (drafts editor, templates editor,
 * profile signature). Caller owns the value/onChange — this component is
 * fully controlled so it composes inside forms without surprise state.
 *
 * Edit modes:
 *   - "rich" — contentEditable div + toolbar (Bold / Italic / List / Link)
 *   - "html" — raw <textarea> for paste/edit of markup
 *
 * `placeholder` shows when both modes are empty. `rows` controls the
 * textarea height + sets the rich min-height accordingly.
 */
export interface RichTextEditorProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  className?: string
  /** Hide the Rich/HTML toggle when the caller already knows which mode they want. */
  startMode?: 'rich' | 'html'
}

function exec(cmd: string, value?: string) {
  try { document.execCommand(cmd, false, value) } catch { /* old Safari quirk */ }
}

function ToolbarBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep contenteditable selection
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  value, onChange, placeholder, rows = 12, className, startMode = 'rich',
}: RichTextEditorProps) {
  const richRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'rich' | 'html'>(startMode)

  // Keep the contentEditable's DOM in sync when `value` changes externally
  // (parent reset, AI Improve overwrite). React doesn't reconcile innerHTML
  // for contentEditable so we have to do it ourselves — but only when the
  // incoming value differs from what the user is currently typing, otherwise
  // the cursor jumps to the start of the field on every keystroke.
  useEffect(() => {
    if (mode !== 'rich') return
    const el = richRef.current
    if (!el) return
    if (el.innerHTML !== value) el.innerHTML = value
  }, [value, mode])

  return (
    <div className={className ?? 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
        <div className="inline-flex overflow-hidden rounded-md border bg-background text-xs">
          <button type="button"
            className={`px-2 py-1 ${mode === 'rich' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
            onClick={() => setMode('rich')}>
            <Pencil className="mr-1 inline h-3 w-3" /> Rich
          </button>
          <button type="button"
            className={`border-l px-2 py-1 ${mode === 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
            onClick={() => {
              // Pull latest from contentEditable before switching so the
              // textarea opens on what the user just typed.
              if (richRef.current) onChange(richRef.current.innerHTML)
              setMode('html')
            }}>
            <Code className="mr-1 inline h-3 w-3" /> HTML
          </button>
        </div>
        {mode === 'rich' ? (
          <div className="ml-2 inline-flex items-center gap-0.5">
            <ToolbarBtn label="Bold (Ctrl+B)" onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
            <ToolbarBtn label="Italic (Ctrl+I)" onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
            <ToolbarBtn label="Bullet list" onClick={() => exec('insertUnorderedList')}><List className="h-3.5 w-3.5" /></ToolbarBtn>
            <ToolbarBtn label="Link" onClick={() => {
              const url = prompt('URL:')?.trim()
              if (url) exec('createLink', url)
            }}><LinkIcon className="h-3.5 w-3.5" /></ToolbarBtn>
          </div>
        ) : null}
      </div>
      {mode === 'rich' ? (
        <div
          ref={richRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder ?? ''}
          className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
          style={{ minHeight: `${Math.max(8, rows) * 1.25}rem` }}
          onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
          onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) {
              if (e.key === 'b') { e.preventDefault(); exec('bold') }
              else if (e.key === 'i') { e.preventDefault(); exec('italic') }
            }
          }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          placeholder={placeholder ?? 'HTML body'}
        />
      )}
    </div>
  )
}

// Imperative ref-like helper for callers that need to read the *current*
// editor contents before the next blur fires (e.g. clicking Save).
export function flushRichTextEditor(container: HTMLElement | null): string | null {
  if (!container) return null
  const ce = container.querySelector('[contenteditable="true"]') as HTMLElement | null
  return ce ? ce.innerHTML : null
}
