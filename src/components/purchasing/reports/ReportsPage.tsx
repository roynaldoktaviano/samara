'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Package, ShoppingCart, RefreshCw } from 'lucide-react'

interface Summary { thisMonthSpend: number; thisMonthPOCount: number; totalStockValue: number; totalStockLocations: number }
interface MonthSpend { label: string; totalValue: number; poCount: number }
interface StockValuation { locationId: string; locationName: string; locationType: string; value: number; itemCount: number; negativeCount: number }
interface ExpiryLot { lotId: string; itemName: string; baseUnit: string; locationName: string; batch: string | null; quantity: number; costPerUnit: number; value: number; expiresAt: string }
interface MovementRow { id: string; date: string; itemName: string; baseUnit: string; type: string; quantity: number; supplierName: string | null; fromLocation: string | null; toLocation: string | null; by: string; notes: string | null }
interface LowStockException { type: string; itemName: string; locationName: string; currentQty: number; minStock: number; baseUnit: string; value: number }
interface ExceptionRow { id: string; createdAt: string; type: string; itemName: string; locationName: string; qty: number; value: number; reason: string | null; status: string }

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtNum = (n: number) => new Intl.NumberFormat('id-ID').format(n)

const TYPE_COLOR: Record<string, string> = {
  RECEIPT: 'bg-green-50 text-green-700',
  RECEIVE: 'bg-green-50 text-green-700',
  TRANSFER: 'bg-blue-50 text-blue-700',
  ADJUSTMENT: 'bg-amber-50 text-amber-700',
  CONSUME: 'bg-red-50 text-red-700',
  COUNT: 'bg-purple-50 text-purple-700',
}

const TABS = ['Stock Valuation', 'Expiry / Batch', 'Movement Ledger', 'Trip Reconciliation', 'Exceptions'] as const
type Tab = typeof TABS[number]

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('Stock Valuation')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [spendingByMonth, setSpendingByMonth] = useState<MonthSpend[]>([])
  const [stockValuation, setStockValuation] = useState<StockValuation[]>([])
  const [expiryLots, setExpiryLots] = useState<ExpiryLot[]>([])
  const [movementLedger, setMovementLedger] = useState<MovementRow[]>([])
  const [lowStockExceptions, setLowStockExceptions] = useState<LowStockException[]>([])
  const [exceptionRegister, setExceptionRegister] = useState<ExceptionRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/purchasing/reports')
    if (res.ok) {
      const data = await res.json()
      setSummary(data.summary)
      setSpendingByMonth(data.spendingByMonth ?? [])
      setStockValuation(data.stockValuation ?? [])
      setExpiryLots(data.expiryLots ?? [])
      setMovementLedger(data.movementLedger ?? [])
      setLowStockExceptions(data.lowStockExceptions ?? [])
      setExceptionRegister(data.exceptionRegister ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const maxSpend = Math.max(...spendingByMonth.map(m => m.totalValue), 1)

  const now = new Date()
  const getDaysUntilExpiry = (s: string) => Math.ceil((new Date(s).getTime() - now.getTime()) / 86400000)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground text-sm mt-1">Stock valuation, expiry, movements and operational exceptions</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm border px-3 py-2 rounded-md hover:bg-muted transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl border bg-muted/30" />)}</div>
          <div className="h-64 rounded-xl border bg-muted/30" />
        </div>
      ) : (
        <>
          {/* KPIs + Monthly Spending */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard icon={<ShoppingCart className="h-5 w-5 text-amber-600" />}
              label="This Month's Spending" value={fmtMoney(summary?.thisMonthSpend ?? 0)}
              sub={`${summary?.thisMonthPOCount ?? 0} POs`} />
            <KpiCard icon={<Package className="h-5 w-5 text-blue-600" />}
              label="Total Stock Value" value={fmtMoney(summary?.totalStockValue ?? 0)}
              sub={`${summary?.totalStockLocations ?? 0} locations`} />
            <KpiCard icon={<TrendingUp className="h-5 w-5 text-green-600" />}
              label="6-Month Spending" value={fmtMoney(spendingByMonth.reduce((s, m) => s + m.totalValue, 0))}
              sub={`${spendingByMonth.reduce((s, m) => s + m.poCount, 0)} POs`} />
          </div>

          {/* Monthly Spending Bar */}
          {spendingByMonth.length > 0 && (
            <div className="rounded-xl border p-5 space-y-3">
              <h3 className="text-sm font-semibold">Monthly Spending</h3>
              <div className="space-y-2">
                {spendingByMonth.map((m, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{m.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(m.totalValue / maxSpend) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium w-32 text-right shrink-0">{fmtMoney(m.totalValue)}</span>
                    <span className="text-xs text-muted-foreground w-12 text-right shrink-0">{m.poCount} PO</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5 Report Tabs */}
          <div className="rounded-xl border overflow-hidden">
            <div className="flex border-b bg-muted/30 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${tab === t ? 'border-amber-500 text-amber-700 bg-white' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              {/* Tab 1: Stock Valuation */}
              {tab === 'Stock Valuation' && (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">Location</th>
                      <th className="text-left px-5 py-3 font-medium">Type</th>
                      <th className="text-right px-5 py-3 font-medium">Distinct Items</th>
                      <th className="text-right px-5 py-3 font-medium">Inventory Value</th>
                      <th className="text-center px-5 py-3 font-medium">Negative Balances</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stockValuation.length === 0
                      ? <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No stock data</td></tr>
                      : stockValuation.map(r => (
                        <tr key={r.locationId} className="hover:bg-muted/20">
                          <td className="px-5 py-3 font-medium">{r.locationName}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">{r.locationType}</td>
                          <td className="px-5 py-3 text-right">{r.itemCount}</td>
                          <td className="px-5 py-3 text-right font-semibold">{fmtMoney(r.value)}</td>
                          <td className="px-5 py-3 text-center">
                            {r.negativeCount > 0
                              ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">{r.negativeCount}</span>
                              : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700">0</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {stockValuation.length > 0 && (
                    <tfoot className="bg-muted/30 border-t text-sm font-semibold">
                      <tr>
                        <td colSpan={3} className="px-5 py-3 text-right text-muted-foreground">Total</td>
                        <td className="px-5 py-3 text-right">{fmtMoney(stockValuation.reduce((s, r) => s + r.value, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Tab 2: Expiry / Batch */}
              {tab === 'Expiry / Batch' && (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">Item</th>
                      <th className="text-left px-5 py-3 font-medium">Location</th>
                      <th className="text-left px-5 py-3 font-medium">Batch</th>
                      <th className="text-right px-5 py-3 font-medium">Quantity</th>
                      <th className="text-left px-5 py-3 font-medium">Expiry</th>
                      <th className="text-right px-5 py-3 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expiryLots.length === 0
                      ? <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No lots with expiry dates</td></tr>
                      : expiryLots.map(r => {
                        const days = getDaysUntilExpiry(r.expiresAt)
                        const expired = days < 0
                        const nearExpiry = days >= 0 && days <= 30
                        return (
                          <tr key={r.lotId} className="hover:bg-muted/20">
                            <td className="px-5 py-3 font-medium">{r.itemName}</td>
                            <td className="px-5 py-3 text-muted-foreground">{r.locationName}</td>
                            <td className="px-5 py-3 font-mono text-xs">{r.batch ?? '—'}</td>
                            <td className="px-5 py-3 text-right">{fmtNum(r.quantity)} {r.baseUnit}</td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${expired ? 'bg-red-100 text-red-700' : nearExpiry ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                                {fmtDate(r.expiresAt)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {expired ? `${Math.abs(days)}d ago` : `${days}d`}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">{fmtMoney(r.value)}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )}

              {/* Tab 3: Movement Ledger */}
              {tab === 'Movement Ledger' && (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">Date</th>
                      <th className="text-left px-5 py-3 font-medium">Item</th>
                      <th className="text-left px-5 py-3 font-medium">Type</th>
                      <th className="text-right px-5 py-3 font-medium">Qty</th>
                      <th className="text-left px-5 py-3 font-medium">Route</th>
                      <th className="text-left px-5 py-3 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {movementLedger.length === 0
                      ? <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No movements recorded</td></tr>
                      : movementLedger.map(r => {
                        const route = r.type === 'RECEIPT'
                          ? [r.supplierName ?? 'Supplier', r.toLocation].filter(Boolean).join(' → ')
                          : r.fromLocation && r.toLocation
                            ? `${r.fromLocation} → ${r.toLocation}`
                            : r.toLocation ?? r.fromLocation ?? '—'
                        return (
                          <tr key={r.id} className="hover:bg-muted/20">
                            <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className="px-5 py-3 font-medium">{r.itemName}</td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[r.type] ?? 'bg-muted text-muted-foreground'}`}>
                                {r.type}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-medium">{fmtNum(r.quantity)} <span className="text-xs text-muted-foreground font-normal">{r.baseUnit}</span></td>
                            <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">{route}</td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">{r.by}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )}

              {/* Tab 4: Trip Reconciliation */}
              {tab === 'Trip Reconciliation' && (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
                  <Package className="h-10 w-10 opacity-20" />
                  <p className="font-medium text-foreground">Coming soon</p>
                  <p className="text-sm max-w-sm">Trip Reconciliation will be available once the Trip / Voyage module is connected to inventory consumption.</p>
                </div>
              )}

              {/* Tab 5: Exception Analysis */}
              {tab === 'Exceptions' && (() => {
                const EXCEPTION_TYPE_LABEL: Record<string, string> = {
                  NEGATIVE_STOCK: 'Negative Stock',
                  TRANSFER_DISCREPANCY: 'Transfer Discrepancy',
                  RECEIVING_DISCREPANCY: 'Receiving Discrepancy',
                  STOCK_COUNT_VARIANCE: 'Stock Count Variance',
                }
                const EXCEPTION_TYPE_COLOR: Record<string, string> = {
                  NEGATIVE_STOCK: 'bg-red-50 text-red-700',
                  TRANSFER_DISCREPANCY: 'bg-blue-50 text-blue-700',
                  RECEIVING_DISCREPANCY: 'bg-amber-50 text-amber-700',
                  STOCK_COUNT_VARIANCE: 'bg-purple-50 text-purple-700',
                }
                const openCount = exceptionRegister.filter(e => e.status === 'OPEN').length
                const lowStockCount = lowStockExceptions.length
                return (
                  <div className="space-y-6 p-5">
                    {/* Summary row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Open Exceptions', value: openCount, color: openCount > 0 ? 'text-red-600' : 'text-green-600' },
                        { label: 'Resolved', value: exceptionRegister.filter(e => e.status === 'RESOLVED').length, color: 'text-foreground' },
                        { label: 'Low Stock Items', value: lowStockCount, color: lowStockCount > 0 ? 'text-amber-600' : 'text-green-600' },
                        { label: 'Total Value at Risk', value: fmtMoney(exceptionRegister.filter(e => e.status === 'OPEN').reduce((s, e) => s + e.value, 0)), color: 'text-foreground' },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                          <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Exception Register */}
                    <div>
                      <p className="text-sm font-semibold mb-3">Exception Register</p>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-4 py-3 font-medium">Date</th>
                              <th className="text-left px-4 py-3 font-medium">Type</th>
                              <th className="text-left px-4 py-3 font-medium">Item</th>
                              <th className="text-left px-4 py-3 font-medium">Location</th>
                              <th className="text-right px-4 py-3 font-medium">Value</th>
                              <th className="text-left px-4 py-3 font-medium">Reason</th>
                              <th className="text-left px-4 py-3 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {exceptionRegister.length === 0
                              ? <tr><td colSpan={7} className="text-center py-10 text-green-700 text-sm">No exceptions recorded</td></tr>
                              : exceptionRegister.map(e => (
                                <tr key={e.id} className="hover:bg-muted/20">
                                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EXCEPTION_TYPE_COLOR[e.type] ?? 'bg-muted text-muted-foreground'}`}>
                                      {EXCEPTION_TYPE_LABEL[e.type] ?? e.type}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-medium max-w-[160px] truncate">{e.itemName}</td>
                                  <td className="px-4 py-3 text-muted-foreground">{e.locationName}</td>
                                  <td className="px-4 py-3 text-right font-medium">{e.value > 0 ? fmtMoney(e.value) : '—'}</td>
                                  <td className="px-4 py-3 text-muted-foreground max-w-[200px]">
                                    <span className="truncate block" title={e.reason ?? ''}>{e.reason ?? '—'}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.status === 'OPEN' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                      {e.status === 'OPEN' ? 'Open' : 'Resolved'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Low Stock section */}
                    {lowStockExceptions.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-3">Low Stock Items</p>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-xs text-muted-foreground">
                              <tr>
                                <th className="text-left px-4 py-3 font-medium">Item</th>
                                <th className="text-right px-4 py-3 font-medium">Current Stock</th>
                                <th className="text-right px-4 py-3 font-medium">Min Stock</th>
                                <th className="text-right px-4 py-3 font-medium">Value at Risk</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {lowStockExceptions.map((r, i) => (
                                <tr key={i} className="hover:bg-muted/20">
                                  <td className="px-4 py-3 font-medium">{r.itemName}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={r.currentQty === 0 ? 'font-bold text-red-600' : 'font-medium text-amber-600'}>
                                      {fmtNum(r.currentQty)} {r.baseUnit}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtNum(r.minStock)} {r.baseUnit}</td>
                                  <td className="px-4 py-3 text-right">{fmtMoney(r.value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="font-bold text-2xl truncate">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
