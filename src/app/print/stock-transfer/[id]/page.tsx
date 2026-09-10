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
  orderedByEmployeeId: string | null
  orderedByEmployee: { id: string; fullName: string } | null
}
interface TransferDetail {
  id: string
  transferNumber: string
  status: string
  fromLocation: { name: string } | null
  toLocation: { name: string } | null
  items: TransferItem[]
  departAt: string | null
  etaAt: string | null
  cargoName: string | null
}
interface Row {
  id: string
  description: string
  qty: string
  vesselPic: string
  box: number
  // Rows sourced from the inventory picker mirror a real StockTransferItem (id is that
  // item's real id) — a manual/free-text row has none, it only ever exists on this
  // printout and never touches the transfer's actual item list.
  linked: boolean
  orderedByEmployeeId: string
  orderedByName: string
}
interface CatalogItem {
  id: string
  name: string
  sku: string
  baseUnit: string | null
  purchaseUnit: string | null
  conversionFactor: number
}
interface EmployeeOption {
  id: string
  fullName: string
  employeeNumber: string
  department: string | null
  office: string | null
}

const ACCENT = '#bdac7e'

function formatQtyValue(qty: number, baseUnit: string | null, purchaseUnit: string | null, conversionFactor: number): string {
  const hasPU = !!(purchaseUnit && purchaseUnit !== baseUnit && conversionFactor > 1)
  if (hasPU && qty % conversionFactor === 0) {
    return `${qty / conversionFactor}${purchaseUnit ? ' ' + purchaseUnit : ''}`
  }
  return `${qty}${baseUnit ? ' ' + baseUnit : ''}`
}
function formatQty(it: TransferItem): string {
  const qty = it.dispatchedQty > 0 ? it.dispatchedQty : it.requestedQty
  return formatQtyValue(qty, it.baseUnit, it.purchaseUnit, it.conversionFactor)
}
// yyyy-mm-dd for <input type="date">
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}
function fmtDateID(dateInputValue: string): string {
  if (!dateInputValue) return ''
  const d = new Date(dateInputValue + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
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
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])

  // Shipping info — one cargo booking covers the whole transfer, so this lives on the
  // StockTransfer itself (not per box/row) and is saved back via PATCH action
  // 'update-shipping' as soon as it's edited.
  const [departAt, setDepartAt] = useState('')
  const [etaAt, setEtaAt] = useState('')
  const [cargoName, setCargoName] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/purchasing/transfers/${id}`)
      const data = res.ok ? await res.json() : null
      setTransfer(data)
      if (data) {
        const defaultVesselPic = data.toLocation?.name ?? ''
        setRows(data.items.map((it: TransferItem) => ({
          id: it.id, description: it.itemName, qty: formatQty(it), vesselPic: defaultVesselPic, box: 1, linked: true,
          orderedByEmployeeId: it.orderedByEmployeeId ?? '', orderedByName: it.orderedByEmployee?.fullName ?? '',
        })))
        setBulkVesselPic(defaultVesselPic)
        setDepartAt(toDateInputValue(data.departAt))
        setEtaAt(toDateInputValue(data.etaAt))
        setCargoName(data.cargoName ?? '')
        document.title = `Packing List - ${data.transferNumber}`
      }
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetch('/api/purchasing/items').then(r => r.ok ? r.json() : []).then((items: CatalogItem[]) => setCatalog(items)).catch(() => {})
    fetch('/api/purchasing/employees').then(r => r.ok ? r.json() : []).then((emps: EmployeeOption[]) => setEmployees(emps)).catch(() => {})
  }, [])

  function updateRow(rowId: string, field: keyof Row, value: string | number) {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, [field]: value } : r))
  }
  function removeRow(rowId: string) {
    setRows(rs => rs.filter(r => r.id !== rowId))
  }
  // Manual/free-text row — print-only, never touches the actual Transfer.
  function addManualRow(box: number) {
    setRows(rs => [...rs, { id: newRowId(), description: '', qty: '', vesselPic: bulkVesselPic, box, linked: false, orderedByEmployeeId: '', orderedByName: '' }])
  }
  // Picked from the inventory catalog — actually creates a StockTransferItem on this
  // transfer (only while it's still PENDING, see the API route), so it also shows up in
  // the real Transfer's item list everywhere else (dispatch, receive, reporting).
  async function addCatalogRow(box: number, item: CatalogItem, qty: number): Promise<string | null> {
    const res = await fetch(`/api/purchasing/transfers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add-item', itemId: item.id, qty }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return data?.error ?? 'Gagal menambah barang'
    // The item was already on this transfer — the API bumped its requestedQty instead of
    // creating a second row for it. Drop any row(s) already showing that item locally and
    // add one fresh row (in the box just picked) with the new running total, so the
    // printout and the real total stay in sync instead of double-counting.
    const merged = res.status === 200
    setRows(rs => [
      ...(merged ? rs.filter(r => r.id !== data.id) : rs),
      { id: data.id, description: item.name, qty: formatQtyValue(data.requestedQty, item.baseUnit, item.purchaseUnit, item.conversionFactor), vesselPic: bulkVesselPic, box, linked: true, orderedByEmployeeId: '', orderedByName: '' },
    ])
    setTransfer(t => {
      if (!t) return t
      const items = merged
        ? t.items.map(i => i.id === data.id ? { ...i, requestedQty: data.requestedQty } : i)
        : [...t.items, { id: data.id, itemName: item.name, baseUnit: item.baseUnit, purchaseUnit: item.purchaseUnit, conversionFactor: item.conversionFactor, requestedQty: data.requestedQty, dispatchedQty: 0, orderedByEmployeeId: null, orderedByEmployee: null }]
      return { ...t, items }
    })
    return null
  }
  function addBox() {
    const nextBox = rows.length ? Math.max(...rows.map(r => r.box)) + 1 : 1
    addManualRow(nextBox)
  }
  function applyBulkVesselPic() {
    setRows(rs => rs.map(r => ({ ...r, vesselPic: bulkVesselPic })))
  }

  function saveShipping(patch: { departAt?: string; etaAt?: string; cargoName?: string }) {
    const next = { departAt, etaAt, cargoName, ...patch }
    fetch(`/api/purchasing/transfers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-shipping', departAt: next.departAt || null, etaAt: next.etaAt || null, cargoName: next.cargoName || null }),
    }).catch(() => {})
  }

  // Only a linked row (real StockTransferItem) can persist who ordered it — a manual
  // row's pick stays local to this printout, same as its description/qty already do.
  function setRowOrderedBy(row: Row, employee: EmployeeOption | null) {
    updateRow(row.id, 'orderedByEmployeeId', employee?.id ?? '')
    updateRow(row.id, 'orderedByName', employee?.fullName ?? '')
    if (row.linked) {
      fetch(`/api/purchasing/transfers/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-item-ordered-by', itemId: row.id, orderedByEmployeeId: employee?.id ?? null }),
      }).catch(() => {})
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading transfer…</div>
  )
  if (!transfer) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Transfer not found.</div>
  )

  const boxNumbers = Array.from(new Set(rows.map(r => r.box))).sort((a, b) => a - b)
  const etaLabel = `ETA${transfer.toLocation?.name ? ` ${transfer.toLocation.name}` : ''}`

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
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Depart on
              <input type="date" value={departAt} onChange={e => { setDepartAt(e.target.value); saveShipping({ departAt: e.target.value }) }}
                className="border rounded px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              {etaLabel}
              <input type="date" value={etaAt} onChange={e => { setEtaAt(e.target.value); saveShipping({ etaAt: e.target.value }) }}
                className="border rounded px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Cargo
              <input value={cargoName} onChange={e => setCargoName(e.target.value)} onBlur={() => saveShipping({ cargoName })}
                className="border rounded px-2 py-1 text-sm w-40" placeholder="mis. BINTANG TIMUR" />
            </label>
          </div>
        </div>

        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Judul dokumen (mis. Titip Ibu Fresa)"
          className="w-full text-center text-2xl font-bold underline decoration-2 underline-offset-4 mb-8 outline-none border-0 bg-transparent placeholder:no-underline placeholder:text-gray-300 placeholder:font-normal"
        />

        {boxNumbers.length === 0 && (
          <div className="print:hidden text-center py-10">
            <p className="text-sm text-gray-400 mb-2">Tidak ada item.</p>
            <div className="flex justify-center">
              <AddRowControl box={1} pending={transfer.status === 'PENDING'} catalog={catalog}
                onAddCatalog={addCatalogRow} onAddManual={addManualRow} />
            </div>
          </div>
        )}

        {boxNumbers.map(boxNum => {
          const boxRows = rows.filter(r => r.box === boxNum)
          return (
            <div key={boxNum} className="mb-10" style={{ breakInside: 'avoid' }}>
              <div className="flex items-start justify-between mb-3 gap-4">
                <div>
                  <h2 className="text-xl font-bold underline underline-offset-4">Daftar Barang</h2>
                  <p className="italic text-sm mt-0.5">Packing List</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-right space-y-0.5">
                    <p><span className="text-gray-500">Depart on</span>&nbsp;&nbsp;: {fmtDateID(departAt) || '—'}</p>
                    <p><span className="text-gray-500">{etaLabel}</span>&nbsp;&nbsp;: {fmtDateID(etaAt) || '—'}</p>
                    <p><span className="text-gray-500">Cargo</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {cargoName || '—'}</p>
                  </div>
                  <div className="border border-black text-center" style={{ width: 72 }}>
                    <div className="text-xs font-semibold border-b border-black py-0.5">BOX</div>
                    <div className="text-2xl font-bold py-1">{boxNum}</div>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-sm">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 w-10">No</th>
                    <th className="border border-black px-2 py-1 text-left">Description</th>
                    <th className="border border-black px-2 py-1 w-24">Qty</th>
                    <th className="border border-black px-2 py-1 w-32">Vessel / PIC</th>
                    <th className="border border-black px-2 py-1 w-32">Ordered by</th>
                    <th className="border border-black px-2 py-1 w-16 print:hidden">Box</th>
                    <th className="border border-black px-2 py-1 w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {boxRows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
                      <td className="border border-black px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <input value={r.description} onChange={e => updateRow(r.id, 'description', e.target.value)}
                            className="w-full outline-none border-0 bg-transparent" />
                          {r.linked && (
                            <span className="print:hidden shrink-0 text-[9px] px-1 py-0.5 rounded border text-gray-500" title="Terhubung ke item Transfer ini">
                              inv
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border border-black px-2 py-1 text-center">
                        <input value={r.qty} onChange={e => updateRow(r.id, 'qty', e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-center" />
                      </td>
                      <td className="border border-black px-2 py-1 text-center">
                        <input value={r.vesselPic} onChange={e => updateRow(r.id, 'vesselPic', e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-center" />
                      </td>
                      <td className="border border-black px-2 py-1 text-center">
                        <OrderedByPicker row={r} employees={employees} onPick={emp => setRowOrderedBy(r, emp)} />
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
              <AddRowControl box={boxNum} pending={transfer.status === 'PENDING'} catalog={catalog}
                onAddCatalog={addCatalogRow} onAddManual={addManualRow} />
            </div>
          )
        })}
      </div>
    </>
  )
}

// Searchable employee picker for a single "Ordered by" table cell — on screen it's a
// small button that opens a search+list popover (print:hidden); the printed output is
// just the plain resolved name, same convention as the rest of this page's inputs.
function OrderedByPicker({ row, employees, onPick }: {
  row: Row
  employees: EmployeeOption[]
  onPick: (employee: EmployeeOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = (q ? employees.filter(e => e.fullName.toLowerCase().includes(q)) : employees).slice(0, 30)

  return (
    <div className="relative">
      <span className="hidden print:inline">{row.orderedByName}</span>
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className={`print:hidden w-full text-left ${row.orderedByName ? '' : 'text-gray-300'}`}>
        {row.orderedByName || 'Pilih...'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 print:hidden" onClick={() => setOpen(false)} />
          <div className="print:hidden absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 w-56 max-h-56 flex flex-col text-left">
            <div className="p-1.5 border-b shrink-0">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari karyawan..."
                className="w-full h-7 border rounded px-2 text-xs focus:outline-none" />
            </div>
            <div className="overflow-y-auto">
              {row.orderedByEmployeeId && (
                <button type="button" onClick={() => { onPick(null); setOpen(false) }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-b">
                  Clear
                </button>
              )}
              {opts.length === 0 && <p className="px-2.5 py-2 text-xs text-gray-400">Tidak ada karyawan cocok.</p>}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onPick(e); setOpen(false) }}
                  className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-50">
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

// Adding a row can either search & pick a real catalog item (persisted onto the actual
// Transfer, only while it's still PENDING) or fall back to a manual/free-text row that
// only ever exists on this printout (for non-inventory notes like packaging or a
// personal favor — see the description field on Row).
function AddRowControl({ box, pending, catalog, onAddCatalog, onAddManual }: {
  box: number
  pending: boolean
  catalog: CatalogItem[]
  onAddCatalog: (box: number, item: CatalogItem, qty: number) => Promise<string | null>
  onAddManual: (box: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<CatalogItem | null>(null)
  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const q = search.trim().toLowerCase()
  const matches = (q ? catalog.filter(c => c.name.toLowerCase().includes(q) || c.sku?.toLowerCase().includes(q)) : catalog).slice(0, 30)

  function reset() { setOpen(false); setSearch(''); setPicked(null); setQty('1'); setError('') }

  async function confirmAdd() {
    if (!picked) return
    const n = Number(qty)
    if (!Number.isFinite(n) || n <= 0) { setError('Qty harus lebih dari 0'); return }
    setSaving(true)
    const err = await onAddCatalog(box, picked, n)
    setSaving(false)
    if (err) { setError(err); return }
    reset()
  }

  if (!open) {
    return (
      <div className="print:hidden mt-1.5">
        <button onClick={() => setOpen(true)} className="text-xs hover:underline" style={{ color: ACCENT }}>+ Tambah baris di Box {box}</button>
      </div>
    )
  }

  return (
    <div className="print:hidden mt-1.5 border rounded-md p-2.5 space-y-2 max-w-md bg-gray-50/60">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!picked ? (
        <>
          {pending ? (
            <>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari barang di inventory..."
                className="w-full border rounded px-2 py-1 text-xs bg-white" />
              <div className="max-h-40 overflow-y-auto border rounded divide-y bg-white">
                {matches.length === 0 && <p className="text-xs text-gray-400 px-2 py-2">Tidak ada barang cocok.</p>}
                {matches.map(c => (
                  <button key={c.id} onClick={() => setPicked(c)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50">
                    {c.name} <span className="text-gray-400">({c.sku})</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">Transfer ini sudah diproses — baris baru tidak lagi bisa terhubung ke inventory, cuma manual.</p>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => { onAddManual(box); reset() }} className="text-xs underline text-gray-500">+ Baris manual (non-inventory)</button>
            <button onClick={reset} className="text-xs text-gray-400 ml-auto">Batal</button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs flex-1">{picked.name}</span>
          <input type="number" min={0} step="any" value={qty} onChange={e => setQty(e.target.value)}
            className="w-20 border rounded px-2 py-1 text-xs bg-white" placeholder="Qty" />
          <button onClick={confirmAdd} disabled={saving} className="text-xs px-2.5 py-1 rounded text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {saving ? 'Menambah...' : 'Tambah'}
          </button>
          <button onClick={() => setPicked(null)} className="text-xs text-gray-400">Batal</button>
        </div>
      )}
    </div>
  )
}
