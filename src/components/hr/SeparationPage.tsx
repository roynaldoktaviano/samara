'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserX, X, Package, ToggleLeft, ToggleRight, FileText, CheckCircle2, ExternalLink, Search } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'

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
          Offboarding checklist for resigned/terminated employees — return company assets and issue their paklaring (certificate of employment).
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or employee number…"
          aria-label="Search by name or employee number" className="pl-9"
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
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.resignedAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone="destructive">
                      {RESIGN_STATUS_LABEL[r.resignStatus ?? ''] ?? 'Left'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.assetsTotal === 0 ? (
                      <span className="text-muted-foreground/50 text-xs">No assets</span>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.assetsReturned === r.assetsTotal ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        {r.assetsReturned}/{r.assetsTotal}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.clearanceCompletedAt ? (
                      <CheckCircle2 className="h-4 w-4 text-success inline-block" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.paklaringNumber ? (
                      <span className="text-xs font-medium text-info">Issued</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not issued</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="link" size="sm" onClick={() => setSelected(r.id)} className="h-auto p-0 text-xs text-primary-strong">
                      View
                    </Button>
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
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent aria-describedby={undefined} showCloseButton={false} className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-5 shrink-0" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)' }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-foreground/20 rounded-xl"><UserX className="h-5 w-5 text-primary-foreground" /></div>
              <div>
                <DialogTitle className="font-bold text-primary-foreground text-lg leading-tight">{data?.fullName ?? 'Loading…'}</DialogTitle>
                <p className="text-primary-foreground/80 text-xs mt-0.5">{data ? `${data.employeeNumber}${data.position ? ` · ${data.position}` : ''}` : ''}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"
              className="size-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/20"><X /></Button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {loading || !data ? (
            <div className="text-sm text-muted-foreground text-center py-10">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Resigned:</span> <span className="font-medium">{formatDate(data.resignedAt)}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{RESIGN_STATUS_LABEL[data.resignStatus ?? ''] ?? 'Left'}</span></div>
                <div><span className="text-muted-foreground">Joined:</span> <span className="font-medium">{formatDate(data.joinDate)}</span></div>
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
                      <div key={a.id} className={`border-2 rounded-xl p-3 flex items-center gap-3 ${a.isReturned ? 'border-success/30 bg-success/5' : 'border-border'}`}>
                        <Button type="button" variant="ghost" size="icon" onClick={() => toggleAssetReturned(a)} className="size-8 shrink-0"
                          aria-pressed={a.isReturned} aria-label={`${a.itemName} returned`}>
                          {a.isReturned ? <ToggleRight className="size-6 text-success" /> : <ToggleLeft className="size-6 text-muted-foreground" />}
                        </Button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{a.itemName}</span>
                            {a.category && <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{a.category}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {a.serialNumber && <>S/N {a.serialNumber} · </>}Assigned {formatDate(a.assignedDate)}
                          </div>
                        </div>
                        <span className={`text-[11px] font-semibold shrink-0 ${a.isReturned ? 'text-success' : 'text-warning'}`}>
                          {a.isReturned ? `Returned ${formatDate(a.returnedAt)}` : 'Not returned'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><CheckCircle2 className="h-4 w-4" /> Clearance</h4>
                <Textarea
                  value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={2} placeholder="Clearance notes (optional)…"
                  aria-label="Clearance notes (optional)" className="resize-none mb-2"
                />
                {data.separation?.clearanceCompletedAt ? (
                  <div className="flex items-center justify-between bg-success/10 border border-success/30 rounded-xl px-4 py-2.5">
                    <span className="text-sm text-success">
                      Clearance completed {formatDate(data.separation.clearanceCompletedAt)}{data.separation.clearanceCompletedBy?.name ? ` by ${data.separation.clearanceCompletedBy.name}` : ''}
                    </span>
                    <Button variant="link" size="sm" onClick={() => toggleClearance(false)} disabled={savingClearance} className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground underline">Reopen</Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => toggleClearance(true)} loading={savingClearance}
                    className="w-full h-10 font-semibold border-2 border-dashed text-muted-foreground hover:border-primary hover:text-foreground">
                    {!allReturned && <span className="text-warning text-xs">(items still outstanding)</span>}
                    {savingClearance ? 'Saving…' : 'Mark Clearance Complete'}
                  </Button>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><FileText className="h-4 w-4" /> Paklaring (Certificate of Employment)</h4>
                {data.separation?.paklaringNumber ? (
                  <div className="flex items-center justify-between bg-info/10 border border-info/30 rounded-xl px-4 py-3">
                    <div className="text-sm">
                      <div className="font-medium text-info">No. {data.separation.paklaringNumber}</div>
                      <div className="text-xs text-info mt-0.5">Issued {formatDate(data.separation.paklaringIssuedAt)}</div>
                    </div>
                    <Button variant="link" size="sm" onClick={generatePaklaring} className="h-auto p-0 gap-1.5 text-xs text-info">
                      <ExternalLink className="size-3.5" /> Reprint
                    </Button>
                  </div>
                ) : (
                  <Button onClick={generatePaklaring} loading={generating} className="w-full h-10 font-semibold">
                    {!generating && <FileText />} {generating ? 'Generating…' : 'Generate Paklaring'}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
