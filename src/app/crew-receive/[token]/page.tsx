'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Camera, CheckCircle2, Loader2 } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'

interface TransferItem { itemId: string | null; itemName: string; dispatchedQty: number }
interface TransferData {
  id: string; transferNumber: string; status: string
  receivedByName: string | null; receivedAt: string | null
  fromLocation: { name: string }; toLocation: { name: string }
  items: TransferItem[]
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
    if (!receiverName.trim()) { setSubmitError('Nama penerima wajib diisi'); return }
    if (!photo) { setSubmitError('Foto wajib diupload'); return }
    setSubmitting(true); setSubmitError('')
    const res = await fetch(`/api/crew-receive/${token}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedByName: receiverName.trim(), receivePhotoKey: photo }),
    })
    const data = await res.json()
    if (!res.ok) { setSubmitError(data.error ?? 'Gagal menyimpan'); setSubmitting(false); return }
    setSubmitting(false); setDone(true)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <img src={LOGO} alt="Samara" className="w-14 h-14 opacity-60 animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Memuat...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <img src={LOGO} alt="Samara" className="w-16 h-16 mx-auto mb-4 opacity-70" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {error === 'This link has expired' ? 'Link Sudah Kadaluarsa' : 'Link Tidak Valid'}
        </h1>
        <p className="text-gray-500 text-sm">
          {error === 'This link has expired'
            ? 'Link ini sudah kadaluarsa. Hubungi tim purchasing untuk link baru.'
            : 'Link ini tidak valid. Periksa kembali link yang dikirim, atau hubungi tim purchasing.'}
        </p>
      </div>
    </div>
  )

  if (!transfer) return null

  if (transfer.status === 'RECEIVED' || done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">Sudah Dikonfirmasi</h1>
        <p className="text-gray-600 text-sm">
          {transfer.transferNumber} diterima oleh{' '}
          <span className="font-medium">{done ? receiverName.trim() : transfer.receivedByName}</span>
          {!done && transfer.receivedAt && (
            <> pada {new Date(transfer.receivedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</>
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
          <h1 className="text-lg font-bold text-gray-900">Konfirmasi Penerimaan Barang</h1>
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
            <label className="text-sm font-semibold text-gray-900">Diterima oleh</label>
            <input
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Nama kamu"
              value={receiverName}
              onChange={e => setReceiverName(e.target.value)}
            />
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }} />

          {photo ? (
            <div className="space-y-2">
              <img src={photo} alt="Bukti penerimaan" className="w-full rounded-xl object-cover max-h-64 border" />
              <button onClick={() => { setPhoto(null); fileInputRef.current?.click() }}
                className="w-full py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50 transition-colors">
                Ganti foto
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
                <p className="font-medium text-sm">{isDragging ? 'Lepas untuk upload' : 'Ambil atau upload foto'}</p>
                <p className="text-xs mt-0.5">Foto barang saat diterima</p>
              </div>
            </button>
          )}
        </div>

        <button onClick={submit} disabled={submitting}
          className="w-full py-3.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
          {submitting ? 'Menyimpan...' : 'Konfirmasi Diterima'}
        </button>
      </div>
    </div>
  )
}
