'use client'

import { useState, useEffect } from 'react'
import { X, KeyRound, Copy, Check } from 'lucide-react'
import { cashierSlug } from '@/lib/cashier-slug'

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
  const inp = 'w-full h-10 border rounded-md px-3 text-center tracking-[0.4em] font-mono text-lg focus:outline-none focus:ring-1 focus:ring-amber-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-600" /> Cashier PIN — {yacht.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Cashier link for this yacht</p>
            <div className="flex items-center gap-2">
              <code className="text-xs flex-1 truncate">{link}</code>
              <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="p-1 hover:bg-muted rounded" title="Copy">
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {status == null ? 'Loading…' : status.isSet
              ? `PIN set${status.pinSetAt ? ` on ${new Date(status.pinSetAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}. Setting a new one signs every open terminal of this yacht out.`
              : 'No PIN yet — the cashier for this yacht cannot be opened until you set one.'}
          </p>
          {done && <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2">PIN saved.</div>}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New PIN (4–6 digits)</label>
            <input className={inp} inputMode="numeric" type="password" value={pin} onChange={e => { setPin(digits(e.target.value)); setDone(false) }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm PIN</label>
            <input className={inp} inputMode="numeric" type="password" value={confirm} onChange={e => setConfirm(digits(e.target.value))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Close</button>
          <button onClick={save} disabled={saving || !pin} className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : status?.isSet ? 'Reset PIN' : 'Set PIN'}
          </button>
        </div>
      </div>
    </div>
  )
}
