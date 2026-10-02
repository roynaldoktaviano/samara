'use client'

import { useEffect, useRef, useState } from 'react'
import { SubtaskCheck } from './SubtasksField'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, CalendarDays, AlignLeft, Paperclip, ChevronDown } from 'lucide-react'
import { STATUSES, fmtRange, isOverdue, todayKey, TypeTag, PriorityTag, SubtaskCount, flattenSubtasks, mapSubtaskTree, isSubOverdue, fmtDay, useWorks, canProgressTask, canTickSub, isOwnTask, AvatarStack, userLabel, type Subtask, type Todo, type Status } from './shared'

type Columns = Record<Status, string[]>

interface Props {
  todos: Todo[]
  onAdd: (status: Status) => void
  onEdit: (t: Todo) => void
  // Called once per drop with the destination column's full new top-to-bottom order.
  onReorder: (status: Status, ids: string[]) => void
  onSubtasks: (t: Todo, subtasks: Subtask[]) => void
}

const buildColumns = (todos: Todo[]): Columns => {
  const cols: Columns = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] }
  for (const t of todos) cols[t.status].push(t.id)
  return cols
}

export default function KanbanView({ todos, onAdd, onEdit, onReorder, onSubtasks }: Props) {
  const [cols, setCols] = useState<Columns>(() => buildColumns(todos))
  const [activeId, setActiveId] = useState<string | null>(null)
  const startCol = useRef<Status | null>(null)
  // The browser still fires a click on the card right after a drop — swallow it so a drag
  // doesn't also open the edit modal.
  const justDragged = useRef(false)
  const openCard = (t: Todo) => { if (!justDragged.current) onEdit(t) }
  const byId = new Map(todos.map(t => [t.id, t]))

  // Re-sync from props whenever we're not mid-drag.
  useEffect(() => { if (!activeId) setCols(buildColumns(todos)) }, [todos, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const findCol = (id: string): Status | null => {
    if (id in cols) return id as Status
    return (Object.keys(cols) as Status[]).find(k => cols[k].includes(id)) ?? null
  }

  function handleStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActiveId(id)
    startCol.current = findCol(id)
  }

  function handleOver({ active, over }: DragOverEvent) {
    if (!over) return
    const id = String(active.id), overId = String(over.id)
    const from = findCol(id), to = findCol(overId)
    if (!from || !to || from === to) return
    setCols(c => {
      const toItems = [...c[to]]
      const overIdx = toItems.indexOf(overId)
      toItems.splice(overIdx >= 0 ? overIdx : toItems.length, 0, id)
      return { ...c, [from]: c[from].filter(x => x !== id), [to]: toItems }
    })
  }

  function handleEnd({ active, over }: DragEndEvent) {
    const id = String(active.id)
    const col = findCol(id)
    setActiveId(null)
    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 150)
    if (!over || !col) { setCols(buildColumns(todos)); return }
    const overId = String(over.id)
    let items = cols[col]
    if (findCol(overId) === col && overId !== col) {
      const oldIdx = items.indexOf(id), newIdx = items.indexOf(overId)
      if (oldIdx !== newIdx) items = arrayMove(items, oldIdx, newIdx)
    }
    setCols(c => ({ ...c, [col]: items }))
    const orig = todos.filter(t => t.status === col).map(t => t.id)
    const changed = startCol.current !== col || orig.join() !== items.join()
    if (changed) onReorder(col, items)
  }

  const active = activeId ? byId.get(activeId) : null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleStart} onDragOver={handleOver} onDragEnd={handleEnd}
      onDragCancel={() => { setActiveId(null); setCols(buildColumns(todos)) }}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STATUSES.map(s => (
          <Column key={s.key} status={s.key} label={s.label} bar={s.bar} count={cols[s.key].length} onAdd={() => onAdd(s.key)}>
            <SortableContext items={cols[s.key]} strategy={verticalListSortingStrategy}>
              {cols[s.key].map(id => {
                const t = byId.get(id)
                return t ? <SortableCard key={id} todo={t} onEdit={openCard} onSubtasks={onSubtasks} /> : null
              })}
            </SortableContext>
          </Column>
        ))}
      </div>
      <DragOverlay>{active ? <Card todo={active} dragging /> : null}</DragOverlay>
    </DndContext>
  )
}

function Column({ status, label, bar, count, onAdd, children }: {
  status: Status; label: string; bar: string; count: number; onAdd?: () => void; children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="w-72 shrink-0 flex flex-col rounded-xl bg-muted/40 border">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`h-4 w-1 rounded-full ${bar}`} />
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-md bg-background border text-muted-foreground font-medium">{count}</span>
        {onAdd && (
          <button onClick={onAdd} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={`Add task to ${label}`}>
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-32 px-2 pb-2 space-y-2 rounded-b-xl transition-colors ${isOver ? 'bg-amber-50/60' : ''}`}>
        {children}
        {count === 0 && <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">Drop tasks here</div>}
      </div>
    </div>
  )
}

function SortableCard({ todo, onEdit, onSubtasks }: { todo: Todo; onEdit: (t: Todo) => void; onSubtasks: Props['onSubtasks'] }) {
  const { meId } = useWorks()
  // On someone else's task only people on the task itself may move it between columns.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id, disabled: !canProgressTask(todo, meId) })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      className={isDragging ? 'opacity-30' : ''} onClick={() => onEdit(todo)}>
      <Card todo={todo} onSubtasks={onSubtasks} />
    </div>
  )
}

function Card({ todo, dragging, onSubtasks }: { todo: Todo; dragging?: boolean; onSubtasks?: Props['onSubtasks'] }) {
  const [showSubs, setShowSubs] = useState(false)
  const range = fmtRange(todo)
  const overdue = isOverdue(todo, todayKey())
  const done = todo.status === 'DONE'
  const { meId } = useWorks()
  // Sub tasks with whether the viewer may tick them (inherited from an assigned ancestor).
  const walk = (subs: Subtask[], depth: number, inherited: boolean): { sub: Subtask; depth: number; can: boolean }[] =>
    subs.flatMap(sub => { const can = canTickSub(sub, inherited, meId); return [{ sub, depth, can }, ...walk(sub.children ?? [], depth + 1, can)] })
  return (
    <div className={`rounded-lg border bg-background p-3 space-y-2 cursor-grab active:cursor-grabbing select-none hover:border-amber-300 transition-colors ${dragging ? 'shadow-xl rotate-1' : 'shadow-sm'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-medium break-words ${done ? 'line-through text-muted-foreground' : ''}`}>{todo.title}</p>
          {!isOwnTask(todo, meId) && todo.user && <p className="text-xs text-sky-700">Assigned by {userLabel(todo.user)}</p>}
        </div>
      </div>
      {todo.notes && (
        <p className="text-xs text-muted-foreground line-clamp-2 break-words flex gap-1"><AlignLeft className="h-3 w-3 mt-0.5 shrink-0" />{todo.notes}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {todo.type && <TypeTag type={todo.type} />}
        <PriorityTag priority={todo.priority} />
        {todo.assigneeIds?.length > 0 && <span className="ml-auto"><AvatarStack ids={todo.assigneeIds} size={20} /></span>}
      </div>
      {todo.subtasks?.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(flattenSubtasks(todo.subtasks).filter(s => s.done).length / flattenSubtasks(todo.subtasks).length) * 100}%` }} />
          </div>
          <button onClick={e => { e.stopPropagation(); setShowSubs(v => !v) }} onPointerDown={e => e.stopPropagation()}
            className="flex items-center gap-0.5 rounded hover:bg-muted px-0.5" title={showSubs ? 'Hide sub tasks' : 'Show sub tasks'}>
            <SubtaskCount subtasks={todo.subtasks} />
            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${showSubs ? '' : '-rotate-90'}`} />
          </button>
        </div>
      )}
      {showSubs && onSubtasks && todo.subtasks?.length > 0 && (
        // Own clicks/pointer events so ticking a sub task neither opens the modal nor starts a drag.
        <ul className="space-y-1 border-t pt-2 cursor-default" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          {walk(todo.subtasks, 1, canProgressTask(todo, meId)).map(({ sub, depth, can }) => (
            <li key={sub.id} className="flex items-start gap-1.5 text-xs" style={{ paddingLeft: (depth - 1) * 14 }}>
              <span className={`mt-px ${can ? '' : 'pointer-events-none opacity-40'}`}><SubtaskCheck done={sub.done} onToggle={() => onSubtasks(todo, mapSubtaskTree(todo.subtasks, sub.id, s => ({ ...s, done: !s.done })))} /></span>
              <span className={`flex-1 break-words ${sub.done ? 'line-through text-muted-foreground' : ''}`}>{sub.title}</span>
              {(sub.assigneeIds?.length ?? 0) > 0 && <AvatarStack ids={sub.assigneeIds!} size={16} max={2} />}
              {sub.dueDate && <span className={`shrink-0 ${isSubOverdue(sub) ? 'text-red-600' : 'text-muted-foreground'}`}>{fmtDay(sub.dueDate).replace(/, \d{4}$/, '')}</span>}
            </li>
          ))}
        </ul>
      )}
      {(range || todo.attachments?.length > 0) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {range ? (
            <p className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
              <CalendarDays className="h-3 w-3" />{range}{overdue && ' · Overdue'}
            </p>
          ) : <span />}
          {todo.attachments?.length > 0 && (
            <span className="flex items-center gap-0.5 text-muted-foreground"><Paperclip className="h-3 w-3" />{todo.attachments.length}</span>
          )}
        </div>
      )}
    </div>
  )
}
