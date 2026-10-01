'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, CornerDownRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { STATUS_META, PRIORITY_META, dayKey, todayKey, isOverdue, isSubOverdue, fmtRange, flattenWithDepth, mapSubtaskTree, type Todo, type Subtask, type Priority } from './shared'

const DAY_MS = 86400000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const LANE_H = 24
const toUtc = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const sundayOf = (ms: number) => ms - new Date(ms).getUTCDay() * DAY_MS

type Mode = 'month' | 'week'

interface Props {
  todos: Todo[]
  onEdit: (t: Todo) => void
  // Click on an empty spot of a day → new task on that date.
  onCreateOn: (day: string) => void
  // Drag a task onto another day → shift its whole range by the difference.
  onMove: (t: Todo, startDate: string | null, dueDate: string | null) => void
  // Sub task edits (drag to another day) save the task's whole sub task tree.
  onSubtasks: (t: Todo, subtasks: Subtask[]) => void
}

// One bar on the calendar: a task, or one of its (nested) sub tasks. Clicking a sub task opens its task.
interface Entry {
  id: string; todo: Todo; sub: Subtask | null
  title: string; startDate: string | null; dueDate: string | null
  priority: Priority | null; done: boolean; overdue: boolean
}

function entriesOf(todos: Todo[], today: string): Entry[] {
  return todos.flatMap(t => [
    { id: t.id, todo: t, sub: null, title: t.title, startDate: t.startDate, dueDate: t.dueDate, priority: t.priority, done: t.status === 'DONE', overdue: isOverdue(t, today) },
    ...flattenWithDepth(t.subtasks).map(({ sub }) => ({
      id: sub.id, todo: t, sub, title: sub.title, startDate: sub.startDate, dueDate: sub.dueDate,
      priority: sub.priority, done: sub.done, overdue: isSubOverdue(sub, today),
    })),
  ])
}

interface Placed { todo: Entry; startCol: number; endCol: number; lane: number; clipLeft: boolean; clipRight: boolean }

// Range a task occupies on the calendar: start..due, or a single day if only one is set.
function span(t: Pick<Entry, 'startDate' | 'dueDate'>): [number, number] | null {
  const s = t.startDate ?? t.dueDate, e = t.dueDate ?? t.startDate
  if (!s || !e) return null
  return [toUtc(dayKey(s)), toUtc(dayKey(e))]
}

export default function CalendarView({ todos, onEdit, onCreateOn, onMove, onSubtasks }: Props) {
  const today = todayKey()
  const todayMs = toUtc(today)
  const [mode, setMode] = useState<Mode>('month')
  const [cursor, setCursor] = useState(todayMs) // any day inside the visible month/week
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropDay, setDropDay] = useState<string | null>(null)

  const cur = new Date(cursor)
  const monthIdx = cur.getUTCMonth()
  const gridStart = mode === 'month' ? sundayOf(Date.UTC(cur.getUTCFullYear(), monthIdx, 1)) : sundayOf(cursor)
  const weekCount = mode === 'month'
    ? Math.ceil(((Date.UTC(cur.getUTCFullYear(), monthIdx + 1, 0) - gridStart) / DAY_MS + 1) / 7)
    : 1
  const maxLanes = mode === 'month' ? 3 : 12

  const entries = useMemo(() => entriesOf(todos, today), [todos, today])
  const scheduled = useMemo(() => entries.map(t => ({ t, s: span(t) })).filter((x): x is { t: Entry; s: [number, number] } => !!x.s)
    .sort((a, b) => a.s[0] - b.s[0] || (b.s[1] - b.s[0]) - (a.s[1] - a.s[0])), [entries])
  // Undated sub tasks aren't worth a warning — only count tasks.
  const unscheduled = todos.filter(t => !span(t)).length

  // Lay each week out independently: bars are clipped to the week and packed into the
  // lowest free lane so multi-day tasks never overlap.
  const weeks = useMemo(() => Array.from({ length: weekCount }, (_, w) => {
    const wStart = gridStart + w * 7 * DAY_MS, wEnd = wStart + 6 * DAY_MS
    const lanes: number[][] = [] // per lane: occupied columns
    const placed: Placed[] = []
    for (const { t, s } of scheduled) {
      if (s[1] < wStart || s[0] > wEnd) continue
      const startCol = Math.round((Math.max(s[0], wStart) - wStart) / DAY_MS)
      const endCol = Math.round((Math.min(s[1], wEnd) - wStart) / DAY_MS)
      let lane = lanes.findIndex(occ => occ.every(c => c < startCol || c > endCol))
      if (lane === -1) { lane = lanes.length; lanes.push([]) }
      for (let c = startCol; c <= endCol; c++) lanes[lane].push(c)
      placed.push({ todo: t, startCol, endCol, lane, clipLeft: s[0] < wStart, clipRight: s[1] > wEnd })
    }
    const days = Array.from({ length: 7 }, (_, i) => {
      const ms = wStart + i * DAY_MS
      const all = placed.filter(p => p.startCol <= i && p.endCol >= i)
      return { ms, key: keyOf(ms), date: new Date(ms).getUTCDate(), inMonth: new Date(ms).getUTCMonth() === monthIdx, all, hidden: all.filter(p => p.lane >= maxLanes) }
    })
    return { placed, days }
  }), [scheduled, gridStart, weekCount, monthIdx, maxLanes])

  function shift(dir: -1 | 1) {
    if (mode === 'week') setCursor(c => c + dir * 7 * DAY_MS)
    else setCursor(c => { const d = new Date(c); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1) })
  }

  function drop(day: string) {
    const t = entries.find(x => x.id === dragId)
    setDragId(null); setDropDay(null)
    if (!t) return
    const s = span(t)
    if (!s) return
    const delta = toUtc(day) - s[0]
    if (!delta) return
    const move = (v: string | null) => v ? keyOf(toUtc(dayKey(v)) + delta) : null
    if (t.sub) onSubtasks(t.todo, mapSubtaskTree(t.todo.subtasks ?? [], t.sub.id, x => ({ ...x, startDate: move(x.startDate), dueDate: move(x.dueDate) })))
    else onMove(t.todo, move(t.startDate), move(t.dueDate))
  }

  const title = mode === 'month'
    ? cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : `${new Date(gridStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(gridStart + 6 * DAY_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`

  const rowMinH = mode === 'month' ? 140 : 480

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCursor(todayMs)} className="px-3 py-1.5 rounded-lg border hover:bg-muted text-sm font-medium">Today</button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg border hover:bg-muted text-sm font-medium">
              {mode === 'month' ? 'Month' : 'Week'}<ChevronDown className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-32 p-1">
            {(['month', 'week'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-muted ${mode === m ? 'font-semibold' : ''}`}>{m === 'month' ? 'Month' : 'Week'}</button>
            ))}
          </PopoverContent>
        </Popover>
        <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        <span className="text-lg font-medium">{title}</span>
        {unscheduled > 0 && <span className="ml-auto text-xs text-muted-foreground">{unscheduled} task{unscheduled !== 1 ? 's' : ''} without dates not shown</span>}
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <div className="min-w-[840px]">
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`px-3 py-2 text-sm font-medium border-l first:border-l-0 ${i === 0 || i === 6 ? 'bg-muted/40' : ''}`}>{d}</div>
            ))}
          </div>

          {weeks.map((week, w) => {
            const lanesUsed = Math.min(maxLanes, Math.max(0, ...week.placed.map(p => p.lane + 1)))
            return (
              <div key={w} className="relative grid grid-cols-7 border-b last:border-b-0" style={{ minHeight: Math.max(rowMinH, 36 + lanesUsed * LANE_H + 28) }}>
                {/* Day cells (click target + drop target) */}
                {week.days.map((d, i) => {
                  const isToday = d.key === today
                  const weekend = i === 0 || i === 6
                  return (
                    <div key={d.key}
                      onClick={() => onCreateOn(d.key)}
                      onDragOver={e => { if (dragId) { e.preventDefault(); setDropDay(d.key) } }}
                      onDragLeave={() => setDropDay(k => k === d.key ? null : k)}
                      onDrop={e => { e.preventDefault(); drop(d.key) }}
                      className={`relative border-l first:border-l-0 cursor-pointer transition-colors
                        ${weekend || !d.inMonth ? 'bg-muted/40' : 'bg-background'} hover:bg-amber-50/40
                        ${dropDay === d.key ? 'bg-amber-100/60' : ''}
                        ${isToday ? 'outline outline-2 -outline-offset-2 outline-amber-500' : ''}`}>
                      <span className={`absolute bottom-2 right-3 text-sm ${isToday ? 'text-amber-600 font-semibold' : d.inMonth ? 'text-foreground/70' : 'text-muted-foreground/50'}`}>{d.date}</span>
                      {d.hidden.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button onClick={e => e.stopPropagation()} className="absolute left-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                              style={{ top: 8 + maxLanes * LANE_H }}>+{d.hidden.length} more</button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 p-2 space-y-1" onClick={e => e.stopPropagation()}>
                            <p className="text-xs font-semibold text-muted-foreground px-1 pb-1">
                              {new Date(d.ms).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                            </p>
                            {d.all.map(p => (
                              <button key={p.todo.id} onClick={() => onEdit(p.todo.todo)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm">
                                {p.todo.sub
                                  ? <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  : <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_META[p.todo.todo.status].dot}`} />}
                                <span className={`truncate ${p.todo.done ? 'line-through text-muted-foreground' : ''}`}>{p.todo.title}</span>
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  )
                })}

                {/* Task bars, positioned over the cells */}
                <div className="absolute inset-x-0 top-2 pointer-events-none">
                  {week.placed.filter(p => p.lane < maxLanes).map(p => {
                    const t = p.todo
                    const { done, overdue } = t
                    return (
                      <button key={t.id}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.effectAllowed = 'move'
                          // Deferred: re-rendering the source synchronously in dragstart can cancel the drag in Chrome.
                          setTimeout(() => setDragId(t.id), 0)
                        }}
                        onDragEnd={() => { setDragId(null); setDropDay(null) }}
                        onClick={e => { e.stopPropagation(); onEdit(t.todo) }}
                        title={`${t.sub ? `${t.todo.title} › ` : ''}${t.title}${fmtRange(t) ? ` · ${fmtRange(t)}` : ''}`}
                        className={`${dragId ? 'pointer-events-none' : 'pointer-events-auto'} absolute h-[20px] flex items-center gap-1.5 px-2 text-xs font-medium border truncate cursor-grab active:cursor-grabbing transition-opacity
                          ${t.sub ? 'bg-background text-foreground/80' : STATUS_META[t.todo.status].soft} ${overdue ? 'border-red-300' : t.sub ? 'border-dashed border-muted-foreground/40' : 'border-transparent'} ${dragId === t.id ? 'opacity-40' : 'hover:brightness-95'}
                          ${p.clipLeft ? 'rounded-l-none' : 'rounded-l-md'} ${p.clipRight ? 'rounded-r-none' : 'rounded-r-md'}`}
                        style={{
                          top: p.lane * LANE_H,
                          left: `calc(${(p.startCol / 7) * 100}% + ${p.clipLeft ? 0 : 4}px)`,
                          width: `calc(${((p.endCol - p.startCol + 1) / 7) * 100}% - ${(p.clipLeft ? 0 : 4) + (p.clipRight ? 0 : 4)}px)`,
                        }}>
                        {t.sub && <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        {t.priority && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_META[t.priority].dot}`} />}
                        <span className={`truncate ${done ? 'line-through opacity-70' : ''}`}>{t.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
