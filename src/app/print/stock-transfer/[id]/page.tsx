'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface TransferItem {
  id: string
  itemName: string
  baseUnit: string | null
  purchaseUnit: string | null
  conversionFactor: number
  requestedQty: number
  dispatchedQty: number
}
interface TransferDetail {
  id: string
  transferNumber: string
  fromLocation: { name: string } | null
  toLocation: { name: string } | null
  items: TransferItem[]
}
interface Row {
  id: string
  description: string
  qty: string
  vesselPic: string
  box: number
}

const ACCENT = '#bdac7e'

function formatQty(it: TransferItem): string {
  const qty = it.dispatchedQty > 0 ? it.dispatchedQty : it.requestedQty
  const hasPU = !!(it.purchaseUnit && it.purchaseUnit !== it.baseUnit && it.conversionFactor > 1)
  if (hasPU && qty % it.conversionFactor === 0) {
    return `${qty / it.conversionFactor}${it.purchaseUnit ? ' ' + it.purchaseUnit : ''}`
  }
  return `${qty}${it.baseUnit ? ' ' + it.baseUnit : ''}`
}

let rowSeq = 0
function newRowId() { return `row-${Date.now()}-${rowSeq++}` }

export default function StockTransferPackingListPage() {
  const { id } = useParams<{ id: string }>()
  const [transfer, setTransfer] = useState<TransferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [bulkVesselPic, setBulkVesselPic] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/purchasing/transfers/${id}`)
      const data = res.ok ? await res.json() : null
      setTransfer(data)
      if (data) {
        const defaultVesselPic = data.toLocation?.name ?? ''
        setRows(data.items.map((it: TransferItem) => ({
          id: it.id, description: it.itemName, qty: formatQty(it), vesselPic: defaultVesselPic, box: 1,
        })))
        setBulkVesselPic(defaultVesselPic)
        document.title = `Packing List - ${data.transferNumber}`
      }
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  function updateRow(rowId: string, field: keyof Row, value: string | number) {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, [field]: value } : r))
  }
  function removeRow(rowId: string) {
    setRows(rs => rs.filter(r => r.id !== rowId))
  }
  function addRow(box: number) {
    setRows(rs => [...rs, { id: newRowId(), description: '', qty: '', vesselPic: bulkVesselPic, box }])
  }
  function addBox() {
    const nextBox = rows.length ? Math.max(...rows.map(r => r.box)) + 1 : 1
    addRow(nextBox)
  }
  function applyBulkVesselPic() {
    setRows(rs => rs.map(r => ({ ...r, vesselPic: bulkVesselPic })))
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading transfer…</div>
  )
  if (!transfer) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Transfer not found.</div>
  )

  const boxNumbers = Array.from(new Set(rows.map(r => r.box))).sort((a, b) => a - b)

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
        {/* Toolbar — editing only, never printed */}
        <div className="print:hidden mb-6 space-y-3 border-b pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold">Packing List — {transfer.transferNumber}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {transfer.fromLocation?.name ?? '—'} → {transfer.toLocation?.name ?? '—'} · atur box &amp; isi sebelum print
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addBox} className="px-3 py-2 text-sm border rounded-md hover:bg-gray-50">+ Box Baru</button>
              <button onClick={() => window.print()} className="px-4 py-2 text-sm rounded-md text-white font-medium" style={{ backgroundColor: ACCENT }}>
                🖨 Print / Save as PDF
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Isi semua Vessel/PIC:</span>
            <input value={bulkVesselPic} onChange={e => setBulkVesselPic(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-40" placeholder="mis. OTIUM" />
            <button onClick={applyBulkVesselPic} className="text-xs px-2.5 py-1 border rounded-md hover:bg-gray-50">Terapkan ke semua</button>
          </div>
        </div>

        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Judul dokumen (mis. Titip Ibu Fresa)"
          className="w-full text-center text-2xl font-bold underline decoration-2 underline-offset-4 mb-8 outline-none border-0 bg-transparent placeholder:no-underline placeholder:text-gray-300 placeholder:font-normal"
        />

        {boxNumbers.length === 0 && (
          <div className="print:hidden text-center text-sm text-gray-400 py-10">
            Tidak ada item. <button onClick={() => addRow(1)} className="underline" style={{ color: ACCENT }}>+ Tambah baris</button>
          </div>
        )}

        {boxNumbers.map(boxNum => {
          const boxRows = rows.filter(r => r.box === boxNum)
          return (
            <div key={boxNum} className="mb-10" style={{ breakInside: 'avoid' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold underline underline-offset-4">Daftar Barang</h2>
                  <p className="italic text-sm mt-0.5">Packing List</p>
                </div>
                <div className="border border-black text-center" style={{ width: 72 }}>
                  <div className="text-xs font-semibold border-b border-black py-0.5">BOX</div>
                  <div className="text-2xl font-bold py-1">{boxNum}</div>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-sm">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 w-10">No</th>
                    <th className="border border-black px-2 py-1 text-left">Description</th>
                    <th className="border border-black px-2 py-1 w-24">Qty</th>
                    <th className="border border-black px-2 py-1 w-32">Vessel / PIC</th>
                    <th className="border border-black px-2 py-1 w-16 print:hidden">Box</th>
                    <th className="border border-black px-2 py-1 w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {boxRows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
                      <td className="border border-black px-2 py-1">
                        <input value={r.description} onChange={e => updateRow(r.id, 'description', e.target.value)}
                          className="w-full outline-none border-0 bg-transparent" />
                      </td>
                      <td className="border border-black px-2 py-1 text-center">
                        <input value={r.qty} onChange={e => updateRow(r.id, 'qty', e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-center" />
                      </td>
                      <td className="border border-black px-2 py-1 text-center">
                        <input value={r.vesselPic} onChange={e => updateRow(r.id, 'vesselPic', e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-center" />
                      </td>
                      <td className="border border-black px-1 py-1 print:hidden">
                        <input type="number" min={1} value={r.box}
                          onChange={e => updateRow(r.id, 'box', Math.max(1, Number(e.target.value) || 1))}
                          className="w-full outline-none border-0 bg-transparent text-center" />
                      </td>
                      <td className="border border-black px-1 py-1 text-center print:hidden">
                        <button onClick={() => removeRow(r.id)} className="text-red-500 hover:text-red-700">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="print:hidden mt-1.5">
                <button onClick={() => addRow(boxNum)} className="text-xs hover:underline" style={{ color: ACCENT }}>+ Tambah baris di Box {boxNum}</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
