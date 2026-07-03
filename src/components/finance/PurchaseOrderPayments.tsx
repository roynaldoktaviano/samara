'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Wallet, X, Camera, Upload, MapPin } from 'lucide-react'

interface PaymentRequest {
  id: string
  amount: number
  notePhotoKey: string
  notes: string | null
  status: string
  paymentMethod: string
  createdAt: string
  paidAt: string | null
  transferProofKey: string | null
  requestedBy: { name: string } | null
  paidBy: { name: string } | null
  order: { poNumber: string; supplierName: string | null; deliveryLocation: { name: string } | null }
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

function PhotoLightbox({ photoKey, onClose }: { photoKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <img src={photoKey} alt="Proof" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
        <button onClick={onClose} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function PurchaseOrderPayments() {
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID'>('PENDING')
  const [selected, setSelected] = useState<PaymentRequest | null>(null)
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)

  // pay modal
  const [payModal, setPayModal] = useState(false)
  const [transferProof, setTransferProof] = useState<string | null>(null)
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/finance/purchase-order-payments')
    const data = await res.json()
    const list: PaymentRequest[] = Array.isArray(data) ? data : []
    setRequests(list)
    setLoading(false)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  function handleProofFile(file: File) {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      const MAX = 1200
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      setTransferProof(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = URL.createObjectURL(file)
  }

  async function confirmPaid() {
    if (!selected || !transferProof) { setPayError('Transfer proof photo is required'); return }
    setPaySaving(true); setPayError('')
    const res = await fetch(`/api/finance/purchase-order-payments/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferProofKey: transferProof }),
    })
    const data = await res.json()
    if (!res.ok) { setPayError(data.error ?? 'Failed'); setPaySaving(false); return }
    setPaySaving(false); setPayModal(false); setTransferProof(null)
    const list = await load()
    setSelected(prev => (prev && list.find(r => r.id === prev.id)) ?? null)
  }

  const filtered = filterStatus === 'ALL' ? requests : requests.filter(r => r.status === filterStatus)
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Purchase Order Payments</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Review payment requests from the purchasing team and confirm transfers.</p>
      </div>

      <div className="flex gap-1.5">
        {([
          ['PENDING', `Waiting for Payment${pendingCount ? ` (${pendingCount})` : ''}`],
          ['PAID', 'Paid'],
          ['ALL', 'All'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilterStatus(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PO No.</th>
              <th className="text-left px-4 py-3 font-medium">Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Requested By</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3.5"><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No payment requests{filterStatus !== 'ALL' ? ` with status "${filterStatus.toLowerCase()}"` : ''}.
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                <td className="px-4 py-3 font-mono text-sm font-medium">{r.order.poNumber}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.order.supplierName ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.order.deliveryLocation ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{r.order.deliveryLocation.name}</span> : '—'}
                </td>
                <td className="px-4 py-3 text-right font-medium">{fmtMoney(r.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.requestedBy?.name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                  </span>
                  {r.paymentMethod === 'CARD' && (
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Debit Paid · no action needed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setSelected(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">{selected.order.poNumber}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{selected.order.supplierName ?? 'No supplier'}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Amount</p>
                    <p className="text-2xl font-bold mt-0.5">{fmtMoney(selected.amount)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${selected.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {selected.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                    </span>
                    {selected.paymentMethod === 'CARD' && (
                      <p className="text-[10px] text-muted-foreground mt-1">Debit Paid · no action needed</p>
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {selected.paymentMethod === 'CARD' ? 'Paid' : 'Requested'} {fmtDate(selected.createdAt)}{selected.requestedBy?.name && ` · by ${selected.requestedBy.name}`}
                </div>

                {selected.paymentMethod === 'CARD' && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-800">
                    Debit Paid directly by the purchasing team. No transfer or approval needed — this is for your records.
                  </div>
                )}

                {selected.notes && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">{selected.notes}</div>
                )}

                <div className={selected.status === 'PAID' && selected.transferProofKey ? 'grid grid-cols-2 gap-4' : ''}>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Receipt / Nota</p>
                    <img src={selected.notePhotoKey} alt="Nota" onClick={() => setViewPhoto(selected.notePhotoKey)}
                      className="w-full max-h-64 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                  </div>

                  {selected.status === 'PAID' && selected.transferProofKey && (
                    <div>
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Transfer Proof</p>
                      <img src={selected.transferProofKey} alt="Transfer proof" onClick={() => setViewPhoto(selected.transferProofKey)}
                        className="w-full max-h-64 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                      <p className="text-xs text-green-700 mt-1.5">
                        Paid {selected.paidAt && fmtDate(selected.paidAt)}{selected.paidBy?.name && ` · by ${selected.paidBy.name}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Close</button>
                {selected.status === 'PENDING' && (
                  <button onClick={() => { setTransferProof(null); setPayError(''); setPayModal(true) }}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors">
                    <Upload className="h-3.5 w-3.5" /> Upload Transfer Proof
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mark as paid modal */}
      {payModal && selected && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]" onClick={() => setPayModal(false)} />
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">Confirm Payment</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{selected.order.poNumber} · {fmtMoney(selected.amount)}</p>
                </div>
                <button onClick={() => setPayModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {payError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{payError}</div>}
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleProofFile(f) }} />
                {transferProof ? (
                  <div className="space-y-2">
                    <img src={transferProof} alt="Transfer proof" className="w-full rounded-xl object-contain bg-muted/20 max-h-56 border" />
                    <button onClick={() => { setTransferProof(null); fileInputRef.current?.click() }}
                      className="w-full py-2 text-sm text-muted-foreground border rounded-lg hover:bg-muted transition-colors">
                      Replace photo
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground hover:border-green-400 hover:text-green-700 transition-colors">
                    <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                      <Camera className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm">Take or upload transfer proof</p>
                      <p className="text-xs mt-0.5">Bank transfer receipt or confirmation screenshot</p>
                    </div>
                  </button>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setPayModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={confirmPaid} disabled={!transferProof || paySaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 font-semibold transition-colors">
                  {paySaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : 'Mark as Paid'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {viewPhoto && <PhotoLightbox photoKey={viewPhoto} onClose={() => setViewPhoto(null)} />}
    </div>
  )
}
