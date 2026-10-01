'use client'

import { useState } from 'react'
import { Check, Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import { newSubtaskId, type Subtask } from './shared'

interface Props {
  value: Subtask[]
  onChange: (subtasks: Subtask[]) => void
}

/** Checkbox — shared by the modal editor and the inline List view checklist. */
export function SubtaskCheck({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} title={done ? 'Mark as not done' : 'Mark as done'}
      className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground/40 hover:border-emerald-600 bg-background'}`}>
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  )
}

export default function SubtasksField({ value, onChange }: Props) {
  const [draft, setDraft] = useState('')
  const done = value.filter(s => s.done).length

  const update = (id: string, patch: Partial<Subtask>) => onChange(value.map(s => s.id === id ? { ...s, ...patch } : s))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function add() {
    const title = draft.trim()
    if (!title) return
    onChange([...value, { id: newSubtaskId(), title, done: false, dueDate: null, priority: null }])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / value.length) * 100}%` }} />
        </div>
      )}
      {value.length > 0 && (
        <ul className="border rounded-lg divide-y">
          {value.map((s, i) => (
            <li key={s.id} className="group flex items-center gap-2 px-3 py-1.5">
              <SubtaskCheck done={s.done} onToggle={() => update(s.id, { done: !s.done })} />
              <input className={`flex-1 min-w-0 h-7 text-sm bg-transparent focus:outline-none ${s.done ? 'line-through text-muted-foreground' : ''}`}
                value={s.title} onChange={e => update(s.id, { title: e.target.value })} />
              <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onChange(value.filter(x => x.id !== s.id))} className="p-0.5 rounded text-muted-foreground hover:text-red-600" title="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input className="flex-1 h-9 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          placeholder="Add a sub task and press Enter" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" onClick={add} disabled={!draft.trim()} className="h-9 px-3 flex items-center gap-1 text-sm border rounded-lg hover:bg-muted disabled:opacity-40">
          <Plus className="h-4 w-4" />Add
        </button>
      </div>
    </div>
  )
}
