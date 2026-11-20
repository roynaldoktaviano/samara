'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { DEAL_PAYMENT_STATUS_LABEL, WON_PAYMENT_STATUSES, type DealPaymentStatus } from '@/lib/lead-pipeline'

// Asked before a deal moves to Won by hand — Won means the deposit (DP) is in, and the stage API
// refuses the move without a payment status (go-live parity C3).
export default function WonPaymentDialog({ open, dealName, busy, onCancel, onConfirm }: {
  open: boolean
  dealName?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (paymentStatus: DealPaymentStatus) => void
}) {
  const [status, setStatus] = useState<DealPaymentStatus | ''>('')

  useEffect(() => { if (open) setStatus('') }, [open])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Won{dealName ? ` — ${dealName}` : ''}</DialogTitle>
          <DialogDescription>Won means the deposit has been received. Won deals become read-only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="won-payment-status">Payment status *</Label>
          <Select value={status} onValueChange={v => setStatus(v as DealPaymentStatus)}>
            <SelectTrigger id="won-payment-status"><SelectValue placeholder="Select payment status" /></SelectTrigger>
            <SelectContent>
              {WON_PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{DEAL_PAYMENT_STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button disabled={!status || busy} onClick={() => status && onConfirm(status)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark Won'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
