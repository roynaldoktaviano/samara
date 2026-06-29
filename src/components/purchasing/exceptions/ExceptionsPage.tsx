'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Clock, Package, RefreshCw, X, CheckCircle2 } from 'lucide-react'

interface InventoryException {
  id: string; type: string; itemName: string; locationName: string
  qty: number; value: number; reason: string | null; referenceId: string | null; referenceType: string | null
  status: string; resolution: string | null; resolvedAt: string | null
  resolvedBy: { id: string; name: string } | null
  createdAt: string
}
interface LowStockItem {
  item: { id: string; sku: string; name: string; category: string; baseUnit: string; minStock: number; reorderQty: number }
  totalQty: number; minStock: number; deficit: number; severity: 'critical' | 'high' | 'medium'
}
interface OverduePO {
  id: string; poNumber: string; supplierName: string; status: string
  expectedAt: string; daysOverdue: number; itemCount: number
}
interface StaleStock {
  item: { name: string; sku: string; baseUnit: string }
  location: { name: string; type: string }
  qty: number
}
interface Summary { openExceptions: number; lowStockCount: number; criticalCount: number; overduePOCount: number; staleStockCount: number }

const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
}
const SEV_LABEL: Record<string, string> = { critical: 'Out of Stock', high: 'Critical', medium: 'Low' }

const EXC_TYPE_LABEL: Record<string, string> = {
  NEGATIVE_STOCK: 'Negative Stock',
  TRANSFER_DISCREPANCY: 'Transfer Discrepancy',
  RECEIVING_DISCREPANCY: 'Receiving Discrepancy',
  STOCK_COUNT_VARIANCE: 'Stock Count Variance',
}
const EXC_TYPE_COLOR: Record<string, string> = {
  NEGATIVE_STOCK: 'bg-red-100 text-red-700',
  TRANSFER_DISCREPANCY: 'bg-orange-100 text-orange-700',
  RECEIVING_DISCREPANCY: 'bg-orange-100 text-orange-700',
  STOCK_COUNT_VARIANCE: 'bg-amber-100 text-amber-700',
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDateTime = (s: string) => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))

type Tab = 'register' | 'low-stock' | 'overdue-po' | 'stale-stock'

export default function ExceptionsPage() {
  const [register, setRegister] = useState<InventoryException[]>([])
  const [lowStock, setLowStock] = useState<LowStockItem[]>([])
  const [overduePOs, setOverduePOs] = useState<OverduePO[]>([])
  const [staleStock, setStaleStock] = useState<StaleStock[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('register')
  const [filterStatus, setFilterStatus] = useState<'OPEN' | 'ALL'>('OPEN')

  // Resolve modal
  const [resolving, setResolving] = useState<InventoryException | null>(null)
  const [resolution, setResolution] = useState('')
  const [resolveLoading, setResolveLoading] = useState(false)
  const [resolveError, setResolveError] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/purchasing/exceptions')
    if (res.ok) {
      const data = await res.json()
      setRegister(data.register ?? [])
      setLowStock(data.lowStock ?? [])
      setOverduePOs(data.overduePOs ?? [])
      setStaleStock(data.staleStock ?? [])
      setSummary(data.summary ?? null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submitResolve() {
    if (!resolving || !resolution.trim()) { setResolveError('Resolution text is required'); return }
    setResolveLoading(true)
    setResolveError('')
    const res = await fetch(`/api/purchasing/exceptions/${resolving.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    })
    if (res.ok) {
      const updated: InventoryException = await res.json()
      setRegister(rows => rows.map(r => r.id === updated.id ? updated : r))
      setSummary(s => s ? { ...s, openExceptions: Math.max(0, s.openExceptions - 1) } : s)
      setResolving(null)
      setResolution('')
    } else {
      const err = await res.json()
      setResolveError(err.error ?? 'Failed to resolve')
    }
    setResolveLoading(false)
  }

  const visibleRegister = filterStatus === 'OPEN' ? register.filter(e => e.status === 'OPEN') : register
  const openCount = register.filter(e => e.status === 'OPEN').length

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'register', label: 'Exception Register', count: openCount },
    { id: 'low-stock', label: 'Low Stock', count: summary?.lowStockCount },
    { id: 'overdue-po', label: 'Overdue POs', count: summary?.overduePOCount },
    { id: 'stale-stock', label: 'Stale Stock', count: summary?.staleStockCount },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory Exceptions</h2>
          <p className="text-muted-foreground text-sm mt-1">Negative stock, discrepancies, overdue receipts and unresolved control failures.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm border px-3 py-2 rounded-md hover:bg-muted transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="rounded-xl border p-4 h-20 bg-muted/30" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`rounded-xl border p-4 ${openCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-xs font-medium ${openCount > 0 ? 'text-red-500' : 'text-green-600'}`}>Open Exceptions</p>
            <p className={`text-3xl font-bold mt-1 ${openCount > 0 ? 'text-red-700' : 'text-green-700'}`}>{openCount}</p>
            <p className={`text-xs mt-0.5 ${openCount > 0 ? 'text-red-400' : 'text-green-500'}`}>{openCount > 0 ? 'require manager action' : 'all clear'}</p>
          </div>
          <div className="rounded-xl border p-4 bg-orange-50 border-orange-100">
            <p className="text-xs font-medium text-orange-500">Low Stock</p>
            <p className="text-3xl font-bold text-orange-700 mt-1">{summary?.lowStockCount ?? 0}</p>
            <p className="text-xs text-orange-400 mt-0.5">{summary?.criticalCount ?? 0} out of stock</p>
          </div>
          <div className="rounded-xl border p-4 bg-amber-50 border-amber-100">
            <p className="text-xs font-medium text-amber-600">Overdue POs</p>
            <p className="text-3xl font-bold text-amber-700 mt-1">{summary?.overduePOCount ?? 0}</p>
            <p className="text-xs text-amber-400 mt-0.5">past expected delivery</p>
          </div>
          <div className="rounded-xl border p-4 bg-muted/40">
            <p className="text-xs font-medium text-muted-foreground">Stale Stock</p>
            <p className="text-3xl font-bold mt-1">{summary?.staleStockCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">no movement 30 days</p>
          </div>
        </div>
      )}

      {/* Open exceptions banner */}
      {!loading && openCount > 0 && tab === 'register' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <span>Negative balances and discrepancies remain visible until a manager documents and approves the correction. They are never silently reset to zero.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b flex gap-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[#bdac7e] text-[#bdac7e]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {!loading && t.count !== undefined && t.count > 0 && (
              <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b flex items-center gap-4">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-6 w-16 rounded bg-muted ml-auto" />
            </div>
          ))}
        </div>
      ) : tab === 'register' ? (
        <>
          {/* Filter */}
          <div className="flex items-center gap-2">
            {(['OPEN', 'ALL'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${filterStatus === s ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                {s === 'OPEN' ? `Open (${openCount})` : `All (${register.length})`}
              </button>
            ))}
          </div>

          {visibleRegister.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-8 w-8 opacity-20" />}
              title={filterStatus === 'OPEN' ? 'No open exceptions' : 'No exceptions recorded'}
              desc={filterStatus === 'OPEN' ? 'All exceptions have been resolved.' : 'Exceptions are auto-created from transfers, receiving and stock counts.'} />
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-left px-4 py-3 font-medium">Location</th>
                    <th className="text-right px-4 py-3 font-medium">Qty</th>
                    <th className="text-right px-4 py-3 font-medium">Value</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleRegister.map(exc => {
                    const isOpen = exc.status === 'OPEN'
                    return (
                      <tr key={exc.id} className={`hover:bg-muted/20 ${isOpen ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(exc.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${EXC_TYPE_COLOR[exc.type] ?? 'bg-muted text-muted-foreground'}`}>
                            {EXC_TYPE_LABEL[exc.type] ?? exc.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium max-w-[160px] truncate">{exc.itemName}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{exc.locationName}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {exc.qty > 0 ? exc.qty.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {exc.value > 0 ? fmtMoney(exc.value) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                          <span title={exc.reason ?? ''} className="line-clamp-2">{exc.reason ?? '—'}</span>
                          {!isOpen && exc.resolution && (
                            <span className="block text-green-700 mt-0.5" title={exc.resolution}>
                              ✓ {exc.resolution.length > 60 ? exc.resolution.slice(0, 60) + '…' : exc.resolution}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isOpen ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Open</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <CheckCircle2 className="h-3 w-3" /> Resolved
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isOpen ? (
                            <button onClick={() => { setResolving(exc); setResolution(''); setResolveError('') }}
                              className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors">
                              Resolve
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {exc.resolvedBy?.name ?? ''}{exc.resolvedAt ? ` · ${fmtDate(exc.resolvedAt)}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'low-stock' ? (
        lowStock.length === 0 ? (
          <EmptyState icon={<Package className="h-8 w-8 opacity-20" />} title="All stock levels are safe" desc="No items below minimum stock." />
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Item</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-right px-4 py-3 font-medium">Current Stock</th>
                  <th className="text-right px-4 py-3 font-medium">Min. Stock</th>
                  <th className="text-right px-4 py-3 font-medium">Deficit</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lowStock.map(({ item, totalQty, minStock, deficit, severity }) => (
                  <tr key={item.id} className={`hover:bg-muted/20 ${severity === 'critical' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.sku}</p>
                    </td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{item.category}</span></td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${severity === 'critical' ? 'text-red-600' : 'text-orange-600'}`}>
                      {totalQty} <span className="font-normal text-muted-foreground text-xs">{item.baseUnit}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{minStock} {item.baseUnit}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600 tabular-nums">-{deficit} {item.baseUnit}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_COLOR[severity]}`}>{SEV_LABEL[severity]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'overdue-po' ? (
        overduePOs.length === 0 ? (
          <EmptyState icon={<Clock className="h-8 w-8 opacity-20" />} title="No overdue POs" desc="All orders are within the estimated arrival time." />
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">PO No.</th>
                  <th className="text-left px-4 py-3 font-medium">Supplier</th>
                  <th className="text-left px-4 py-3 font-medium">Expected Arrival</th>
                  <th className="text-center px-4 py-3 font-medium">Days Overdue</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overduePOs.map(po => (
                  <tr key={po.id} className="hover:bg-muted/20 bg-orange-50/20">
                    <td className="px-4 py-3 font-mono font-medium text-xs">{po.poNumber}</td>
                    <td className="px-4 py-3 font-medium">{po.supplierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(po.expectedAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">+{po.daysOverdue} days</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{po.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        staleStock.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-8 w-8 opacity-20" />} title="No stale stock" desc="All items have had movement in the last 30 days." />
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Item</th>
                  <th className="text-left px-4 py-3 font-medium">Location</th>
                  <th className="text-right px-4 py-3 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {staleStock.map((s, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.item.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.location.name}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{s.qty} <span className="text-xs text-muted-foreground font-normal">{s.item.baseUnit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Resolve modal */}
      {resolving && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-semibold">Resolve Exception</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{EXC_TYPE_LABEL[resolving.type] ?? resolving.type} · {resolving.itemName}</p>
              </div>
              <button onClick={() => setResolving(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
                <p><span className="font-medium text-foreground">Location:</span> {resolving.locationName}</p>
                {resolving.qty > 0 && <p><span className="font-medium text-foreground">Qty:</span> {resolving.qty.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</p>}
                {resolving.value > 0 && <p><span className="font-medium text-foreground">Value:</span> {fmtMoney(resolving.value)}</p>}
                {resolving.reason && <p><span className="font-medium text-foreground">Reason:</span> {resolving.reason}</p>}
                {resolving.createdAt && <p><span className="font-medium text-foreground">Created:</span> {fmtDateTime(resolving.createdAt)}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Resolution Notes <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  placeholder="Describe how this exception was investigated and resolved..."
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]"
                />
              </div>
              {resolveError && <p className="text-xs text-red-600">{resolveError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t bg-muted/30">
              <button onClick={() => setResolving(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={submitResolve} disabled={resolveLoading || !resolution.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 font-medium transition-colors">
                <CheckCircle2 className="h-4 w-4" />
                {resolveLoading ? 'Resolving...' : 'Mark as Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <div className="flex justify-center text-muted-foreground mb-3">{icon}</div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </div>
  )
}
