'use client'

import { createContext, useContext } from 'react'
import { ListChecks } from 'lucide-react'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'

export interface Attachment { url: string; name: string; size: number; contentType: string; uploadedAt: string }

export interface Subtask {
  id: string; title: string; done: boolean; notes: string | null; type: string | null
  startDate: string | null; dueDate: string | null; priority: Priority | null
  // Nested sub tasks; missing on rows saved before nesting existed.
  children?: Subtask[]
  assigneeIds?: string[]
}

export interface Todo {
  id: string
  // Owner. Tasks owned by someone else are on this board because they're assigned to me.
  userId: string
  title: string
  notes: string | null
  type: string | null
  startDate: string | null
  dueDate: string | null
  priority: Priority
  status: Status
  sortOrder: number
  attachments: Attachment[]
  subtasks: Subtask[]
  assigneeIds: string[]
  subAssigneeIds: string[]
  // Owner's name, for the "from …" label on tasks assigned to me.
  user?: { id: string; name: string | null; email: string }
  completedAt: string | null
  createdAt: string
}

export const STATUSES: { key: Status; label: string; bar: string; dot: string; soft: string }[] = [
  { key: 'TODO',        label: 'To-do',       bar: 'bg-slate-400',   dot: 'bg-slate-400',   soft: 'bg-slate-100 text-slate-700' },
  { key: 'IN_PROGRESS', label: 'On Progress', bar: 'bg-blue-500',    dot: 'bg-blue-500',    soft: 'bg-blue-50 text-blue-700' },
  { key: 'IN_REVIEW',   label: 'In Review',   bar: 'bg-orange-400',  dot: 'bg-orange-400',  soft: 'bg-orange-50 text-orange-700' },
  { key: 'DONE',        label: 'Done',        bar: 'bg-emerald-500', dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700' },
]
export const STATUS_META = Object.fromEntries(STATUSES.map(s => [s.key, s])) as Record<Status, typeof STATUSES[number]>

export const PRIORITIES: { key: Priority; label: string; cls: string; dot: string }[] = [
  { key: 'HIGH',   label: 'High',   cls: 'bg-red-50 text-red-600 border-red-200',       dot: 'bg-red-500' },
  { key: 'MEDIUM', label: 'Medium', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  { key: 'LOW',    label: 'Low',    cls: 'bg-sky-50 text-sky-600 border-sky-200',       dot: 'bg-sky-500' },
]
export const PRIORITY_META = Object.fromEntries(PRIORITIES.map(p => [p.key, p])) as Record<Priority, typeof PRIORITIES[number]>

// Dates are saved as plain dates (midnight UTC from <input type="date">), so everything
// compares/renders off the YYYY-MM-DD part to avoid shifting a day across timezones.
export const dayKey = (s: string) => s.slice(0, 10)
export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const fmtDay = (s: string) =>
  new Date(dayKey(s) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function fmtRange(t: Pick<Todo, 'startDate' | 'dueDate'>): string | null {
  if (t.startDate && t.dueDate) return dayKey(t.startDate) === dayKey(t.dueDate) ? fmtDay(t.dueDate) : `${fmtDay(t.startDate)} - ${fmtDay(t.dueDate)}`
  if (t.dueDate) return `Due ${fmtDay(t.dueDate)}`
  if (t.startDate) return `From ${fmtDay(t.startDate)}`
  return null
}

export const isOverdue = (t: Todo, today = todayKey()) => t.status !== 'DONE' && !!t.dueDate && dayKey(t.dueDate) < today

const TYPE_PALETTE = [
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-orange-50 text-orange-700 border-orange-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-pink-50 text-pink-700 border-pink-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-lime-50 text-lime-700 border-lime-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
]
export function typeClass(type: string) {
  let h = 0
  for (const c of type.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TYPE_PALETTE[h % TYPE_PALETTE.length]
}

export function TypeTag({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">-</span>
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${typeClass(type)}`}>{type}</span>
}

export function PriorityTag({ priority }: { priority: Priority }) {
  const p = PRIORITY_META[priority]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${p.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />{p.label}
    </span>
  )
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── People / board mode ─────────────────────────────────────────────────────

export interface WorkUser { id: string; name: string | null; email: string }

interface WorksCtx { meId: string; users: WorkUser[]; byId: Map<string, WorkUser> }
export const WorksContext = createContext<WorksCtx>({ meId: '', users: [], byId: new Map() })
export const useWorks = () => useContext(WorksContext)

// The board mixes my own tasks (full edit) with tasks other people assigned to me, where I may
// only update progress: status + files when I'm on the task, ticks on sub tasks I'm on.
export const isOwnTask = (t: Todo, meId: string) => t.userId === meId

/** Can the viewer change this task's status/files? */
export const canProgressTask = (t: Todo, meId: string) => isOwnTask(t, meId) || (t.assigneeIds ?? []).includes(meId)

/** Can the viewer tick this sub task? `inherited` = they own/are on the task or an ancestor sub task. */
export const canTickSub = (s: Subtask, inherited: boolean, meId: string) => inherited || (s.assigneeIds ?? []).includes(meId)

export const userLabel = (u: WorkUser | undefined) => u ? (u.name || u.email) : 'Unknown user'
const initials = (u: WorkUser | undefined) => userLabel(u).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
const AVATAR_COLORS = ['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500']
const avatarColor = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length] }

export function Avatar({ user, id, size = 24 }: { user: WorkUser | undefined; id: string; size?: number }) {
  return (
    <span title={userLabel(user)} style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold ring-2 ring-background shrink-0 ${avatarColor(id)}`}>
      {initials(user)}
    </span>
  )
}

export function AvatarStack({ ids, size = 24, max = 3 }: { ids: string[]; size?: number; max?: number }) {
  const { byId } = useWorks()
  if (!ids.length) return null
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {ids.slice(0, max).map(id => <Avatar key={id} id={id} user={byId.get(id)} size={size} />)}
      {ids.length > max && (
        <span style={{ width: size, height: size, fontSize: size * 0.4 }} title={ids.slice(max).map(i => userLabel(byId.get(i))).join(', ')}
          className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold ring-2 ring-background">+{ids.length - max}</span>
      )}
    </span>
  )
}

export const newSubtaskId = () => Math.random().toString(36).slice(2, 12)

// Levels of sub tasks allowed under a task (sub → sub-sub → sub-sub-sub). Mirrors TODO_SUBTASK_MAX_DEPTH.
export const MAX_SUBTASK_DEPTH = 3

/** Every sub task in the tree, depth-first. */
export const flattenSubtasks = (subs: Subtask[] | undefined): Subtask[] =>
  (subs ?? []).flatMap(s => [s, ...flattenSubtasks(s.children)])

/** Every sub task with its nesting level (1 = direct child of the task), depth-first. */
export const flattenWithDepth = (subs: Subtask[] | undefined, depth = 1): { sub: Subtask; depth: number }[] =>
  (subs ?? []).flatMap(s => [{ sub: s, depth }, ...flattenWithDepth(s.children, depth + 1)])

export const isSubOverdue = (s: Subtask, today = todayKey()) => !s.done && !!s.dueDate && s.dueDate < today

export const mapSubtaskTree = (subs: Subtask[], id: string, fn: (s: Subtask) => Subtask | null): Subtask[] =>
  subs.flatMap(s => {
    if (s.id === id) { const r = fn(s); return r ? [r] : [] }
    return [s.children?.length ? { ...s, children: mapSubtaskTree(s.children, id, fn) } : s]
  })

/** "2/5" checklist counter; renders nothing when the task has no sub tasks. */
export function SubtaskCount({ subtasks, className = '' }: { subtasks: Subtask[] | undefined; className?: string }) {
  const flat = flattenSubtasks(subtasks)
  if (!flat.length) return null
  const done = flat.filter(s => s.done).length
  const all = done === flat.length
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${all ? 'text-emerald-600' : 'text-muted-foreground'} ${className}`}
      title={`${done} of ${flat.length} sub tasks done`}>
      <ListChecks className="h-3 w-3" />{done}/{flat.length}
    </span>
  )
}
