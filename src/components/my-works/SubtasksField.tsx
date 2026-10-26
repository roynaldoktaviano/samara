'use client'

import { useState } from 'react'
import { Check, Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import { newSubtaskId, type Subtask } from './shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  value: Subtask[]
  onChange: (subtasks: Subtask[]) => void
}

/** Checkbox — shared by the modal editor and the inline List view checklist. */
export function SubtaskCheck({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={done} onClick={onToggle} title={done ? 'Mark as not done' : 'Mark as done'} aria-label={done ? 'Mark as not done' : 'Mark as done'}
      className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${done ? 'bg-success border-success text-success-foreground' : 'border-muted-foreground/40 hover:border-success bg-background'}`}>
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
    onChange([...value, { id: newSubtaskId(), title, done: false, notes: null, type: null, startDate: null, dueDate: null, priority: null, children: [] }])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-success transition-all" style={{ width: `${(done / value.length) * 100}%` }} />
        </div>
      )}
      {value.length > 0 && (
        <ul className="border rounded-lg divide-y">
          {value.map((s, i) => (
            <li key={s.id} className="group flex items-center gap-2 px-3 py-1.5">
              <SubtaskCheck done={s.done} onToggle={() => update(s.id, { done: !s.done })} />
              <input aria-label="Sub task title" className={`flex-1 min-w-0 h-7 text-sm bg-transparent focus:outline-none ${s.done ? 'line-through text-muted-foreground' : ''}`}
                value={s.title} onChange={e => update(s.id, { title: e.target.value })} />
              <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up" aria-label="Move up">
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down" aria-label="Move down">
                  <ChevronDown className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter(x => x.id !== s.id))} className="size-7 text-muted-foreground hover:text-destructive" title="Remove" aria-label="Remove">
                  <X className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input className="flex-1" aria-label="New sub task"
          placeholder="Add a sub task and press Enter" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()} className="gap-1 px-3">
          <Plus />Add
        </Button>
      </div>
    </div>
  )
}
