'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { LEAD_LOST_REASONS, LEAD_LOST_REASON_LABEL, type LeadLostReason } from '@/lib/lead-pipeline'

// Asked before a lead moves to CLOSED_LOST — the stage API refuses the move without a reason.
export default function LostReasonDialog({ open, leadName, busy, onCancel, onConfirm }: {
  open: boolean
  leadName?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (reason: LeadLostReason, note: string) => void
}) {
  const [reason, setReason] = useState<LeadLostReason | ''>('')
  const [note, setNote] = useState('')

  useEffect(() => { if (open) { setReason(''); setNote('') } }, [open])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Closed Lost{leadName ? ` — ${leadName}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={v => setReason(v as LeadLostReason)}>
              <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {LEAD_LOST_REASONS.map(r => <SelectItem key={r} value={r}>{LEAD_LOST_REASON_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional details" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={!reason || busy} onClick={() => reason && onConfirm(reason, note)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
