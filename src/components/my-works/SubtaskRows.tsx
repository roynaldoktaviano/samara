'use client'

import { Fragment, useState } from 'react'
import { CalendarDays, Flag, Trash2, CornerDownLeft, X, ChevronDown, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PRIORITIES, PRIORITY_META, fmtDay, todayKey, newSubtaskId, MAX_SUBTASK_DEPTH, flattenSubtasks, mapSubtaskTree, SubtaskCount, useWorks, canTickSub, type Subtask, type Priority, type Todo } from './shared'
import AssigneePicker from './AssigneePicker'
import { SubtaskCheck } from './SubtasksField'
import { TextCell, TypeCell, RangeCell } from './InlineCells'

// ClickUp-style sub task rows for the List view: one table row per sub task (aligned to the
// parent table's 8 columns) plus an inline "create" row. Every change is saved immediately
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

export function PriorityPick({ value, onChange, compact, required, readOnly }: { value: Priority | null; onChange: (v: Priority | null) => void; compact?: boolean; required?: boolean; readOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const meta = value ? PRIORITY_META[value] : null
  if (readOnly) return meta
    ? <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium ${meta.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
    : <span className="text-muted-foreground text-sm">-</span>
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

// Left padding of the name cell per nesting level (level 1 = direct sub task of the task).
const indent = (depth: number) => ({ paddingLeft: `${12 + depth * 24}px` })

export interface SubtaskTreeState {
  expanded: Set<string>
  toggleExpand: (id: string) => void
  // Parent id (task or sub task) currently showing the inline "new sub task" row.
  creatingFor: string | null
  startCreate: (parentId: string) => void
  cancelCreate: () => void
  typesList: string
}

/** Renders `subs` (one nesting level) and, recursively, their open children. */
/**
 * Renders `subs` (one nesting level) and, recursively, their open children. `inherited` = the
 * viewer is assigned to the task or an ancestor sub task, so they may tick everything below it.
 */
export function SubtaskTree({ subs, depth, parentId, ops, state, inherited, readOnly }: {
  subs: Subtask[]; depth: number; parentId: string; ops: ReturnType<typeof subtaskOps>; state: SubtaskTreeState; inherited: boolean
  // Task belongs to someone else (assigned to me) — only ticks allowed.
  readOnly: boolean
}) {
  const { meId } = useWorks()
  return (
    <>
      {subs.map(st => {
        const kids = st.children ?? []
        const open = state.expanded.has(st.id)
        const canTick = canTickSub(st, inherited, meId)
        return (
          <Fragment key={st.id}>
            <SubtaskRow sub={st} depth={depth} open={open} state={state} canTick={canTick} ro={readOnly}
              onUpdate={patch => ops.update(st.id, patch)} onDelete={() => ops.remove(st.id)} />
            {open && kids.length > 0 && <SubtaskTree subs={kids} depth={depth + 1} parentId={st.id} ops={ops} state={state} inherited={canTick} readOnly={readOnly} />}
          </Fragment>
        )
      })}
      {!readOnly && state.creatingFor === parentId && (
        <SubtaskCreateRow depth={depth} onCreate={sub => ops.add(parentId, sub)} onCancel={state.cancelCreate} />
      )}
    </>
  )
}

function SubtaskRow({ sub, depth, open, state, canTick, ro, onUpdate, onDelete }: {
  sub: Subtask; depth: number; open: boolean; state: SubtaskTreeState; canTick: boolean; ro: boolean
  onUpdate: (patch: Partial<Subtask>) => void; onDelete: () => void
}) {
  const { meId } = useWorks()
  const overdue = !sub.done && !!sub.dueDate && sub.dueDate < todayKey()
  const kids = sub.children ?? []
  const canNest = !ro && depth < MAX_SUBTASK_DEPTH
  const mine = (sub.assigneeIds ?? []).includes(meId)
  return (
    <tr className={`border-b hover:bg-muted/30 transition-colors group ${ro && mine ? 'bg-amber-50/50' : 'bg-muted/10'}`}>
      <td />
      <td className="pr-3 py-2" style={indent(depth)}>
        <div className="flex items-center gap-1.5">
          {kids.length > 0 ? (
            <button onClick={() => state.toggleExpand(sub.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0" title={open ? 'Hide sub tasks' : 'Show sub tasks'}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
            </button>
          ) : <span className="w-[18px] shrink-0" />}
          {canTick
            ? <SubtaskCheck done={sub.done} onToggle={() => onUpdate({ done: !sub.done })} />
            : <span title="Not assigned to you" className={`h-4 w-4 shrink-0 rounded border opacity-40 ${sub.done ? 'bg-emerald-600 border-emerald-600' : 'border-muted-foreground/40'}`} />}
          <div className="flex-1 min-w-0">
            <TextCell value={sub.title} required readOnly={ro} onSave={title => onUpdate({ title })}
              className={`text-sm break-words ${sub.done ? 'line-through text-muted-foreground' : ''}`} />
          </div>
          {kids.length > 0 && <button onClick={() => state.toggleExpand(sub.id)} className="shrink-0"><SubtaskCount subtasks={kids} /></button>}
          {canNest && (
            <button onClick={() => state.startCreate(sub.id)} title="Create sub task"
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 border-l text-muted-foreground">
        <TextCell value={sub.notes} multiline readOnly={ro} onSave={notes => onUpdate({ notes: notes || null })} className="line-clamp-2 break-words whitespace-pre-line" />
      </td>
      <td className="px-3 py-2 border-l"><AssigneePicker value={sub.assigneeIds ?? []} readOnly={ro} size={22} onChange={assigneeIds => onUpdate({ assigneeIds })} /></td>
      <td className="px-3 py-2 border-l">
        <RangeCell startDate={sub.startDate} dueDate={sub.dueDate} overdue={overdue} readOnly={ro && !canTick} onSave={(startDate, dueDate) => onUpdate({ startDate, dueDate })} />
      </td>
      <td className="px-3 py-2 border-l"><TypeCell value={sub.type} datalist={state.typesList} readOnly={ro} onSave={type => onUpdate({ type: type || null })} /></td>
      <td className="px-3 py-2 border-l"><PriorityPick value={sub.priority} readOnly={ro} onChange={priority => onUpdate({ priority })} /></td>
      <td className="px-2 py-2 border-l text-center">
        {!ro && (
          <button onClick={() => { if (!kids.length || confirm(`Delete "${sub.title}" and its ${flattenSubtasks(kids).length} sub task(s)?`)) onDelete() }}
            title="Delete sub task" className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}

function SubtaskCreateRow({ depth, onCreate, onCancel }: { depth: number; onCreate: (sub: Subtask) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority | null>(null)
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  // Stays open after saving so several sub tasks can be typed in a row.
  function save() {
    const t = title.trim()
    if (!t) return
    onCreate({ id: newSubtaskId(), title: t, done: false, notes: null, type: null, startDate: null, dueDate, priority, children: [], assigneeIds })
    setTitle(''); setDueDate(null); setPriority(null); setAssigneeIds([])
  }
  return (
    <tr className="border-b bg-background">
      <td />
      <td colSpan={7} className="pr-3 py-2" style={indent(depth)}>
        <div className="flex items-center gap-2">
          <span className="w-[18px] shrink-0" />
          <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-muted-foreground/50" />
          <input autoFocus className="flex-1 min-w-0 h-8 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            placeholder={depth > 1 ? `Level ${depth} sub task name` : 'Sub task name'} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') onCancel() }} />
          <AssigneePicker value={assigneeIds} onChange={setAssigneeIds} compact size={20} />
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

/** Tree edits for one task; each returns the task's full new sub task array via `onSubtasks`. */
export const subtaskOps = (t: Todo, onSubtasks: (t: Todo, subs: Subtask[]) => void) => {
  const subs = t.subtasks ?? []
  return {
    update: (id: string, patch: Partial<Subtask>) => onSubtasks(t, mapSubtaskTree(subs, id, s => ({ ...s, ...patch }))),
    remove: (id: string) => onSubtasks(t, mapSubtaskTree(subs, id, () => null)),
    // parentId = the task's own id for a level-1 sub task, otherwise the parent sub task's id.
    add: (parentId: string, sub: Subtask) => onSubtasks(t, parentId === t.id
      ? [...subs, sub]
      : mapSubtaskTree(subs, parentId, p => ({ ...p, children: [...(p.children ?? []), sub] }))),
  }
}
