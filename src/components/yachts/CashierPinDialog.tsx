'use client'

import { useState, useEffect } from 'react'
import { KeyRound, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cashierSlug } from '@/lib/cashier-slug'
import { formatDate } from '@/lib/format'

/** Set / reset the PIN crew use to unlock this yacht's cashier terminal (no ERP login there). */
export default function CashierPinDialog({ yacht, onClose }: { yacht: { id: string; name: string }; onClose: () => void }) {
  const [status, setStatus] = useState<{ isSet: boolean; pinSetAt: string | null } | null>(null)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const host = process.env.NEXT_PUBLIC_CASHIER_HOST
  const link = host ? `https://${host}/${cashierSlug(yacht.name)}` : `${typeof window !== 'undefined' ? window.location.origin : ''}/cashier/${cashierSlug(yacht.name)}`

  useEffect(() => {
    fetch(`/api/yachts/${yacht.id}/cashier-pin`).then(r => r.ok ? r.json() : null).then(setStatus)
  }, [yacht.id])

  async function save() {
    setError('')
    if (!/^\d{4,6}$/.test(pin)) { setError('PIN must be 4–6 digits'); return }
    if (pin !== confirm) { setError('PINs do not match'); return }
    setSaving(true)
    const res = await fetch(`/api/yachts/${yacht.id}/cashier-pin`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Failed to save'); return }
    setDone(true); setPin(''); setConfirm('')
    setStatus({ isSet: true, pinSetAt: new Date().toISOString() })
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  const inp = 'h-10 text-center tracking-[0.4em] font-mono text-lg md:text-lg'

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
        <DialogHeader className="px-5 py-4 pr-12 border-b text-left">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary-strong" /> Cashier PIN — {yacht.name}</DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Cashier link for this yacht</p>
            <div className="flex items-center gap-2">
              <code className="text-xs flex-1 truncate">{link}</code>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }} title="Copy" aria-label="Copy cashier link">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {status == null ? 'Loading…' : status.isSet
              ? `PIN set${status.pinSetAt ? ` on ${formatDate(status.pinSetAt, 'datetime')}` : ''}. Setting a new one signs every open terminal of this yacht out.`
              : 'No PIN yet — the cashier for this yacht cannot be opened until you set one.'}
          </p>
          {done && <div className="rounded-lg bg-success/10 border border-success/30 text-success text-sm px-3 py-2">PIN saved.</div>}
          {error && <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">{error}</div>}
          <div className="space-y-1.5">
            <Label htmlFor="cashier-pin-new">New PIN (4–6 digits)</Label>
            <Input id="cashier-pin-new" className={inp} inputMode="numeric" type="password" value={pin} onChange={e => { setPin(digits(e.target.value)); setDone(false) }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cashier-pin-confirm">Confirm PIN</Label>
            <Input id="cashier-pin-confirm" className={inp} inputMode="numeric" type="password" value={confirm} onChange={e => setConfirm(digits(e.target.value))} />
          </div>
        </div>
        <DialogFooter className="px-5 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} loading={saving} disabled={!pin} className="font-semibold">
            {saving ? 'Saving…' : status?.isSet ? 'Reset PIN' : 'Set PIN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
