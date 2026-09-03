'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserX, X, Package, ToggleLeft, ToggleRight, FileText, CheckCircle2, ExternalLink, Search } from 'lucide-react'

interface SeparationRow {
  id: string
  employeeNumber: string
  fullName: string
  department: string | null
  position: string | null
  location: string | null
  joinDate: string | null
  resignedAt: string
  resignStatus: string | null
  resignReason: string | null
  assetsTotal: number
  assetsReturned: number
  clearanceCompletedAt: string | null
  paklaringNumber: string | null
  paklaringIssuedAt: string | null
}

interface AssetDetail {
  id: string
  itemName: string
  category: string | null
  serialNumber: string | null
  condition: string | null
  assignedDate: string
  notes: string | null
  isReturned: boolean
  returnedAt: string | null
}

interface SeparationDetail extends SeparationRow {
  assets: AssetDetail[]
  separation: {
    clearanceCompletedAt: string | null
    clearanceCompletedBy: { name: string | null } | null
    clearanceNotes: string | null
    paklaringNumber: string | null
    paklaringIssuedAt: string | null
    paklaringIssuedBy: { name: string | null } | null
  } | null
}

const RESIGN_STATUS_LABEL: Record<string, string> = {
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
  CONTRACT_ENDED: 'Contract Ended',
  OTHER: 'Other',
}

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function SeparationPage() {
  const [rows, setRows] = useState<SeparationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/hr/separations').then(r => r.ok ? r.json() : []).then(setRows).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const filtered = q ? rows.filter(r => r.fullName.toLowerCase().includes(q) || r.employeeNumber.toLowerCase().includes(q)) : rows

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Separation</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Offboarding checklist for resigned/terminated employees — return company assets and issue their paklaring (surat keterangan kerja).
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or employee number..."
          className="w-full pl-9 pr-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Resigned</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Assets Returned</th>
                <th className="text-center px-4 py-3 font-medium">Clearance</th>
                <th className="text-center px-4 py-3 font-medium">Paklaring</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No separated employees{q ? ' match your search' : ''}.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.fullName}</div>
                    <div className="text-xs text-muted-foreground">{r.employeeNumber}{r.position ? ` · ${r.position}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.resignedAt)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
                      {RESIGN_STATUS_LABEL[r.resignStatus ?? ''] ?? 'Left'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.assetsTotal === 0 ? (
                      <span className="text-muted-foreground/50 text-xs">No assets</span>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.assetsReturned === r.assetsTotal ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {r.assetsReturned}/{r.assetsTotal}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.clearanceCompletedAt ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 inline-block" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.paklaringNumber ? (
                      <span className="text-xs font-medium text-blue-700">Issued</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not issued</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelected(r.id)} className="text-xs font-medium text-[#8a744a] hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <SeparationDetailModal employeeId={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  )
}

function SeparationDetailModal({ employeeId, onClose, onChanged }: { employeeId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<SeparationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingClearance, setSavingClearance] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/hr/separations/${employeeId}`).then(r => r.ok ? r.json() : null).then(d => {
      setData(d)
      setNotes(d?.separation?.clearanceNotes ?? '')
    }).finally(() => setLoading(false))
  }, [employeeId])

  useEffect(() => { load() }, [load])

  async function toggleAssetReturned(asset: AssetDetail) {
    await fetch(`/api/hr/employees/${employeeId}/assets/${asset.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isReturned: !asset.isReturned }),
    })
    load(); onChanged()
  }

  async function toggleClearance(completed: boolean) {
    setSavingClearance(true)
    await fetch(`/api/hr/separations/${employeeId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearanceCompleted: completed, clearanceNotes: notes }),
    })
    setSavingClearance(false)
    load(); onChanged()
  }

  async function saveNotes() {
    setSavingClearance(true)
    await fetch(`/api/hr/separations/${employeeId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearanceNotes: notes }),
    })
    setSavingClearance(false)
    load()
  }

  async function generatePaklaring() {
    setGenerating(true)
    window.open(`/print/paklaring/${employeeId}`, '_blank', 'noopener,noreferrer')
    setTimeout(() => { load(); onChanged(); setGenerating(false) }, 1500)
  }

  const allReturned = data ? data.assets.length === 0 || data.assets.every(a => a.isReturned) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-5 shrink-0" style={{ background: 'linear-gradient(135deg, #bdac7e 0%, #a89860 100%)' }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl"><UserX className="h-5 w-5 text-white" /></div>
              <div>
                <h3 className="font-bold text-white text-lg leading-tight">{data?.fullName ?? 'Loading…'}</h3>
                <p className="text-amber-100 text-xs mt-0.5">{data ? `${data.employeeNumber}${data.position ? ` · ${data.position}` : ''}` : ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {loading || !data ? (
            <div className="text-sm text-muted-foreground text-center py-10">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Resigned:</span> <span className="font-medium">{fmtDate(data.resignedAt)}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{RESIGN_STATUS_LABEL[data.resignStatus ?? ''] ?? 'Left'}</span></div>
                <div><span className="text-muted-foreground">Joined:</span> <span className="font-medium">{fmtDate(data.joinDate)}</span></div>
                <div><span className="text-muted-foreground">Department:</span> <span className="font-medium">{data.department ?? '—'}</span></div>
                {data.resignReason && <div className="col-span-2"><span className="text-muted-foreground">Reason:</span> <span className="font-medium">{data.resignReason}</span></div>}
              </div>

              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Package className="h-4 w-4" /> Company Assets to Return</h4>
                {data.assets.length === 0 ? (
                  <div className="text-sm text-muted-foreground border-2 border-dashed rounded-xl py-5 text-center">No company assets were recorded for this employee.</div>
                ) : (
                  <div className="space-y-2">
                    {data.assets.map(a => (
                      <div key={a.id} className={`border-2 rounded-xl p-3 flex items-center gap-3 ${a.isReturned ? 'border-green-100 bg-green-50/40' : 'border-gray-100'}`}>
                        <button type="button" onClick={() => toggleAssetReturned(a)} className="shrink-0">
                          {a.isReturned ? <ToggleRight className="h-6 w-6 text-green-600" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{a.itemName}</span>
                            {a.category && <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{a.category}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {a.serialNumber && <>S/N {a.serialNumber} · </>}Assigned {fmtDate(a.assignedDate)}
                          </div>
                        </div>
                        <span className={`text-[11px] font-semibold shrink-0 ${a.isReturned ? 'text-green-700' : 'text-amber-700'}`}>
                          {a.isReturned ? `Returned ${fmtDate(a.returnedAt)}` : 'Not returned'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><CheckCircle2 className="h-4 w-4" /> Clearance</h4>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={2} placeholder="Clearance notes (optional)..."
                  className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-2"
                />
                {data.separation?.clearanceCompletedAt ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                    <span className="text-sm text-green-700">
                      Clearance completed {fmtDate(data.separation.clearanceCompletedAt)}{data.separation.clearanceCompletedBy?.name ? ` by ${data.separation.clearanceCompletedBy.name}` : ''}
                    </span>
                    <button onClick={() => toggleClearance(false)} disabled={savingClearance} className="text-xs text-muted-foreground hover:text-foreground underline">Reopen</button>
                  </div>
                ) : (
                  <button onClick={() => toggleClearance(true)} disabled={savingClearance}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border-2 border-dashed hover:border-[#bdac7e] hover:text-foreground text-muted-foreground transition-colors disabled:opacity-50">
                    {!allReturned && <span className="text-amber-600 text-xs">(items still outstanding)</span>}
                    {savingClearance ? 'Saving...' : 'Mark Clearance Complete'}
                  </button>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><FileText className="h-4 w-4" /> Paklaring (Surat Keterangan Kerja)</h4>
                {data.separation?.paklaringNumber ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                    <div className="text-sm">
                      <div className="font-medium text-blue-800">No. {data.separation.paklaringNumber}</div>
                      <div className="text-xs text-blue-600 mt-0.5">Issued {fmtDate(data.separation.paklaringIssuedAt)}</div>
                    </div>
                    <button onClick={generatePaklaring} className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Reprint
                    </button>
                  </div>
                ) : (
                  <button onClick={generatePaklaring} disabled={generating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-[#bdac7e] hover:bg-[#a89860] transition-colors disabled:opacity-50">
                    <FileText className="h-4 w-4" /> {generating ? 'Generating...' : 'Generate Paklaring'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
