'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Camera, CheckCircle2, Loader2, Search, ChevronDown, User } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'

interface TransferItem { itemId: string | null; itemName: string; dispatchedQty: number }
interface EmployeeOption { id: string; fullName: string }
interface TransferData {
  id: string; transferNumber: string; status: string
  receivedByName: string | null; receivedAt: string | null
  fromLocation: { name: string }; toLocation: { name: string }
  items: TransferItem[]
  employees: EmployeeOption[]
}

// Searchable "Received by" picker — a plain <select> doesn't let crew filter a long
// employee list by typing, so this is a lightweight combobox instead (same pattern as
// TripCombobox in RequestsPage.tsx, restyled to match this page's mobile-first look).
function EmployeePicker({ employees, value, onChange }: {
  employees: EmployeeOption[]; value: string; onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? employees.filter(e => e.fullName.toLowerCase().includes(q)) : employees

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full border rounded-xl px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
        <span className={`truncate flex items-center gap-2 ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          <User className="h-4 w-4 shrink-0 text-gray-400" />
          {value || 'Select your name...'}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-xl z-50 max-h-64 flex flex-col overflow-hidden">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input autoFocus className="w-full h-9 border rounded-lg px-2.5 pl-8 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {opts.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No matching name</p>}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onChange(e.fullName); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-green-50 border-b last:border-0 transition-colors">
                  {e.fullName}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// No-login page ship crew open via a per-shipment link (sent outside the ERP, e.g. WhatsApp)
// to confirm they received a shipment — see src/app/api/crew-receive/[token]/route.ts and
// the "Get Crew Link" button in TransfersPage.tsx. Deliberately minimal: no menus, no other
// ERP concepts, one photo + one name + one tap.
export default function CrewReceivePage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transfer, setTransfer] = useState<TransferData | null>(null)

  const [receiverName, setReceiverName] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isDragging, dropProps } = useFileDrop(files => { if (files[0]) handlePhotoFile(files[0]) })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/crew-receive/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error ?? 'Failed to load'); return }
        setTransfer(data)
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
    if (!receiverName.trim()) { setSubmitError('Please select your name'); return }
    if (!photo) { setSubmitError('Photo is required'); return }
    setSubmitting(true); setSubmitError('')
    const res = await fetch(`/api/crew-receive/${token}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedByName: receiverName.trim(), receivePhotoKey: photo }),
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
        <p className="text-sm">Loading...</p>
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
            ? 'This link has expired. Contact the purchasing team for a new one.'
            : 'This link is invalid. Please check the link you were sent, or contact the purchasing team.'}
        </p>
      </div>
    </div>
  )

  if (!transfer) return null

  if (transfer.status === 'RECEIVED' || done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">Confirmed</h1>
        <p className="text-gray-600 text-sm">
          {transfer.transferNumber} received by{' '}
          <span className="font-medium">{done ? receiverName.trim() : transfer.receivedByName}</span>
          {!done && transfer.receivedAt && (
            <> on {new Date(transfer.receivedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</>
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
          <h1 className="text-lg font-bold text-gray-900">Confirm Delivery Receipt</h1>
          <p className="text-sm text-gray-500 mt-1">{transfer.transferNumber}</p>
        </div>

        <div className="bg-white rounded-2xl border p-4 mb-4">
          <div className="flex items-center gap-2 text-sm mb-3">
            <span className="font-medium text-gray-900">{transfer.fromLocation.name}</span>
            <span className="text-gray-400">→</span>
            <span className="font-medium text-gray-900">{transfer.toLocation.name}</span>
          </div>
          <div className="divide-y">
            {transfer.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{it.itemName}</span>
                <span className="text-gray-500">{it.dispatchedQty}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4 mb-4 space-y-4">
          {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{submitError}</div>}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-900">Received by</label>
            <EmployeePicker employees={transfer.employees} value={receiverName} onChange={setReceiverName} />
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
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
                isDragging ? 'border-green-400 bg-green-50 text-green-700' : 'text-gray-500 hover:border-green-400 hover:text-green-700'
              }`}>
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                <Camera className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">{isDragging ? 'Drop to upload' : 'Take or upload photo'}</p>
                <p className="text-xs mt-0.5">Photo of the items on receipt</p>
              </div>
            </button>
          )}
        </div>

        <button onClick={submit} disabled={submitting}
          className="w-full py-3.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
          {submitting ? 'Saving...' : 'Confirm Receipt'}
        </button>
      </div>
    </div>
  )
}
