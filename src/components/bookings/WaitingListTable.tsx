'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2, ArrowUpCircle, Phone, Mail } from 'lucide-react'
import { toast } from 'sonner'
import type { WaitingListEntry } from '@/hooks/useWaitingList'


interface Props {
  items: WaitingListEntry[]
  loading: boolean
  onPromote: (id: string) => Promise<void>
  onRemove:  (id: string) => Promise<void>
}

export default function WaitingListTable({ items, loading, onPromote, onRemove }: Props) {
  const [actionId, setActionId] = useState<string | null>(null)

  const handlePromote = async (id: string) => {
    setActionId(id)
    try {
      await onPromote(id)
      toast.success('Promoted to On Hold')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to promote')
    } finally { setActionId(null) }
  }

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the waiting list?`)) return
    setActionId(id)
    try {
      await onRemove(id)
      toast.success('Removed from waiting list')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    } finally { setActionId(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No one on the waiting list yet
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[40px_1fr_1.4fr_100px_40px] gap-0 bg-muted/60 border-b">
        {['#', 'Name', 'Contact', 'Added by', ''].map((h, i) => (
          <div key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {items.map((item, idx) => {
        const busy = actionId === item.id
        const dim  = item.status !== 'waiting'
        return (
          <div
            key={item.id}
            className={[
              'grid grid-cols-[40px_1fr_1.4fr_100px_40px] gap-0 border-b last:border-0 items-center transition-colors',
              dim ? 'opacity-50 bg-white' : 'bg-white hover:bg-slate-50/60',
            ].join(' ')}
          >
            {/* # */}
            <div className="px-4 py-4 text-sm font-semibold text-muted-foreground">
              {idx + 1}
            </div>

            {/* Name */}
            <div className="px-4 py-4">
              <p className="text-sm font-semibold text-foreground leading-tight">{item.contactName}</p>
              {item.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">{item.notes}</p>
              )}
            </div>

            {/* Contact */}
            <div className="px-4 py-4 space-y-1">
              {item.contactPhone && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {item.contactPhone}
                </span>
              )}
              {item.contactEmail && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {item.contactEmail}
                </span>
              )}
            </div>

            {/* Added by (salesperson) */}
            <div className="px-4 py-4">
              <p className="text-xs text-muted-foreground truncate">
                {item.salesperson?.name ?? '—'}
              </p>
            </div>

            {/* Actions */}
            <div className="px-2 py-4 flex flex-col gap-1 items-center">
              {item.status === 'waiting' && (
                <>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                    title="Promote to On Hold"
                    disabled={busy}
                    onClick={() => handlePromote(item.id)}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                    title="Remove from waiting list"
                    disabled={busy}
                    onClick={() => handleRemove(item.id, item.contactName)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
