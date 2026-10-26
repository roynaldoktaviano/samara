'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Clock, History } from 'lucide-react'
import { useWaitingList } from '@/hooks/useWaitingList'
import { formatDate } from '@/lib/format'
import WaitingListTable from './WaitingListTable'
import AddToWaitingListDialog from './AddToWaitingListDialog'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  bookingId: string
  bookingCode: string
  startDate: string
  endDate: string
  yachtId?: string | null
  openTripId?: string | null
  currentCustomerId?: string
}

export default function WaitingListManager({
  open, onOpenChange,
  bookingId, bookingCode,
  startDate, endDate,
  yachtId, openTripId,
  currentCustomerId,
}: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const { items, history, loading, refetch, promote, remove } = useWaitingList(bookingId)

  const waitingCount    = items.filter(i => i.status === 'waiting').length
  const excludeCustomerIds = [
    ...(currentCustomerId ? [currentCustomerId] : []),
    ...items
      .filter(i => i.status === 'waiting' || i.status === 'promoted')
      .map(i => i.customerId)
      .filter((id): id is string => id !== null),
  ].filter((id, idx, arr) => arr.indexOf(id) === idx) // dedupe

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Waiting List
                  {waitingCount > 0 && (
                    <Badge className="bg-warning/15 text-warning border-warning/30 text-xs ml-1">
                      {waitingCount} waiting
                    </Badge>
                  )}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Booking <span className="font-mono font-semibold text-foreground">{bookingCode}</span>
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setAddOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </DialogHeader>

          <div className="mt-2">
            <WaitingListTable
              items={items}
              loading={loading}
              onPromote={promote}
              onRemove={remove}
            />
          </div>

          {history.length > 0 && (
            <div className="mt-4 border border-destructive/30 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 border-b border-destructive/30">
                <History className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs font-semibold uppercase tracking-wider text-destructive">Slot Cancelled History</span>
              </div>
              <div className="divide-y divide-destructive/30">
                {history.map((h, i) => (
                  <div key={h.id} className="flex items-start gap-3 px-4 py-3 bg-destructive/5">
                    <span className="text-xs font-semibold text-destructive/60 w-4 pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-destructive">{h.holderName}</p>
                      {h.cancelReason && (
                        <p className="text-xs text-destructive/80 mt-0.5">
                          Reason: <span className="text-destructive">{h.cancelReason}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-destructive/80">
                        {formatDate(h.cancelledAt)}
                      </p>
                      <p className="text-xs text-destructive/80">
                        {formatDate(h.cancelledAt, 'time')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddToWaitingListDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        bookingId={bookingId}
        yachtId={yachtId ?? undefined}
        openTripId={openTripId ?? undefined}
        startDate={startDate}
        endDate={endDate}
        onAdded={refetch}
        excludeCustomerIds={excludeCustomerIds}
      />
    </>
  )
}
