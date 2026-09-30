'use client'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'

export interface Attachment { url: string; name: string; size: number; contentType: string; uploadedAt: string }

export interface Todo {
  id: string
  title: string
  notes: string | null
  type: string | null
  startDate: string | null
  dueDate: string | null
  priority: Priority
  status: Status
  sortOrder: number
  attachments: Attachment[]
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
