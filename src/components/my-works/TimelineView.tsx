'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { STATUSES, dayKey, todayKey, fmtRange, isOverdue, PRIORITY_META, type Todo, type Status } from './shared'

const DAY_MS = 86400000
const CELL = 36        // px per day
const DAYS = 42        // six weeks visible
const LEFT = 260       // task-name column width
const toUtc = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Monday on/before the given day, so the grid always starts on a week boundary.
function mondayOf(ms: number) {
  const dow = new Date(ms).getUTCDay()
  return ms - ((dow + 6) % 7) * DAY_MS
}

interface Props {
  todos: Todo[]
  onEdit: (t: Todo) => void
}

export default function TimelineView({ todos, onEdit }: Props) {
  const today = todayKey()
  const todayMs = toUtc(today)
  // Start one week before the current week so a bit of recent history is visible.
  const [start, setStart] = useState(() => mondayOf(todayMs) - 7 * DAY_MS)
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>({})

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => {
    const ms = start + i * DAY_MS
    const d = new Date(ms)
    return { ms, key: keyOf(ms), day: d.getUTCDate(), dow: d.getUTCDay(), month: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
  }), [start])

  // Month header spans.
  const months = useMemo(() => {
    const out: { label: string; span: number }[] = []
    for (const d of days) {
      const last = out[out.length - 1]
      if (last && last.label === d.month) last.span++
      else out.push({ label: d.month, span: 1 })
    }
    return out
  }, [days])

  const end = start + (DAYS - 1) * DAY_MS
  const todayIdx = (todayMs - start) / DAY_MS
  const width = DAYS * CELL

  function bar(t: Todo) {
    const s = t.startDate ?? t.dueDate, e = t.dueDate ?? t.startDate
    if (!s || !e) return null
    const sMs = toUtc(dayKey(s)), eMs = toUtc(dayKey(e))
    if (eMs < start || sMs > end) return { offscreen: sMs > end ? 'right' as const : 'left' as const }
    const from = Math.max(sMs, start), to = Math.min(eMs, end)
    return {
      left: ((from - start) / DAY_MS) * CELL,
      width: ((to - from) / DAY_MS + 1) * CELL,
      clipLeft: sMs < start,
      clipRight: eMs > end,
    }
  }

  const rangeLabel = `${new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setStart(s => s - 14 * DAY_MS)} className="p-1.5 rounded-lg border hover:bg-muted" title="Previous 2 weeks"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setStart(mondayOf(todayMs) - 7 * DAY_MS)} className="px-3 py-1.5 rounded-lg border hover:bg-muted text-sm font-medium">Today</button>
        <button onClick={() => setStart(s => s + 14 * DAY_MS)} className="p-1.5 rounded-lg border hover:bg-muted" title="Next 2 weeks"><ChevronRight className="h-4 w-4" /></button>
        <span className="text-sm text-muted-foreground ml-2">{rangeLabel}</span>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <div style={{ width: LEFT + width }} className="relative">
          {/* Header */}
          <div className="flex sticky top-0 z-20 bg-background border-b">
            <div style={{ width: LEFT }} className="shrink-0 sticky left-0 z-30 bg-background border-r px-4 flex items-end pb-2 text-xs font-medium text-muted-foreground">Task Name</div>
            <div>
              <div className="flex border-b">
                {months.map((m, i) => (
                  <div key={i} style={{ width: m.span * CELL }} className="px-2 py-1.5 text-xs font-semibold truncate border-l first:border-l-0">{m.label}</div>
                ))}
              </div>
              <div className="flex">
                {days.map(d => (
                  <div key={d.key} style={{ width: CELL }}
                    className={`text-center py-1.5 text-[11px] border-l first:border-l-0 ${d.key === today ? 'text-white' : d.dow === 0 || d.dow === 6 ? 'text-muted-foreground/60 bg-muted/40' : 'text-muted-foreground'}`}>
                    <span className={d.key === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 font-semibold' : ''}>{d.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            {/* Weekend shading + today line, drawn once behind all rows */}
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: LEFT, width }}>
              {days.map((d, i) => (d.dow === 0 || d.dow === 6) && (
                <div key={d.key} className="absolute inset-y-0 bg-muted/30" style={{ left: i * CELL, width: CELL }} />
              ))}
              {todayIdx >= 0 && todayIdx < DAYS && (
                <div className="absolute inset-y-0 w-px bg-amber-500 z-10" style={{ left: todayIdx * CELL + CELL / 2 }} />
              )}
            </div>

            {STATUSES.map(s => {
              const rows = todos.filter(t => t.status === s.key)
              const open = !collapsed[s.key]
              return (
                <div key={s.key}>
                  <div className="flex border-b bg-muted/50 relative">
                    <button onClick={() => setCollapsed(c => ({ ...c, [s.key]: open }))} style={{ width: LEFT }}
                      className="shrink-0 sticky left-0 z-10 bg-muted flex items-center gap-2 px-3 py-2 text-sm font-semibold border-r">
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
                      <span className={`h-4 w-1 rounded-full ${s.bar}`} />{s.label}
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-background border text-muted-foreground font-medium">{rows.length}</span>
                    </button>
                  </div>
                  {open && rows.map(t => {
                    const b = bar(t)
                    const overdue = isOverdue(t, today)
                    return (
                      <div key={t.id} className="flex border-b h-11 hover:bg-muted/20">
                        <button onClick={() => onEdit(t)} style={{ width: LEFT }}
                          className="shrink-0 sticky left-0 z-10 bg-background border-r px-4 flex items-center gap-2 text-left text-sm hover:text-amber-700">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_META[t.priority].dot}`} title={`${PRIORITY_META[t.priority].label} priority`} />
                          <span className={`truncate ${t.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                        </button>
                        <div className="relative" style={{ width }}>
                          {!b ? (
                            <button onClick={() => onEdit(t)} className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-amber-700 hover:underline">
                              No dates — set estimation
                            </button>
                          ) : 'offscreen' in b ? (
                            <span className={`absolute top-1/2 -translate-y-1/2 text-xs text-muted-foreground flex items-center gap-1 ${b.offscreen === 'left' ? 'left-3' : 'right-3'}`}>
                              {b.offscreen === 'left' && <ChevronLeft className="h-3 w-3" />}{fmtRange(t)}{b.offscreen === 'right' && <ChevronRight className="h-3 w-3" />}
                            </span>
                          ) : (
                            <button onClick={() => onEdit(t)} title={`${t.title} · ${fmtRange(t)}`}
                              style={{ left: b.left + 2, width: Math.max(b.width - 4, 8) }}
                              className={`absolute top-2 bottom-2 z-[5] px-2 flex items-center text-xs font-medium text-white shadow-sm hover:brightness-110 transition
                                ${s.bar} ${overdue ? 'ring-2 ring-red-400' : ''} ${b.clipLeft ? 'rounded-l-none' : 'rounded-l-md'} ${b.clipRight ? 'rounded-r-none' : 'rounded-r-md'}`}>
                              <span className="truncate">{t.title}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {todos.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground" style={{ width: LEFT + width }}>No tasks yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
