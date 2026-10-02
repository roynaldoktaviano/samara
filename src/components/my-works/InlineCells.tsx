'use client'

import { useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dayKey, fmtRange, TypeTag } from './shared'

// Click-to-edit table cells for the List view. Each one commits on blur / Enter and
// reverts on Escape; the parent saves through a partial PATCH.

const cellBtn = 'w-full text-left rounded px-1.5 py-1 -mx-1.5 -my-1 hover:bg-muted/70 cursor-text min-h-7'
const editCls = 'w-full border rounded-md px-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500'

// `readOnly` (a task assigned to me by someone else) renders the plain value with no editor.
export function TextCell({ value, onSave, multiline, required, placeholder = '-', className = '', datalist, readOnly }: {
  value: string | null; onSave: (v: string) => void; multiline?: boolean; required?: boolean
  placeholder?: string; className?: string; datalist?: string; readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Escape unmounts the input, which can still fire onBlur — this stops that blur saving.
  const cancelled = useRef(false)
  const start = () => { cancelled.current = false; setDraft(value ?? ''); setEditing(true) }
  function commit() {
    setEditing(false)
    if (cancelled.current) return
    const v = draft.trim()
    if (required && !v) return
    if (v !== (value ?? '')) onSave(v)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { cancelled.current = true; setEditing(false) }
    // Shift+Enter keeps a newline in the description.
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); (e.target as HTMLElement).blur() } // commits via onBlur
  }

  if (readOnly) return <span className={`block ${className}`}>{value || <span className="text-muted-foreground">{placeholder}</span>}</span>
  if (editing) return multiline
    ? <textarea autoFocus rows={3} className={`${editCls} py-1.5 resize-y`} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} />
    : <input autoFocus list={datalist} className={`${editCls} h-8`} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} />

  return (
    <button type="button" onClick={start} className={`${cellBtn} ${className}`}>
      {value || <span className="text-muted-foreground">{placeholder}</span>}
    </button>
  )
}

export function TypeCell({ value, onSave, datalist, readOnly }: { value: string | null; onSave: (v: string) => void; datalist: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false)
  if (readOnly) return <TypeTag type={value} />
  if (editing) return <TypeInput value={value} datalist={datalist} onDone={v => { setEditing(false); if (v !== null && v !== (value ?? '')) onSave(v) }} />
  return <button type="button" onClick={() => setEditing(true)} className={cellBtn}><TypeTag type={value} /></button>
}

function TypeInput({ value, datalist, onDone }: { value: string | null; datalist: string; onDone: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  const done = useRef(false)
  const finish = (v: string | null) => { if (!done.current) { done.current = true; onDone(v) } }
  return (
    <input autoFocus list={datalist} className={`${editCls} h-8`} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => finish(draft.trim())}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') finish(null) }} />
  )
}

export function RangeCell({ startDate, dueDate, overdue, onSave, readOnly }: {
  startDate: string | null; dueDate: string | null; overdue: boolean
  onSave: (startDate: string | null, dueDate: string | null) => void; readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const range = fmtRange({ startDate, dueDate })

  function onOpenChange(o: boolean) {
    if (o) { setStart(startDate ? dayKey(startDate) : ''); setEnd(dueDate ? dayKey(dueDate) : ''); setError('') }
    setOpen(o)
  }
  function apply(s = start, e = end) {
    if (s && e && e < s) { setError('End date must be on or after the start date'); return }
    if (s !== (startDate ? dayKey(startDate) : '') || e !== (dueDate ? dayKey(dueDate) : '')) onSave(s || null, e || null)
    setOpen(false)
  }

  if (readOnly) return <span className={`whitespace-nowrap ${overdue ? 'text-red-600 font-medium' : ''}`}>{range ?? <span className="text-muted-foreground">-</span>}</span>
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={`${cellBtn} whitespace-nowrap ${overdue ? 'text-red-600 font-medium' : ''}`}>
          {range ?? <span className="text-muted-foreground">-</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</label>
          <input type="date" className={`${editCls} h-9`} value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</label>
          <input type="date" className={`${editCls} h-9`} min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          {(startDate || dueDate) && <button type="button" onClick={() => apply('', '')} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>}
          <button type="button" onClick={() => apply()} className="ml-auto h-8 px-3 text-sm font-semibold text-white rounded-md bg-amber-600 hover:bg-amber-700">Apply</button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
