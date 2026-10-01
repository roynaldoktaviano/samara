'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, X, Search, Kanban, GanttChart, List, Filter, Trash2, ListTodo, CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ListView from './ListView'
import KanbanView from './KanbanView'
import TimelineView from './TimelineView'
import CalendarView from './CalendarView'
import AttachmentsField from './AttachmentsField'
import SubtasksField from './SubtasksField'
import { STATUSES, PRIORITIES, dayKey, isOverdue, todayKey, type Todo, type Status, type Priority, type Attachment, type Subtask } from './shared'

type ViewMode = 'kanban' | 'timeline' | 'list' | 'calendar'
const VIEW_KEY = 'my-works:view'

const VIEWS: { key: ViewMode; label: string; icon: React.ElementType }[] = [
  { key: 'list', label: 'List', icon: List },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'kanban', label: 'Kanban', icon: Kanban },
  { key: 'timeline', label: 'Timeline', icon: GanttChart },
]

interface FormState { title: string; notes: string; type: string; startDate: string; dueDate: string; priority: Priority; status: Status; attachments: Attachment[]; subtasks: Subtask[] }
const emptyForm = (status: Status = 'TODO'): FormState => ({ title: '', notes: '', type: '', startDate: '', dueDate: '', priority: 'MEDIUM', status, attachments: [], subtasks: [] })

export default function MyWorksPage() {
  const [loading, setLoading] = useState(true)
  const [todos, setTodos] = useState<Todo[]>([])
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [overdueOnly, setOverdueOnly] = useState(false)

  // Modal: `editing` null + open = create
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Todo | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [uploadPrefix, setUploadPrefix] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === 'kanban' || v === 'timeline' || v === 'list' || v === 'calendar') setView(v)
    } catch { /* storage unavailable */ }
  }, [])
  function changeView(v: ViewMode) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/my-works')
    if (res.ok) {
      const data = await res.json()
      setTodos(data.todos ?? [])
      setUploadPrefix(data.uploadPrefix ?? '')
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => [...todos].sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt)), [todos])
  const types = useMemo(() => Array.from(new Set(todos.map(t => t.type).filter((t): t is string => !!t))).sort(), [todos])
  const today = todayKey()
  const overdueCount = todos.filter(t => isOverdue(t, today)).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter(t =>
      (!q || t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q) || (t.type ?? '').toLowerCase().includes(q)) &&
      (!priorityFilter.length || priorityFilter.includes(t.priority)) &&
      (!typeFilter.length || (t.type && typeFilter.includes(t.type))) &&
      (!overdueOnly || isOverdue(t, today)))
  }, [sorted, search, priorityFilter, typeFilter, overdueOnly, today])

  const activeFilters = priorityFilter.length + typeFilter.length + (overdueOnly ? 1 : 0)

  function openCreate(status: Status = 'TODO', day?: string) {
    setEditing(null); setForm({ ...emptyForm(status), ...(day ? { startDate: day, dueDate: day } : {}) }); setFormError(''); setModalOpen(true)
  }
  function openEdit(t: Todo) {
    setEditing(t)
    setForm({
      title: t.title, notes: t.notes ?? '', type: t.type ?? '',
      startDate: t.startDate ? dayKey(t.startDate) : '', dueDate: t.dueDate ? dayKey(t.dueDate) : '',
      priority: t.priority, status: t.status, attachments: t.attachments ?? [], subtasks: t.subtasks ?? [],
    })
    setFormError(''); setModalOpen(true)
  }

  async function save() {
    if (!form.title.trim()) { setFormError('Task name is required'); return }
    if (uploadBusy) return
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) { setFormError('End date must be on or after the start date'); return }
    setSaving(true); setFormError('')
    const payload = { ...form, startDate: form.startDate || null, dueDate: form.dueDate || null }
    const res = await fetch(editing ? `/api/my-works/${editing.id}` : '/api/my-works', {
      method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); return }
    setTodos(ts => editing ? ts.map(x => x.id === editing.id ? data.todo : x) : [data.todo, ...ts])
    setModalOpen(false)
  }

  async function remove(t: Todo) {
    if (!confirm(`Delete "${t.title}"?`)) return
    const res = await fetch(`/api/my-works/${t.id}`, { method: 'DELETE' })
    if (res.ok) { setTodos(ts => ts.filter(x => x.id !== t.id)); setModalOpen(false) }
  }

  async function changeStatus(t: Todo, status: Status) {
    // Optimistic — roll back if the server refuses.
    setTodos(ts => ts.map(x => x.id === t.id ? { ...x, status } : x))
    const res = await fetch(`/api/my-works/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (res.ok) { const { todo } = await res.json(); setTodos(ts => ts.map(x => x.id === t.id ? todo : x)) }
    else setTodos(ts => ts.map(x => x.id === t.id ? t : x))
  }

  // Inline List view edits (cells + sub tasks) — optimistic, rolled back on failure.
  async function patchTodo(t: Todo, patch: Partial<Todo>) {
    setTodos(ts => ts.map(x => x.id === t.id ? { ...x, ...patch } : x))
    const res = await fetch(`/api/my-works/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (res.ok) { const { todo } = await res.json(); setTodos(ts => ts.map(x => x.id === t.id ? todo : x)) }
    else {
      setTodos(ts => ts.map(x => x.id === t.id ? t : x))
      alert((await res.json().catch(() => null))?.error ?? 'Failed to save')
    }
  }
  const changeSubtasks = (t: Todo, subtasks: Subtask[]) => patchTodo(t, { subtasks })

  async function moveDates(t: Todo, startDate: string | null, dueDate: string | null) {
    setTodos(ts => ts.map(x => x.id === t.id ? { ...x, startDate, dueDate } : x))
    const res = await fetch(`/api/my-works/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate, dueDate }),
    })
    if (res.ok) { const { todo } = await res.json(); setTodos(ts => ts.map(x => x.id === t.id ? todo : x)) }
    else setTodos(ts => ts.map(x => x.id === t.id ? t : x))
  }

  async function reorder(status: Status, ids: string[]) {
    // Kanban only sees the filtered cards; keep hidden ones of that column after them so
    // their relative order survives.
    const shown = new Set(ids)
    const hidden = sorted.filter(t => t.status === status && !shown.has(t.id)).map(t => t.id)
    const full = [...ids, ...hidden]
    const prev = todos
    const pos = new Map(full.map((id, i) => [id, i]))
    setTodos(ts => ts.map(x => pos.has(x.id) ? { ...x, status, sortOrder: pos.get(x.id)! } : x))
    const res = await fetch('/api/my-works/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, ids: full }),
    })
    if (!res.ok) setTodos(prev)
    else if (prev.some(t => pos.has(t.id) && t.status !== status)) load() // refresh completedAt
  }

  const toggle = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  const inputCls = 'w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500'
  const labelCls = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide'

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm">
          <ListTodo className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Works</h2>
          <p className="text-muted-foreground text-sm">
            Your personal task board — only you can see it
            {overdueCount > 0 && <> · <span className="font-medium text-red-600">{overdueCount} overdue</span></>}
          </p>
        </div>
      </div>

      {/* View tabs + actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b">
        <div className="flex gap-1 -mb-px">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => changeView(v.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === v.key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <v.icon className="h-4 w-4" />{v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="h-9 border rounded-lg pl-9 pr-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 w-full md:w-48"
              placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button className={`h-9 flex items-center gap-2 px-3 rounded-lg border text-sm font-medium hover:bg-muted ${activeFilters ? 'border-amber-500 text-amber-700' : ''}`}>
                <Filter className="h-4 w-4" />Filter{activeFilters > 0 && <span className="text-xs bg-amber-600 text-white rounded-full px-1.5">{activeFilters}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-4">
              <div className="space-y-2">
                <p className={labelCls}>Priority</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map(p => (
                    <button key={p.key} onClick={() => setPriorityFilter(f => toggle(f, p.key))}
                      className={`px-2.5 py-1 rounded-md border text-xs font-medium ${priorityFilter.includes(p.key) ? p.cls : 'text-muted-foreground hover:bg-muted'}`}>{p.label}</button>
                  ))}
                </div>
              </div>
              {types.length > 0 && (
                <div className="space-y-2">
                  <p className={labelCls}>Type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {types.map(t => (
                      <button key={t} onClick={() => setTypeFilter(f => toggle(f, t))}
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium ${typeFilter.includes(t) ? 'bg-amber-50 border-amber-300 text-amber-800' : 'text-muted-foreground hover:bg-muted'}`}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />
                Overdue only
              </label>
              {activeFilters > 0 && (
                <button onClick={() => { setPriorityFilter([]); setTypeFilter([]); setOverdueOnly(false) }} className="text-xs text-muted-foreground hover:text-foreground underline">Clear filters</button>
              )}
            </PopoverContent>
          </Popover>
          <button onClick={() => openCreate()} className="h-9 flex items-center gap-1.5 bg-foreground hover:bg-foreground/90 text-background text-sm font-medium px-4 rounded-lg transition-colors whitespace-nowrap">
            <Plus className="h-4 w-4" />New Task
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="px-5 py-4 border-t first:border-t-0 flex gap-4"><div className="h-4 w-4 rounded bg-muted" /><div className="h-4 w-64 rounded bg-muted" /></div>)}
        </div>
      ) : view === 'list' ? (
        <ListView todos={visible} onAdd={openCreate} onEdit={openEdit} onDelete={remove} onStatus={changeStatus} onSubtasks={changeSubtasks} onPatch={patchTodo} types={types} />
      ) : view === 'kanban' ? (
        <KanbanView todos={visible} onAdd={openCreate} onEdit={openEdit} onReorder={reorder} />
      ) : view === 'calendar' ? (
        <CalendarView todos={visible} onEdit={openEdit} onCreateOn={day => openCreate('TODO', day)} onMove={moveDates} />
      ) : (
        <TimelineView todos={visible} onEdit={openEdit} />
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">{editing ? 'Edit Task' : 'New Task'}</h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="space-y-1.5">
                <label className={labelCls}>Task Name</label>
                <input autoFocus className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') save() }} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Description</label>
                <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={labelCls}>Start Date</label>
                  <input type="date" className={inputCls} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>End Date</label>
                  <input type="date" className={inputCls} min={form.startDate || undefined} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}>
                    {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Priority</label>
                  <select className={inputCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}>
                    {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Type</label>
                  <input list="my-works-types" className={inputCls} placeholder="e.g. Report" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} />
                  <datalist id="my-works-types">{types.map(t => <option key={t} value={t} />)}</datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Sub Tasks{form.subtasks.length > 0 && ` (${form.subtasks.filter(s => s.done).length}/${form.subtasks.length})`}</label>
                <SubtasksField value={form.subtasks} onChange={subtasks => setForm(f => ({ ...f, subtasks }))} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Attachments{form.attachments.length > 0 && ` (${form.attachments.length})`}</label>
                <AttachmentsField value={form.attachments} onChange={files => setForm(f => ({ ...f, attachments: files }))}
                  uploadPrefix={uploadPrefix} onBusyChange={setUploadBusy} />
              </div>
            </div>
            <div className="flex items-center gap-2 px-6 py-4 border-t bg-gray-50/80">
              {editing && (
                <button onClick={() => remove(editing)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="h-4 w-4" />Delete
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
                <button onClick={save} disabled={saving || uploadBusy} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving...' : uploadBusy ? 'Uploading...' : editing ? 'Save' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
