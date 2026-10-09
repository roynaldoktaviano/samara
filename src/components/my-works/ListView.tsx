'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, Plus, MoreHorizontal, Pencil, Trash2, Check, CalendarDays, Text, Paperclip, Tag, Flag, CircleDot, ListTodo, Maximize2, Users } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { STATUSES, STATUS_META, isOverdue, todayKey, SubtaskCount, RecurrenceTag, useWorks, canProgressTask, isOwnTask, userLabel, type Todo, type Status, type Subtask } from './shared'
import AssigneePicker from './AssigneePicker'
import { SubtaskTree, subtaskOps, PriorityPick, type SubtaskTreeState } from './SubtaskRows'
import { TextCell, TypeCell, RangeCell } from './InlineCells'

interface Props {
  todos: Todo[]
  onAdd: (status: Status) => void
  onEdit: (t: Todo) => void
  onDelete: (t: Todo) => void
  onStatus: (t: Todo, status: Status) => void
  onSubtasks: (t: Todo, subtasks: Subtask[]) => void
  // Partial inline edit of one task's fields (List view cells).
  onPatch: (t: Todo, patch: Partial<Pick<Todo, 'title' | 'notes' | 'type' | 'startDate' | 'dueDate' | 'priority' | 'assigneeIds'>>) => void
  types: string[]
}

export default function ListView({ todos, onAdd, onEdit, onDelete, onStatus, onSubtasks, onPatch, types }: Props) {
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>({ DONE: true })
  // Tasks whose sub task checklist is expanded under their row.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpanded(e => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Task currently showing the inline "new sub task" row.
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  function startCreate(id: string) {
    setCreatingFor(id)
    setExpanded(e => new Set(e).add(id))
  }
  const treeState: SubtaskTreeState = {
    expanded, toggleExpand, creatingFor, startCreate, cancelCreate: () => setCreatingFor(null), typesList: 'my-works-list-types',
  }
  const today = todayKey()
  const { meId } = useWorks()

  return (
    <div className="space-y-6">
      <datalist id="my-works-list-types">{types.map(t => <option key={t} value={t} />)}</datalist>
      {STATUSES.map(s => {
        const rows = todos.filter(t => t.status === s.key)
        const open = !collapsed[s.key]
        return (
          <section key={s.key}>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <button onClick={() => setCollapsed(c => ({ ...c, [s.key]: open }))} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
              <span className={`h-4 w-1 rounded-full ${s.bar}`} />
              <span className="font-semibold text-sm">{s.label}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-background border text-muted-foreground font-medium">{rows.length}</span>
              <button onClick={() => onAdd(s.key)} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={`Add task to ${s.label}`}>
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {open && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="w-10 px-3 py-2.5" />
                      <th className="text-left px-3 py-2.5 font-medium w-[22%]"><span className="inline-flex items-center gap-1.5"><ListTodo className="h-3.5 w-3.5" />Task Name</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l"><span className="inline-flex items-center gap-1.5"><Text className="h-3.5 w-3.5" />Description</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-44"><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Assignee</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-56"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Estimation</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-32"><span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />Type</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-28"><span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5" />Priority</span></th>
                      <th className="w-10 border-l" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-4 text-xs text-muted-foreground text-center border-b">
                        No tasks. <button onClick={() => onAdd(s.key)} className="text-amber-700 hover:underline font-medium">Add one</button>
                      </td></tr>
                    ) : rows.map(t => {
                      const overdue = isOverdue(t, today)
                      const done = t.status === 'DONE'
                      const subs = t.subtasks ?? []
                      const isOpen = subs.length > 0 && expanded.has(t.id)
                      const ops = subtaskOps(t, onSubtasks)
                      const canProgress = canProgressTask(t, meId)
                      // Someone else's task assigned to me: progress only.
                      const ro = !isOwnTask(t, meId)
                      return (
                        <Fragment key={t.id}>
                        <tr className={`border-b hover:bg-muted/30 transition-colors group ${ro ? 'bg-sky-50/40' : ''}`}>
                          <td className="px-3 py-3 align-middle">
                            <button onClick={() => onStatus(t, done ? 'TODO' : 'DONE')} disabled={!canProgress}
                              title={!canProgress ? 'Only sub tasks are assigned to you' : done ? 'Mark as To-do' : 'Mark as Done'}
                              className={`h-4 w-4 rounded border flex items-center justify-center transition-colors disabled:opacity-40 ${done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground/40 hover:border-emerald-600'}`}>
                              {done && <Check className="h-3 w-3" strokeWidth={3} />}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {subs.length > 0 ? (
                                <button onClick={() => toggleExpand(t.id)} className="p-0.5 -ml-1 rounded hover:bg-muted text-muted-foreground shrink-0" title={isOpen ? 'Hide sub tasks' : 'Show sub tasks'}>
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                                </button>
                              ) : <span className="w-3.5 -ml-1 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <TextCell value={t.title} required readOnly={ro} onSave={title => onPatch(t, { title })}
                                  className={`font-medium break-words ${done ? 'line-through text-muted-foreground' : ''}`} />
                                {ro && t.user && <p className="text-xs text-sky-700">Assigned by {userLabel(t.user)}</p>}
                              </div>
                              {t.recurrence && <span className="shrink-0"><RecurrenceTag todo={t} /></span>}
                              {t.attachments?.length > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground shrink-0" title={`${t.attachments.length} attachment${t.attachments.length !== 1 ? 's' : ''}`}>
                                  <Paperclip className="h-3 w-3" />{t.attachments.length}
                                </span>
                              )}
                              {subs.length > 0 && (
                                <button onClick={() => toggleExpand(t.id)} className="shrink-0"><SubtaskCount subtasks={subs} /></button>
                              )}
                              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                {!ro && (
                                  <button onClick={() => startCreate(t.id)} title="Create sub task"
                                    className="h-7 w-7 flex items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground hover:bg-muted">
                                    <Plus className="h-4 w-4" />
                                  </button>
                                )}
                                <button onClick={() => onEdit(t)} title="Open task"
                                  className="h-7 w-7 flex items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground hover:bg-muted">
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 border-l text-muted-foreground">
                            <TextCell value={t.notes} multiline readOnly={ro} onSave={notes => onPatch(t, { notes })} className="line-clamp-2 break-words whitespace-pre-line" />
                          </td>
                          <td className="px-3 py-2 border-l"><AssigneePicker value={t.assigneeIds ?? []} readOnly={ro} onChange={assigneeIds => onPatch(t, { assigneeIds })} /></td>
                          <td className="px-3 py-2 border-l">
                            <RangeCell startDate={t.startDate} dueDate={t.dueDate} overdue={overdue} readOnly={!canProgress} onSave={(startDate, dueDate) => onPatch(t, { startDate, dueDate })} />
                          </td>
                          <td className="px-3 py-2 border-l"><TypeCell value={t.type} datalist="my-works-list-types" readOnly={ro} onSave={type => onPatch(t, { type })} /></td>
                          <td className="px-3 py-2 border-l"><PriorityPick value={t.priority} required readOnly={ro} onChange={p => p && onPatch(t, { priority: p })} /></td>
                          <td className="px-2 py-3 border-l text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-muted text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => onEdit(t)}><Pencil className="h-4 w-4 mr-2" />{ro ? 'Open' : 'Edit'}</DropdownMenuItem>
                                {canProgress && <DropdownMenuSub>
                                  <DropdownMenuSubTrigger><CircleDot className="h-4 w-4 mr-2" />Move to</DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {STATUSES.filter(o => o.key !== t.status).map(o => (
                                      <DropdownMenuItem key={o.key} onClick={() => onStatus(t, o.key)}>
                                        <span className={`h-2 w-2 rounded-full mr-2 ${STATUS_META[o.key].dot}`} />{o.label}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>}
                                {!ro && <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => onDelete(t)} className="text-red-600 focus:text-red-600"><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                </>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        {(isOpen || creatingFor === t.id) && <SubtaskTree subs={isOpen ? subs : []} depth={1} parentId={t.id} ops={ops} state={treeState} inherited={canProgress} readOnly={ro} />}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
