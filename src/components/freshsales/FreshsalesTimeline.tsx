'use client'

// Merged Freshsales history (emails, activities/notes, timeline events) — shared by the
// Freshsales Archive menu and the Freshsales panel on Lead / Pipeline / Guest details.
import { useState } from 'react'
import { Mail, ArrowDownLeft, ArrowUpRight, Paperclip, StickyNote, CheckSquare, Activity, History } from 'lucide-react'
import { formatDate } from '@/lib/format'

export type TimelineItem =
  | { kind: 'email'; id: string; at: string | null; direction: string | null; subject: string | null; preview: string | null; from: string | null; to: string[]; messageCount: number | null; attachments: { fileName: string; size: number | null }[] }
  | { kind: 'activity'; id: string; at: string | null; activityKind: string; title: string | null; body: string | null; type: string | null; outcome: string | null; status: string | null; owner: string | null }
  | { kind: 'event'; id: string; at: string; actionType: string; label: string; detail: string | null; targetType: string | null }

// ─── Timeline ───────────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<string, typeof StickyNote> = { NOTE: StickyNote, TASK: CheckSquare, SALES_ACTIVITY: Activity, APPOINTMENT: Activity }

export function TimelineView({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<'all' | 'email' | 'activity' | 'event'>('all')
  const shown = filter === 'all' ? items : items.filter(i => i.kind === filter)
  const count = (k: TimelineItem['kind']) => items.filter(i => i.kind === k).length
  return (
    <div className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
        <div role="group" aria-label="Filter history" className="flex flex-wrap gap-1">
          {([['all', `All ${items.length}`], ['email', `Emails ${count('email')}`], ['activity', `Activities ${count('activity')}`], ['event', `Changes ${count('event')}`]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${filter === k ? 'bg-primary/15 text-primary-strong' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : (
        <ol className="relative border-l pl-4 space-y-3">
          {shown.map(item => <TimelineEntry key={`${item.kind}-${item.id}`} item={item} />)}
        </ol>
      )}
      {items.length >= 400 && <p className="text-[11px] text-muted-foreground">Showing the latest 400 items.</p>}
    </div>
  )
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false)
  if (item.kind === 'email') {
    const incoming = item.direction === 'incoming'
    const Icon = incoming ? ArrowDownLeft : ArrowUpRight
    return (
      <li className="relative">
        <span className={`absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full ${incoming ? 'bg-info/15 text-info' : 'bg-success/15 text-success'}`}><Icon className="h-2.5 w-2.5" /></span>
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="w-full text-left rounded-lg border px-3 py-2 hover:bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{item.subject || '(no subject)'}</p>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(item.at, 'datetime')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            <Mail className="inline h-3 w-3 mr-1" />{incoming ? 'From' : 'Sent'} {item.from ?? '—'}{item.to.length ? ` → ${item.to.slice(0, 3).join(', ')}${item.to.length > 3 ? '…' : ''}` : ''}
            {item.messageCount && item.messageCount > 1 ? ` · ${item.messageCount} messages` : ''}
          </p>
          {item.preview && <p className={`text-xs mt-1 whitespace-pre-line text-foreground/80 ${open ? '' : 'line-clamp-2'}`}>{item.preview}</p>}
          {open && item.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.attachments.map((a, i) => <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]"><Paperclip className="h-3 w-3" />{a.fileName}</span>)}
            </div>
          )}
          {open && <p className="text-[10px] text-muted-foreground mt-1">Freshsales only provides a preview of the email body.</p>}
        </button>
      </li>
    )
  }
  if (item.kind === 'activity') {
    const Icon = ACTIVITY_ICON[item.activityKind] ?? Activity
    return (
      <li className="relative">
        <span className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning/15 text-warning"><Icon className="h-2.5 w-2.5" /></span>
        <div className="rounded-lg border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.title || item.activityKind.replace('_', ' ').toLowerCase()}</p>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(item.at, 'datetime')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {[item.activityKind === 'NOTE' ? 'Note' : item.type ?? item.activityKind.replace('_', ' ').toLowerCase(), item.outcome, item.status, item.owner].filter(Boolean).join(' · ')}
          </p>
          {item.body && <p className="text-xs mt-1 whitespace-pre-line text-foreground/80">{item.body}</p>}
        </div>
      </li>
    )
  }
  return (
    <li className="relative">
      <span className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground"><History className="h-2.5 w-2.5" /></span>
      <div className="flex items-center justify-between gap-2 py-0.5">
        <p className="text-xs"><span className="font-medium capitalize">{item.label}</span>{item.targetType ? <span className="text-muted-foreground"> · {item.targetType}</span> : null}{item.detail ? <span className="text-muted-foreground"> — {item.detail}</span> : null}</p>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(item.at, 'datetime')}</span>
      </div>
    </li>
  )
}
