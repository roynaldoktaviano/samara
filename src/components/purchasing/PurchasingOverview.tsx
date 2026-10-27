'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { AlertTriangle, ArrowRightLeft, Package, Clock } from 'lucide-react'
import { formatMoneyCompact, formatCompact, formatNumber, formatDate } from '@/lib/format'
import { StockQty } from '@/components/purchasing/StockQty'

interface KPIs {
  totalValue: number
  inTransitValue: number
  inTransitCount: number
  openExceptions: number
  negativeStock: number
  nearExpiry: number
  expiredCount: number
}
interface ControlCentre {
  poAwaitingReceipt: number
  transfersInTransit: number
  negativeStockExceptions: number
  transferDiscrepancies: number
  nearExpiryLots: number
  overduePOs: number
}
interface Movement {
  id: string; date: string; itemName: string; baseUnit: string
  purchaseUnit: string | null; purchaseQty: number | null; conversionFactor: number
  type: string; quantity: number; from: string | null; to: string | null; by: string | null
}
interface ExpiryRow {
  id: string; itemName: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number; locationName: string
  quantity: number; expiresAt: string | null; daysLeft: number | null
}
interface OverviewData {
  kpis: KPIs
  controlCentre: ControlCentre
  valueByLocation: { name: string; value: number }[]
  recentMovements: Movement[]
  expiryWatch: ExpiryRow[]
}


const MOVE_TYPE_LABEL: Record<string, string> = {
  RECEIPT: 'Receipt', TRANSFER_OUT: 'Transfer Out', TRANSFER_IN: 'Transfer In',
  ADJUSTMENT: 'Adjustment', STOCK_COUNT: 'Stock Count', WRITE_OFF: 'Write-off',
}
const MOVE_TYPE_COLOR: Record<string, string> = {
  RECEIPT: 'bg-success/15 text-success',
  TRANSFER_OUT: 'bg-warning/15 text-warning',
  TRANSFER_IN: 'bg-info/15 text-info',
  ADJUSTMENT: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  STOCK_COUNT: 'bg-muted text-foreground/80',
  WRITE_OFF: 'bg-destructive/15 text-destructive',
}

const GOLD = '#bdac7e'

function KPICard({ label, value, note, icon: Icon, tone = 'default' }: {
  label: string; value: string; note: string
  icon: React.ElementType; tone?: 'default' | 'red' | 'amber' | 'blue'
}) {
  const toneStyle = {
    default: 'bg-card border',
    red: 'bg-destructive/10 border-destructive/30',
    amber: 'bg-warning/10 border-warning/30',
    blue: 'bg-info/10 border-info/30',
  }[tone]
  const valStyle = {
    default: '', red: 'text-destructive', amber: 'text-warning', blue: 'text-info',
  }[tone]
  const iconStyle = {
    default: 'text-muted-foreground', red: 'text-destructive/80', amber: 'text-warning/80', blue: 'text-info/80',
  }[tone]
  return (
    <div className={`rounded-xl p-5 ${toneStyle}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <Icon className={`h-4 w-4 shrink-0 ${iconStyle}`} />
      </div>
      <p className={`text-2xl font-bold mt-2 tracking-tight ${valStyle}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{note}</p>
    </div>
  )
}

function Skeleton({ className }: { className: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />
}

export default function PurchasingOverview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/purchasing/overview')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Inventory Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Fleet-wide stock, transfers, expiry, exceptions and cost control.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="rounded-xl border p-5 space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-32" /></div>)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="rounded-xl border p-5"><Skeleton className="h-4 w-40 mb-4" /><Skeleton className="h-40 w-full" /></div>)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="rounded-xl border p-5"><Skeleton className="h-4 w-40 mb-4" /><div className="space-y-2">{[...Array(5)].map((_, j) => <Skeleton key={j} className="h-8 w-full" />)}</div></div>)}
      </div>
    </div>
  )

  if (!data) return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive text-sm">
      Failed to load dashboard data.
    </div>
  )

  const { kpis, controlCentre, valueByLocation, recentMovements, expiryWatch } = data

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">Fleet-wide stock, transfers, expiry, exceptions and cost control.</p>
        </div>
        <button onClick={() => { setLoading(true); fetch('/api/purchasing/overview').then(r => r.json()).then(d => { setData(d); setLoading(false) }) }}
          className="text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted transition-colors shrink-0">
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Inventory Value"
          value={formatMoneyCompact(kpis.totalValue)}
          note="On-hand stock, all locations"
          icon={Package}
        />
        <KPICard
          label="In Transit"
          value={formatMoneyCompact(kpis.inTransitValue)}
          note={`${kpis.inTransitCount} active shipment${kpis.inTransitCount !== 1 ? 's' : ''}`}
          icon={ArrowRightLeft}
          tone="blue"
        />
        <KPICard
          label="Open Exceptions"
          value={String(kpis.openExceptions)}
          note={kpis.negativeStock > 0 ? `${kpis.negativeStock} negative balance${kpis.negativeStock !== 1 ? 's' : ''}` : 'No negative balances'}
          icon={AlertTriangle}
          tone={kpis.openExceptions > 0 ? 'red' : 'default'}
        />
        <KPICard
          label="Near Expiry"
          value={String(kpis.nearExpiry)}
          note={kpis.expiredCount > 0 ? `${kpis.expiredCount} already expired` : 'Lots expiring within 30 days'}
          icon={Clock}
          tone={kpis.expiredCount > 0 ? 'red' : kpis.nearExpiry > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* Chart + Control Centre */}
      <div className="grid grid-cols-[1fr_280px] gap-4">
        {/* Bar Chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-0.5">Inventory Value by Location</p>
          <p className="text-xs text-muted-foreground mb-4">Financial value, all active lots</p>
          {valueByLocation.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No stock data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={valueByLocation} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false}
                  tickFormatter={v => formatCompact(v)} />
                <Tooltip
                  formatter={(v: number) => [formatMoneyCompact(v), 'Value']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' }}
                  cursor={{ fill: 'rgba(189,172,126,0.08)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {valueByLocation.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? GOLD : '#e5e7eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Control Centre */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-0.5">Control Centre</p>
          <p className="text-xs text-muted-foreground mb-4">Items requiring attention</p>
          <div className="space-y-3">
            {[
              { label: 'POs awaiting receipt', value: controlCentre.poAwaitingReceipt, warn: controlCentre.poAwaitingReceipt > 0 },
              { label: 'Transfers in transit', value: controlCentre.transfersInTransit, warn: false },
              { label: 'Overdue POs', value: controlCentre.overduePOs, warn: controlCentre.overduePOs > 0 },
              { label: 'Negative stock', value: controlCentre.negativeStockExceptions, warn: controlCentre.negativeStockExceptions > 0 },
              { label: 'Transfer discrepancies', value: controlCentre.transferDiscrepancies, warn: controlCentre.transferDiscrepancies > 0 },
              { label: 'Near-expiry lots', value: controlCentre.nearExpiryLots, warn: controlCentre.nearExpiryLots > 0 },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className={`text-sm font-bold tabular-nums ${row.warn && row.value > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Movements + Expiry Watch */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Movements */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b">
            <p className="text-sm font-semibold">Recent Movements</p>
            <p className="text-xs text-muted-foreground mt-0.5">Immutable movement ledger</p>
          </div>
          {recentMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No movements yet.</p>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {recentMovements.map(m => {
                const route = [m.from, m.to].filter(Boolean).join(' → ')
                return (
                  <div key={m.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{m.itemName}</p>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${MOVE_TYPE_COLOR[m.type] ?? 'bg-muted text-muted-foreground'}`}>
                          {MOVE_TYPE_LABEL[m.type] ?? m.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{route || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {m.purchaseUnit && m.purchaseQty !== null ? (
                        <>
                          <p className="text-sm font-semibold tabular-nums">
                            {formatNumber(m.purchaseQty, { decimals: 3 })} <span className="text-xs font-normal text-muted-foreground">{m.purchaseUnit}</span>
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">= {formatNumber(m.quantity)} {m.baseUnit}</p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold tabular-nums">{formatNumber(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{m.baseUnit}</span></p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDate(m.date, 'short')}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Expiry Watch */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b">
            <p className="text-sm font-semibold">Expiry Watch</p>
            <p className="text-xs text-muted-foreground mt-0.5">Use FEFO — First Expired, First Out</p>
          </div>
          {expiryWatch.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-success">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">No lots expiring within 30 days.</p>
            </div>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {expiryWatch.map(row => {
                const isExpired = row.daysLeft !== null && row.daysLeft < 0
                const isUrgent = !isExpired && row.daysLeft !== null && row.daysLeft <= 7
                return (
                  <div key={row.id} className={`px-5 py-3 flex items-start gap-3 ${isExpired ? 'bg-destructive/5' : isUrgent ? 'bg-warning/5' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.itemName}</p>
                      <p className="text-xs text-muted-foreground">{row.locationName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <StockQty item={row} qty={row.quantity} className="block text-sm tabular-nums" />
                      {row.daysLeft !== null && (
                        <p className={`text-xs font-semibold ${isExpired ? 'text-destructive' : isUrgent ? 'text-warning' : 'text-muted-foreground'}`}>
                          {isExpired ? `${Math.abs(row.daysLeft)}d ago` : `${row.daysLeft}d left`}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
