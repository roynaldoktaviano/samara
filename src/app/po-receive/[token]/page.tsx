'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Camera, CheckCircle2, Loader2, Search, ChevronDown } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'

interface OrderItem { id: string; itemId: string | null; itemName: string; unit: string | null; orderedQty: number; receivedQty: number; remaining: number }
interface Employee { id: string; fullName: string }
interface OrderData {
  id: string; poNumber: string; supplierName: string | null; status: string
  locationName: string | null
  items: OrderItem[]
  employees: Employee[]
}

// No-login page yacht crew open via a per-PO link (sent outside the ERP, e.g. WhatsApp) to
// confirm they received a PO's goods — see src/app/api/po-receive/[token]/route.ts and the
// "Get Receive Link" button in OrdersPage.tsx. Mirrors src/app/crew-receive/[token]/page.tsx's
// minimal mobile-first UX, with two differences: an employee picker instead of free-text name
// (attribution must come from Employee data), and editable per-item received quantities since a
// PO can be received in partial batches, unlike a stock transfer's all-or-nothing confirmation.
export default function PoReceivePage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<OrderData | null>(null)

  const [employeeId, setEmployeeId] = useState('')
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isDragging, dropProps } = useFileDrop(files => { if (files[0]) handlePhotoFile(files[0]) })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/po-receive/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error ?? 'Failed to load'); return }
        setOrder(data)
        const initialQtys: Record<string, string> = {}
        for (const it of data.items as OrderItem[]) initialQtys[it.id] = it.remaining > 0 ? String(it.remaining) : ''
        setQtys(initialQtys)
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [token])

  function handlePhotoFile(file: File) {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      const MAX = 1200
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      setPhoto(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = URL.createObjectURL(file)
  }

  async function submit() {
    if (!employeeId) { setSubmitError('Receiver name is required'); return }
    if (!photo) { setSubmitError('Photo is required'); return }
    const items = (order?.items ?? [])
      .map(it => ({ poItemId: it.id, itemId: it.itemId, itemName: it.itemName, unit: it.unit ?? undefined, receivedQty: Number(qtys[it.id]) || 0 }))
      .filter(it => it.receivedQty > 0)
    if (!items.length) { setSubmitError('Enter the quantity of items received'); return }

    setSubmitting(true); setSubmitError('')
    const res = await fetch(`/api/po-receive/${token}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedByEmployeeId: employeeId, receivePhotoKey: photo, items }),
    })
    const data = await res.json()
    if (!res.ok) { setSubmitError(data.error ?? 'Failed to save'); setSubmitting(false); return }
    setSubmitting(false); setDone(true)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <img src={LOGO} alt="Samara" className="w-14 h-14 opacity-60 animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <img src={LOGO} alt="Samara" className="w-16 h-16 mx-auto mb-4 opacity-70" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {error === 'This link has expired' ? 'Link Expired' : 'Invalid Link'}
        </h1>
        <p className="text-gray-500 text-sm">
          {error === 'This link has expired'
            ? 'This link has expired. Contact the purchasing team for a new link.'
            : 'This link is invalid. Double-check the link you were sent, or contact the purchasing team.'}
        </p>
      </div>
    </div>
  )

  if (!order) return null

  if (order.status === 'RECEIVED' || done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">Already Confirmed</h1>
        <p className="text-gray-600 text-sm">
          {order.poNumber} has been received
          {done && (
            <> by <span className="font-medium">{order.employees.find(e => e.id === employeeId)?.fullName}</span></>
          )}
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-md mx-auto px-4 pt-8">
        <div className="text-center mb-6">
          <img src={LOGO} alt="Samara" className="w-12 h-12 mx-auto mb-2 opacity-80" />
          <h1 className="text-lg font-bold text-gray-900">Confirm PO Goods Receipt</h1>
          <p className="text-sm text-gray-500 mt-1">{order.poNumber}{order.supplierName ? ` — ${order.supplierName}` : ''}</p>
        </div>

        <div className="bg-white rounded-2xl border p-4 mb-4">
          {order.locationName && (
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="text-gray-500">Received at</span>
              <span className="font-medium text-gray-900">{order.locationName}</span>
            </div>
          )}
          <div className="divide-y">
            {order.items.map(it => (
              <div key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-700 truncate">{it.itemName}</p>
                  <p className="text-xs text-gray-400">Ordered {it.orderedQty}{it.unit ? ` ${it.unit}` : ''} · Remaining {it.remaining}{it.unit ? ` ${it.unit}` : ''}</p>
                </div>
                <input
                  type="number" min={0} step="any"
                  aria-label={`Received quantity for ${it.itemName}`}
                  className="w-20 shrink-0 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-success"
                  value={qtys[it.id] ?? ''}
                  onChange={e => setQtys(q => ({ ...q, [it.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4 mb-4 space-y-4">
          {submitError && <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">{submitError}</div>}

          <div className="space-y-1.5 relative">
            <label htmlFor="po-receive-received-by" className="text-sm font-semibold text-gray-900">Received by</label>
            <button id="po-receive-received-by" type="button" onClick={() => { setEmployeeOpen(o => !o); setEmployeeSearch('') }}
              aria-haspopup="listbox" aria-expanded={employeeOpen}
              className="w-full border rounded-xl px-3 py-2.5 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-2 focus:ring-success transition-colors">
              <span className={employeeId ? 'text-gray-900' : 'text-gray-400'}>
                {order.employees.find(e => e.id === employeeId)?.fullName ?? 'Select your name'}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>
            {employeeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setEmployeeOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-xl z-50 max-h-64 flex flex-col overflow-hidden">
                  <div className="p-2 border-b shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <input autoFocus aria-label="Search name" className="w-full h-9 border rounded-lg px-2.5 pl-8 text-sm focus:outline-none focus:ring-2 focus:ring-success"
                        placeholder="Search name…" value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="overflow-y-auto">
                    {(() => {
                      const q = employeeSearch.trim().toLowerCase()
                      const opts = q ? order.employees.filter(e => e.fullName.toLowerCase().includes(q)) : order.employees
                      if (!opts.length) return <p className="px-3 py-3 text-sm text-gray-400">No names found</p>
                      return opts.map(emp => (
                        <button key={emp.id} type="button" onClick={() => { setEmployeeId(emp.id); setEmployeeOpen(false); setEmployeeSearch('') }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-success/10 transition-colors">
                          {emp.fullName}
                        </button>
                      ))
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Upload receipt photo"
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }} />

          {photo ? (
            <div className="space-y-2">
              <img src={photo} alt="Proof of receipt" className="w-full rounded-xl object-cover max-h-64 border" />
              <button onClick={() => { setPhoto(null); fileInputRef.current?.click() }}
                className="w-full py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50 transition-colors">
                Change photo
              </button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} {...dropProps}
              className={`w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 transition-colors ${
                isDragging ? 'border-success bg-success/10 text-success' : 'text-gray-500 hover:border-success hover:text-success'
              }`}>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <Camera className="h-6 w-6 text-success" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">{isDragging ? 'Drop to upload' : 'Take or upload a photo'}</p>
                <p className="text-xs mt-0.5">Photo of the items on receipt</p>
              </div>
            </button>
          )}
        </div>

        <button onClick={submit} disabled={submitting}
          className="w-full py-3.5 bg-success text-success-foreground rounded-xl font-semibold hover:bg-success/90 disabled:opacity-40 transition-colors">
          {submitting ? 'Saving…' : 'Confirm Received'}
        </button>
      </div>
    </div>
  )
}
