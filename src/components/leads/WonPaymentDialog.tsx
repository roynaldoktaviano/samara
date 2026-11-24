'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { DEAL_PAYMENT_STATUS_LABEL, WON_PAYMENT_STATUSES, type DealPaymentStatus } from '@/lib/lead-pipeline'

export const WON_CURRENCY_OPTIONS = ['USD', 'IDR', 'EUR'] as const
export interface WonDetails { paymentStatus: DealPaymentStatus; amount: number; currency: string }

// Asked before a deal moves to Won by hand — Won means the deposit (DP) is in, and the stage API
// refuses the move without a payment status (go-live parity C3) or without an amount above 0 in
// its original currency (marketing audit 2026-11-24).
export default function WonPaymentDialog({ open, dealName, amount, currency, busy, onCancel, onConfirm }: {
  open: boolean
  dealName?: string
  amount?: number | null
  currency?: string | null
  busy?: boolean
  onCancel: () => void
  onConfirm: (won: WonDetails) => void
}) {
  const [status, setStatus] = useState<DealPaymentStatus | ''>('')
  const [amt, setAmt] = useState('')
  const [cur, setCur] = useState('USD')

  useEffect(() => {
    if (!open) return
    setStatus('')
    setAmt(amount && amount > 0 ? String(amount) : '')
    setCur(currency && (WON_CURRENCY_OPTIONS as readonly string[]).includes(currency) ? currency : 'USD')
  }, [open, amount, currency])

  const n = Number(amt)
  const amountOk = amt.trim() !== '' && Number.isFinite(n) && n > 0

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Won{dealName ? ` — ${dealName}` : ''}</DialogTitle>
          <DialogDescription>Won means the deposit has been received. Won deals become read-only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="won-payment-status">Payment status *</Label>
            <Select value={status} onValueChange={v => setStatus(v as DealPaymentStatus)}>
              <SelectTrigger id="won-payment-status"><SelectValue placeholder="Select payment status" /></SelectTrigger>
              <SelectContent>
                {WON_PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{DEAL_PAYMENT_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="won-amount">Deal amount *</Label>
            <div className="flex items-center gap-2">
              <Input id="won-amount" type="number" min={0} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} placeholder="e.g. 25000" className="min-w-0" />
              <Select value={cur} onValueChange={setCur}>
                <SelectTrigger aria-label="Currency" className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WON_CURRENCY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">The agreed trip price in the currency the guest pays.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button disabled={!status || !amountOk || busy} onClick={() => status && amountOk && onConfirm({ paymentStatus: status, amount: n, currency: cur })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark Won'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
