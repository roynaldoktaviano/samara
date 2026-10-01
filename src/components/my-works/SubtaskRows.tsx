'use client'

import { useState } from 'react'
import { CalendarDays, Flag, Trash2, CornerDownLeft, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PRIORITIES, PRIORITY_META, fmtDay, todayKey, newSubtaskId, type Subtask, type Priority, type Todo } from './shared'
import { SubtaskCheck } from './SubtasksField'

// ClickUp-style sub task rows for the List view: one table row per sub task (aligned to the
// parent table's 7 columns) plus an inline "create" row. Every change is saved immediately
// through `onChange` with the task's full new sub task array.

function DatePick({ value, onChange, compact }: { value: string | null; onChange: (v: string | null) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const overdue = !!value && value < todayKey()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Due date"
          className={compact
            ? `h-8 min-w-8 px-2 flex items-center justify-center gap-1 rounded-md border text-xs hover:bg-muted ${value ? 'text-foreground' : 'text-muted-foreground'}`
            : `text-sm rounded px-1 -mx-1 hover:bg-muted ${value ? (overdue ? 'text-red-600 font-medium' : '') : 'text-muted-foreground'}`}>
          {compact && <CalendarDays className="h-4 w-4" />}
          {value ? fmtDay(value) : compact ? null : '-'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2 p-3">
        <input type="date" autoFocus className="w-full h-9 border rounded-lg px-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={value ?? ''} onChange={e => { onChange(e.target.value || null); setOpen(false) }} />
        {value && <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="text-xs text-muted-foreground hover:text-foreground underline">Clear date</button>}
      </PopoverContent>
    </Popover>
  )
}

export function PriorityPick({ value, onChange, compact, required }: { value: Priority | null; onChange: (v: Priority | null) => void; compact?: boolean; required?: boolean }) {
  const [open, setOpen] = useState(false)
  const meta = value ? PRIORITY_META[value] : null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Priority"
          className={compact
            ? `h-8 min-w-8 px-2 flex items-center justify-center gap-1 rounded-md border text-xs hover:bg-muted ${meta ? '' : 'text-muted-foreground'}`
            : 'rounded hover:bg-muted p-0.5 -m-0.5'}>
          {meta
            ? <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium ${meta.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
            : <Flag className="h-4 w-4 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {PRIORITIES.map(p => (
          <button key={p.key} type="button" onClick={() => { onChange(p.key); setOpen(false) }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted ${value === p.key ? 'font-semibold' : ''}`}>
            <span className={`h-2 w-2 rounded-full ${p.dot}`} />{p.label}
          </button>
        ))}
        {value && !required && (
          <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function SubtaskRow({ sub, onUpdate, onDelete }: {
  sub: Subtask; onUpdate: (patch: Partial<Subtask>) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(sub.title)
  function commit() {
    setEditing(false)
    const t = title.trim()
    if (t && t !== sub.title) onUpdate({ title: t })
    else setTitle(sub.title)
  }
  return (
    <tr className="border-b bg-muted/10 hover:bg-muted/30 transition-colors group">
      <td />
      <td className="pl-9 pr-3 py-2">
        <div className="flex items-center gap-2">
          <SubtaskCheck done={sub.done} onToggle={() => onUpdate({ done: !sub.done })} />
          {editing ? (
            <input autoFocus className="flex-1 min-w-0 h-7 border rounded px-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              value={title} onChange={e => setTitle(e.target.value)} onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setTitle(sub.title); setEditing(false) } }} />
          ) : (
            <button onClick={() => { setTitle(sub.title); setEditing(true) }} title="Rename"
              className={`text-left text-sm break-words hover:text-amber-700 ${sub.done ? 'line-through text-muted-foreground' : ''}`}>{sub.title}</button>
          )}
        </div>
      </td>
      <td className="border-l" />
      <td className="px-3 py-2 border-l whitespace-nowrap">
        <DatePick value={sub.dueDate} onChange={dueDate => onUpdate({ dueDate })} />
      </td>
      <td className="border-l" />
      <td className="px-3 py-2 border-l"><PriorityPick value={sub.priority} onChange={priority => onUpdate({ priority })} /></td>
      <td className="px-2 py-2 border-l text-center">
        <button onClick={onDelete} title="Delete sub task" className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

export function SubtaskCreateRow({ onCreate, onCancel }: { onCreate: (sub: Subtask) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority | null>(null)
  // Stays open after saving so several sub tasks can be typed in a row.
  function save() {
    const t = title.trim()
    if (!t) return
    onCreate({ id: newSubtaskId(), title: t, done: false, dueDate, priority })
    setTitle(''); setDueDate(null); setPriority(null)
  }
  return (
    <tr className="border-b bg-background">
      <td />
      <td colSpan={6} className="pl-9 pr-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-muted-foreground/50" />
          <input autoFocus className="flex-1 min-w-0 h-8 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            placeholder="Sub task name" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') onCancel() }} />
          <DatePick value={dueDate} onChange={setDueDate} compact />
          <PriorityPick value={priority} onChange={setPriority} compact />
          <button type="button" onClick={onCancel} className="h-8 px-3 text-sm border rounded-md hover:bg-muted">Cancel</button>
          <button type="button" onClick={save} disabled={!title.trim()}
            className="h-8 px-3 flex items-center gap-1.5 text-sm font-semibold text-white rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50">
            Save<CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export const subtaskOps = (t: Todo, onSubtasks: (t: Todo, subs: Subtask[]) => void) => {
  const subs = t.subtasks ?? []
  return {
    update: (id: string, patch: Partial<Subtask>) => onSubtasks(t, subs.map(s => s.id === id ? { ...s, ...patch } : s)),
    remove: (id: string) => onSubtasks(t, subs.filter(s => s.id !== id)),
    add: (sub: Subtask) => onSubtasks(t, [...subs, sub]),
  }
}
