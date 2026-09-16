// Lightweight WordPress-classic-editor-style rich text editor — no external dependency,
// built on contentEditable + document.execCommand. Good enough for this mockup's "type and
// format" use case; not meant to survive hostile paste input (this is an internal admin tool).
'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Link2, Unlink, Eraser, Undo2, Redo2, IndentIncrease, IndentDecrease,
} from 'lucide-react'

type Mark = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull' | 'insertUnorderedList' | 'insertOrderedList'

const TRACKED_MARKS: Mark[] = [
  'bold', 'italic', 'underline', 'strikeThrough',
  'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
  'insertUnorderedList', 'insertOrderedList',
]

export function isLikelyHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s)
}

// Plain-text one-liner for previews/truncated rows — strips tags whether content is HTML
// (from this editor) or the older plain-text **bold** convention (no tags, passes through).
export function stripHtmlToText(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Best-effort upgrade path for old plain-text content (blank-line-separated paragraphs, a
// lightweight **bold** convention) so opening the rich editor on it looks reasonable instead
// of one run-on line of text.
function plainTextToHtml(raw: string): string {
  const paragraphs = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  return paragraphs
    .map(p => `<p>${escapeHtml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// Legal/clause-style nested numbering (1., 1.1., 1.1.1., ...) instead of the browser's default
// nested-list markers (1, 2, 3 → a, b, c → i, ii, iii). Every <ol>, at any nesting depth, resets
// its own counter and the ::before marker joins every ancestor level's counter with ".", so
// pressing Tab to indent an item under "4." numbers it "4.1." automatically.
export const CLAUSE_LIST_STYLES = `
  .rte-editable ol { counter-reset: rte-clause; list-style: none; margin: 0 0 8px; padding-left: 1.4em; }
  .rte-editable ol > li { counter-increment: rte-clause; position: relative; margin-bottom: 4px; }
  .rte-editable ol > li::before { content: counters(rte-clause, ".") "."; position: absolute; left: -1.4em; font-weight: 600; }
`

const HEADING_OPTIONS = [
  { value: 'P', label: 'Paragraph' },
  { value: 'H1', label: 'Heading 1' },
  { value: 'H2', label: 'Heading 2' },
  { value: 'H3', label: 'Heading 3' },
]

// The document's base font — matches the print/PDF preview chrome (pdfPreview.ts) so what you
// type here is what the generated document actually looks like.
export const DEFAULT_FONT = "'Times New Roman', Times, serif"

const FONT_OPTIONS = [
  { value: '', label: 'Default (Times New Roman)' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Courier New', label: 'Courier New' },
]

const FONT_SIZE_OPTIONS = [
  { value: '2', label: 'Small' },
  { value: '3', label: 'Normal' },
  { value: '4', label: 'Medium' },
  { value: '5', label: 'Large' },
  { value: '6', label: 'X-Large' },
  { value: '7', label: 'XX-Large' },
]

function ToolbarButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      // mousedown+preventDefault so the editor selection isn't lost before the command runs
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${active ? 'bg-[#bdac7e] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ initialHtml, onChange, minHeightClass = 'min-h-[220px]' }: {
  initialHtml: string
  onChange: (html: string) => void
  minHeightClass?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [heading, setHeading] = useState('P')
  const [font, setFont] = useState('')
  const [fontSize, setFontSize] = useState('3')

  // Uncontrolled by design: seeded once on mount so typing never fights a React re-render.
  useEffect(() => {
    if (!ref.current) return
    if (!initialHtml) ref.current.innerHTML = '<p><br></p>'
    else ref.current.innerHTML = isLikelyHtml(initialHtml) ? initialHtml : plainTextToHtml(initialHtml)
    // Seeded once on mount only — intentionally not reacting to initialHtml changes.
  }, [])

  function syncToolbarState() {
    const next = new Set<string>()
    for (const mark of TRACKED_MARKS) {
      try { if (document.queryCommandState(mark)) next.add(mark) } catch { /* unsupported in this browser */ }
    }
    setActive(next)
    try {
      const block = document.queryCommandValue('formatBlock').toUpperCase()
      setHeading(['H1', 'H2', 'H3'].includes(block) ? block : 'P')
    } catch { /* unsupported */ }
    try {
      const name = document.queryCommandValue('fontName').replace(/^["']|["']$/g, '')
      setFont(FONT_OPTIONS.some(f => f.value === name) ? name : '')
    } catch { /* unsupported */ }
    try {
      const size = document.queryCommandValue('fontSize')
      setFontSize(FONT_SIZE_OPTIONS.some(f => f.value === size) ? size : '3')
    } catch { /* unsupported */ }
  }

  function emitChange() {
    onChange(ref.current?.innerHTML ?? '')
  }

  function exec(command: string, value?: string) {
    ref.current?.focus()
    document.execCommand(command, false, value)
    syncToolbarState()
    emitChange()
  }

  function handleHeadingChange(value: string) {
    exec('formatBlock', value === 'P' ? '<p>' : `<${value}>`)
  }

  // "Default" re-inherits the editor's base font (set via DEFAULT_FONT below) instead of
  // leaving stale <font> tags around.
  function handleFontChange(value: string) {
    exec('fontName', value || 'inherit')
  }

  function handleFontSizeChange(value: string) {
    exec('fontSize', value)
  }

  function handleLink() {
    const url = window.prompt('URL:')
    if (url) exec('createLink', url)
  }

  // Tab inside a list item nests it under the previous item (4 → 4.1); Shift+Tab un-nests it.
  // Outside a list, Tab is left alone (default browser focus behavior).
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const anchor = window.getSelection()?.anchorNode
    const el = anchor instanceof Element ? anchor : anchor?.parentElement
    if (!el?.closest('li')) return
    e.preventDefault()
    exec(e.shiftKey ? 'outdent' : 'indent')
  }

  return (
    <div className="border rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-[#bdac7e]/50 focus-within:border-[#bdac7e] transition">
      <style>{CLAUSE_LIST_STYLES}</style>
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-muted/40">
        <ToolbarButton title="Undo" onClick={() => exec('undo')}><Undo2 className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => exec('redo')}><Redo2 className="h-3.5 w-3.5" /></ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <select
          value={heading}
          onChange={e => handleHeadingChange(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          className="h-7 text-xs border rounded-md bg-background px-1.5 mr-1 outline-none focus:ring-1 focus:ring-[#bdac7e]/50"
        >
          {HEADING_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <div className="w-px h-5 bg-border mx-1" />

        <select
          title="Font family"
          value={font}
          onChange={e => handleFontChange(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          className="h-7 text-xs border rounded-md bg-background px-1.5 mr-1 outline-none focus:ring-1 focus:ring-[#bdac7e]/50 max-w-[150px]"
        >
          {FONT_OPTIONS.map(opt => <option key={opt.label} value={opt.value} style={{ fontFamily: opt.value || DEFAULT_FONT }}>{opt.label}</option>)}
        </select>

        <select
          title="Font size"
          value={fontSize}
          onChange={e => handleFontSizeChange(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          className="h-7 text-xs border rounded-md bg-background px-1.5 mr-1 outline-none focus:ring-1 focus:ring-[#bdac7e]/50"
        >
          {FONT_SIZE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton title="Bold" active={active.has('bold')} onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Italic" active={active.has('italic')} onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Underline" active={active.has('underline')} onClick={() => exec('underline')}><Underline className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Strikethrough" active={active.has('strikeThrough')} onClick={() => exec('strikeThrough')}><Strikethrough className="h-3.5 w-3.5" /></ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton title="Align left" active={active.has('justifyLeft')} onClick={() => exec('justifyLeft')}><AlignLeft className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Align center" active={active.has('justifyCenter')} onClick={() => exec('justifyCenter')}><AlignCenter className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Align right" active={active.has('justifyRight')} onClick={() => exec('justifyRight')}><AlignRight className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Justify" active={active.has('justifyFull')} onClick={() => exec('justifyFull')}><AlignJustify className="h-3.5 w-3.5" /></ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton title="Bullet list" active={active.has('insertUnorderedList')} onClick={() => exec('insertUnorderedList')}><List className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Numbered clauses (1, 2, 3, ...)" active={active.has('insertOrderedList')} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Nest under the previous clause (4 becomes 4.1) — same as Tab" onClick={() => exec('indent')}><IndentIncrease className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Promote back up a level (1.2 becomes 2) — same as Shift+Tab" onClick={() => exec('outdent')}><IndentDecrease className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Quote" onClick={() => exec('formatBlock', '<blockquote>')}><Quote className="h-3.5 w-3.5" /></ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton title="Insert link" onClick={handleLink}><Link2 className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Remove link" onClick={() => exec('unlink')}><Unlink className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton title="Clear formatting" onClick={() => exec('removeFormat')}><Eraser className="h-3.5 w-3.5" /></ToolbarButton>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        onKeyUp={syncToolbarState}
        onMouseUp={syncToolbarState}
        onKeyDown={handleKeyDown}
        style={{ fontFamily: DEFAULT_FONT }}
        className={`rte-editable w-full ${minHeightClass} max-h-[420px] overflow-y-auto px-3 py-2.5 text-sm bg-background outline-none
          [&_p]:mb-2 [&_p:last-child]:mb-0
          [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-1
          [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-1
          [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-1
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
          [&_ul_li]:mb-0.5
          [&_blockquote]:border-l-2 [&_blockquote]:border-[#bdac7e] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-2
          [&_a]:text-[#bdac7e] [&_a]:underline`}
      />
    </div>
  )
}
