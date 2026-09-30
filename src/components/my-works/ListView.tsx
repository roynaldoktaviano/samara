'use client'

import { useState } from 'react'
import { ChevronDown, Plus, MoreHorizontal, Pencil, Trash2, Check, CalendarDays, Text, Paperclip, Tag, Flag, CircleDot, ListTodo } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { STATUSES, STATUS_META, fmtRange, isOverdue, todayKey, TypeTag, PriorityTag, type Todo, type Status } from './shared'

interface Props {
  todos: Todo[]
  onAdd: (status: Status) => void
  onEdit: (t: Todo) => void
  onDelete: (t: Todo) => void
  onStatus: (t: Todo, status: Status) => void
}

export default function ListView({ todos, onAdd, onEdit, onDelete, onStatus }: Props) {
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>({ DONE: true })
  const today = todayKey()

  return (
    <div className="space-y-6">
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
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="w-10 px-3 py-2.5" />
                      <th className="text-left px-3 py-2.5 font-medium w-[22%]"><span className="inline-flex items-center gap-1.5"><ListTodo className="h-3.5 w-3.5" />Task Name</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l"><span className="inline-flex items-center gap-1.5"><Text className="h-3.5 w-3.5" />Description</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-56"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Estimation</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-32"><span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />Type</span></th>
                      <th className="text-left px-3 py-2.5 font-medium border-l w-28"><span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5" />Priority</span></th>
                      <th className="w-10 border-l" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-4 text-xs text-muted-foreground text-center border-b">
                        No tasks. <button onClick={() => onAdd(s.key)} className="text-amber-700 hover:underline font-medium">Add one</button>
                      </td></tr>
                    ) : rows.map(t => {
                      const overdue = isOverdue(t, today)
                      const range = fmtRange(t)
                      const done = t.status === 'DONE'
                      return (
                        <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-3 align-middle">
                            <button onClick={() => onStatus(t, done ? 'TODO' : 'DONE')} title={done ? 'Mark as To-do' : 'Mark as Done'}
                              className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground/40 hover:border-emerald-600'}`}>
                              {done && <Check className="h-3 w-3" strokeWidth={3} />}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <button onClick={() => onEdit(t)} className={`text-left font-medium hover:text-amber-700 break-words ${done ? 'line-through text-muted-foreground' : ''}`}>{t.title}</button>
                            {t.attachments?.length > 0 && (
                              <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground align-middle" title={`${t.attachments.length} attachment${t.attachments.length !== 1 ? 's' : ''}`}>
                                <Paperclip className="h-3 w-3" />{t.attachments.length}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 border-l text-muted-foreground">
                            <p className="line-clamp-2 break-words" title={t.notes ?? undefined}>{t.notes || '-'}</p>
                          </td>
                          <td className={`px-3 py-3 border-l whitespace-nowrap ${overdue ? 'text-red-600 font-medium' : ''}`}>
                            {range ?? <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-3 border-l"><TypeTag type={t.type} /></td>
                          <td className="px-3 py-3 border-l"><PriorityTag priority={t.priority} /></td>
                          <td className="px-2 py-3 border-l text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-muted text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => onEdit(t)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger><CircleDot className="h-4 w-4 mr-2" />Move to</DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {STATUSES.filter(o => o.key !== t.status).map(o => (
                                      <DropdownMenuItem key={o.key} onClick={() => onStatus(t, o.key)}>
                                        <span className={`h-2 w-2 rounded-full mr-2 ${STATUS_META[o.key].dot}`} />{o.label}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDelete(t)} className="text-red-600 focus:text-red-600"><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
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
