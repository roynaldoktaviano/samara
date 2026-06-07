'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Clock, History } from 'lucide-react'
import { useWaitingList } from '@/hooks/useWaitingList'
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
                  <Clock className="h-5 w-5 text-amber-500" />
                  Waiting List
                  {waitingCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs ml-1">
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
                Tambah
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
            <div className="mt-4 border border-red-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200">
                <History className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-red-500">Slot Cancelled History</span>
              </div>
              <div className="divide-y divide-red-100">
                {history.map((h, i) => (
                  <div key={h.id} className="flex items-start gap-3 px-4 py-3 bg-red-50/30">
                    <span className="text-xs font-semibold text-red-300 w-4 pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-red-700">{h.holderName}</p>
                      {h.cancelReason && (
                        <p className="text-xs text-red-400 mt-0.5">
                          Reason: <span className="text-red-500">{h.cancelReason}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-red-400">
                        {new Date(h.cancelledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-red-400">
                        {new Date(h.cancelledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
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
