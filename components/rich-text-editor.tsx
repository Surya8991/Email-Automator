'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Pencil, Code, Bold, Italic, List, Link as LinkIcon } from 'lucide-react'

/**
 * Shared rich-text editor. Edit modes:
 *   - "rich" — contentEditable div + toolbar (Bold / Italic / List / Link)
 *   - "html" — raw <textarea> for paste/edit of markup
 *
 * Exposes an imperative handle ({ insert }) so parent forms can push
 * tokens ({{variable}} or raw HTML snippets) at the cursor without
 * needing direct access to the DOM node.
 */
export interface RichTextEditorProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  className?: string
  startMode?: 'rich' | 'html'
  disableToggle?: boolean
}

export interface RichTextEditorHandle {
  /** Insert a token / snippet at the current cursor position. */
  insert: (token: string) => void
  /** Current editing mode. */
  getMode: () => 'rich' | 'html'
}

function exec(cmd: string, value?: string) {
  try { document.execCommand(cmd, false, value) } catch { /* old Safari */ }
}

function ToolbarBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditorInner(
    { value, onChange, placeholder, rows = 12, className, startMode = 'rich', disableToggle = false },
    ref,
  ) {
    const richRef = useRef<HTMLDivElement | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const [mode, setMode] = useState<'rich' | 'html'>(startMode)

    useEffect(() => {
      if (mode !== 'rich') return
      const el = richRef.current
      if (!el) return
      if (el.innerHTML !== value) el.innerHTML = value
    }, [value, mode])

    useImperativeHandle(ref, () => ({
      getMode: () => mode,
      insert(token: string) {
        if (mode === 'rich' && richRef.current) {
          richRef.current.focus()
          exec('insertHTML', token)
          onChange(richRef.current.innerHTML)
        } else if (mode === 'html' && textareaRef.current) {
          const el = textareaRef.current
          const s = el.selectionStart ?? el.value.length
          const e = el.selectionEnd ?? el.value.length
          const next = el.value.slice(0, s) + token + el.value.slice(e)
          onChange(next)
          requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(s + token.length, s + token.length)
          })
        }
      },
    }), [mode, onChange])

    return (
      <div className={className ?? 'space-y-2'}>
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
          {!disableToggle && (
            <div className="inline-flex overflow-hidden rounded-md border bg-background text-xs">
              <button type="button"
                className={`px-2 py-1 ${mode === 'rich' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
                onClick={() => setMode('rich')}>
                <Pencil className="mr-1 inline h-3 w-3" /> Rich
              </button>
              <button type="button"
                className={`border-l px-2 py-1 ${mode === 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
                onClick={() => {
                  if (richRef.current) onChange(richRef.current.innerHTML)
                  setMode('html')
                }}>
                <Code className="mr-1 inline h-3 w-3" /> HTML
              </button>
            </div>
          )}
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
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder={placeholder ?? 'HTML body'}
          />
        )}
      </div>
    )
  },
)
