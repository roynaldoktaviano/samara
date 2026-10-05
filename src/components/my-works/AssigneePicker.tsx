'use client'

import { useState } from 'react'
import { Check, Search, UserPlus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarStack, useWorks, userLabel } from './shared'

/** "Budi" / "Budi, Sari" / "Budi, Sari +2" — first names keep the cell narrow; the full list is in the title. */
function NamesLabel({ ids }: { ids: string[] }) {
  const { byId } = useWorks()
  const first = (id: string) => userLabel(byId.get(id)).split(/[\s@]/)[0]
  const label = ids.length === 1 ? userLabel(byId.get(ids[0]))
    : `${ids.slice(0, 2).map(first).join(', ')}${ids.length > 2 ? ` +${ids.length - 2}` : ''}`
  return <span className="text-sm truncate min-w-0">{label}</span>
}

/**
 * Avatar stack that opens a searchable multi-select of every user. Read-only on a task someone
 * else owns. Shows names next to the avatars unless `compact`.
 */
export default function AssigneePicker({ value, onChange, readOnly, size = 24, compact }: {
  value: string[]; onChange: (ids: string[]) => void; readOnly?: boolean; size?: number; compact?: boolean
}) {
  const { users, byId, meId } = useWorks()
  const [q, setQ] = useState('')
  const full = value.map(i => userLabel(byId.get(i))).join(', ')
  if (readOnly) return value.length
    ? <span title={full} className="flex items-center gap-1.5 min-w-0"><AvatarStack ids={value} size={size} max={2} /><NamesLabel ids={value} /></span>
    : <span className="text-muted-foreground text-sm">-</span>

  const term = q.trim().toLowerCase()
  // Selected first, then me, then everyone else alphabetically (API order).
  const list = users
    .filter(u => !term || userLabel(u).toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    .sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)) || Number(b.id === meId) - Number(a.id === meId))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])

  return (
    <Popover onOpenChange={o => { if (!o) setQ('') }}>
      <PopoverTrigger asChild>
        <button type="button" title={value.length ? full : 'Assign'}
          className={compact
            ? 'h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md border hover:bg-muted text-muted-foreground'
            : 'rounded-md px-1 py-0.5 -mx-1 hover:bg-muted flex items-center gap-1.5 min-h-7 max-w-full min-w-0'}>
          {value.length
            ? compact ? <AvatarStack ids={value} size={size} /> : <><AvatarStack ids={value} size={size} max={2} /><NamesLabel ids={value} /></>
            : <UserPlus className="h-4 w-4 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" onClick={e => e.stopPropagation()}>
        <div className="p-2 border-b relative">
          <Search className="h-3.5 w-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus className="w-full h-8 border rounded-md pl-7 pr-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="Search people..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {list.map(u => {
            const on = value.includes(u.id)
            return (
              <button key={u.id} type="button" onClick={() => toggle(u.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm">
                <Avatar id={u.id} user={u} size={22} />
                <span className="flex-1 min-w-0 truncate">{userLabel(u)}{u.id === meId && <span className="text-muted-foreground"> (me)</span>}</span>
                {on && <Check className="h-4 w-4 text-amber-600 shrink-0" />}
              </button>
            )
          })}
          {list.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground text-center">No one found</p>}
        </div>
        {value.length > 0 && (
          <div className="border-t p-1">
            <button type="button" onClick={() => onChange([])} className="w-full px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted text-left">Remove all assignees</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
