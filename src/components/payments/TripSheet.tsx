'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ExternalLink, Ship, Calendar, Users, ChevronRight, ClipboardList, FileText, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateRange, formatMoney, formatPercent } from '@/lib/format'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'

interface TripRow {
  bookingId: string
  bookingCode: string
  guestRowIndex: number
  guestRowCount: number
  guestName: string
  agentName: string
  salesperson: string
  cabin: string
  pax: number
  publish: number
  discount: number
  discountPct: number
  trip: number
  tnk: number
  totalUSD: number
  totalIDR: number | null
  agentCommission: number
  dp: number
  pelunasan: number
  balance: number
  invoices: { invoiceNumber: string; paymentId: string }[]
  paymentMethod: string | null
  paymentStatusLabel: string
}

interface TripGroup {
  id: string
  yachtName: string
  tripLabel: string
  tripType: 'Sharing' | 'Private'
  tripNumber: number | null
  tripYear: number
  startDate: string
  endDate: string
  duration: string
  status: 'Done' | 'On Schedule'
  rows: TripRow[]
}

const TRIP_TYPE_STYLE: Record<'Sharing' | 'Private', string> = {
  Sharing: 'bg-info/15 text-info border-info/30',
  Private: 'bg-warning/15 text-warning border-warning/30',
}

const YACHT_PALETTE = ['#3b82f6', '#f97316', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4', '#eab308', '#ef4444']
function buildYachtColorMap(yachtNames: string[]): Record<string, string> {
  const sorted = [...yachtNames].sort()
  const map: Record<string, string> = {}
  sorted.forEach((name, i) => { map[name] = YACHT_PALETTE[i % YACHT_PALETTE.length] })
  return map
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ACCENT = 'var(--primary)'

const PAYMENT_STATUS_TONE: Record<string, StatusTone> = {
  PAID:                 'success',
  confirmed:            'success',
  pending_confirmation: 'warning',
  invoice_ready:        'primary',
  requested:            'info',
  rejected:             'destructive',
  cancelled:            'neutral',
  refunded:             'info',
  unpaid:               'neutral',
}

export default function TripSheet() {
  const [groups, setGroups]   = useState<TripGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]         = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [yearFilter, setYearFilter]   = useState('')
  const [vesselFilter, setVesselFilter] = useState('')
  const [selectedTrip, setSelectedTrip] = useState<TripGroup | null>(null)
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/payments/trip-sheet/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      toast.success(`Synced ${data.rows} row(s) to Google Sheets`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments/trip-sheet')
      if (res.ok) setGroups(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const years = Array.from(new Set(groups.map(g => new Date(g.startDate).getFullYear()))).sort((a, b) => b - a)
  const vessels = Array.from(new Set(groups.map(g => g.yachtName))).sort()
  const yachtColorMap = buildYachtColorMap(vessels)

  const q = search.trim().toLowerCase()
  const filteredGroups = groups
    .filter(g => {
      const d = new Date(g.startDate)
      if (monthFilter && d.getMonth() !== Number(monthFilter)) return false
      if (yearFilter && d.getFullYear() !== Number(yearFilter)) return false
      if (vesselFilter && g.yachtName !== vesselFilter) return false
      return true
    })
    .map(g => q ? { ...g, rows: g.rows.filter(r =>
      r.guestName.toLowerCase().includes(q) ||
      r.bookingCode.toLowerCase().includes(q) ||
      r.invoices.some(inv => inv.invoiceNumber.toLowerCase().includes(q)) ||
      r.agentName.toLowerCase().includes(q)
    ) } : g)
    .filter(g => g.rows.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-1">
        <div className="relative flex-1 min-w-0">
          <input
            placeholder="Search guest, booking, invoice, agent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={syncing} onClick={handleSync}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync to Sheets
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-1 overflow-x-auto scrollbar-none divide-x divide-border">
        <div className="flex items-center gap-1.5 pr-3 shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest shrink-0">Year</span>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="h-7 rounded-full border-0 bg-muted px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">All</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1 pl-3 pr-3 shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest shrink-0 mr-1">Month</span>
          <button onClick={() => setMonthFilter('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${!monthFilter ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            style={!monthFilter ? { backgroundColor: ACCENT } : {}}>
            All
          </button>
          {MONTH_SHORT.map((m, i) => (
            <button key={m} onClick={() => setMonthFilter(String(i))}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${monthFilter === String(i) ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              style={monthFilter === String(i) ? { backgroundColor: ACCENT } : {}}>
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pl-3 shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest shrink-0 mr-1">Vessel</span>
          <button onClick={() => setVesselFilter('')}
            className={`h-6 flex items-center px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 whitespace-nowrap ${!vesselFilter ? 'text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}
            style={!vesselFilter ? { backgroundColor: ACCENT } : {}}>
            All
          </button>
          {vessels.map(v => {
            const color = yachtColorMap[v] ?? '#64748b'
            const active = vesselFilter === v
            return (
              <button key={v} onClick={() => setVesselFilter(v)}
                className={`h-6 flex items-center gap-1 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 whitespace-nowrap ${active ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}
                style={active ? { backgroundColor: color } : {}}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : color }} />
                {v}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
      ) : filteredGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No trips found.</p>
      ) : (
        <div className="overflow-x-auto rounded-b-md border-t [&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="bg-muted/40 text-center">Trip</TableHead>
                <TableHead className="bg-muted/40 text-center">Status</TableHead>
                <TableHead className="text-center">Guest</TableHead>
                <TableHead className="text-center">Agent / Sales</TableHead>
                <TableHead className="text-center">Cabin</TableHead>
                <TableHead className="text-center">Invoice</TableHead>
                <TableHead className="text-center border-l">Publish</TableHead>
                <TableHead className="text-center">Disc.</TableHead>
                <TableHead className="text-center">Agent Com.</TableHead>
                <TableHead className="text-center border-l">Total Price</TableHead>
                <TableHead className="text-center">DP</TableHead>
                <TableHead className="text-center">2nd DP / Payment</TableHead>
                <TableHead className="text-center">Balance</TableHead>
                <TableHead className="text-center">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((g, gIdx) => {
                const totalGroupRows = g.rows.length
                let printedGroupHeader = false
                const zebra = gIdx % 2 === 1 ? 'bg-muted/10' : ''
                const prevGroup = filteredGroups[gIdx - 1]
                const monthKey = (d: string) => { const dt = new Date(d); return `${dt.getFullYear()}-${dt.getMonth()}` }
                const isNewMonth = gIdx === 0 || monthKey(g.startDate) !== monthKey(prevGroup.startDate)
                const monthGapRow = isNewMonth && gIdx > 0 && (
                  <TableRow key={`gap-${g.id}`} className="hover:bg-transparent">
                    <TableCell colSpan={14} className="h-4 p-0 border-0 bg-transparent" />
                  </TableRow>
                )
                const monthLabelRow = isNewMonth && (
                  <TableRow key={`month-${g.id}`} className="hover:bg-transparent">
                    <TableCell colSpan={14} className="py-1.5 px-3 bg-muted/60 border-y">
                      <span className="text-xs font-bold tracking-wide text-foreground">
                        {formatDate(g.startDate, 'monthYear').toUpperCase()}
                      </span>
                    </TableCell>
                  </TableRow>
                )
                const groupRows = g.rows.map((r, idx) => {
                  const isFirstOfBooking = r.guestRowIndex === 0
                  const isFirstOfGroup = !printedGroupHeader
                  if (isFirstOfGroup) printedGroupHeader = true
                  return (
                    <TableRow key={`${g.id}-${r.bookingId}-${idx}`} className={`text-xs ${isFirstOfGroup ? 'border-t-2 border-t-border' : ''} ${zebra}`}>
                      {isFirstOfGroup && (
                        <>
                          <TableCell
                            rowSpan={totalGroupRows}
                            className="align-top font-medium whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors group"
                            onClick={() => setSelectedTrip(g)}
                          >
                            <div className="flex items-center gap-1">
                              <span className="group-hover:underline">{formatDateRange(g.startDate, g.endDate).toUpperCase()}</span>
                              <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-[10px] font-semibold mt-0.5" style={{ color: yachtColorMap[g.yachtName] }}>{g.yachtName}</div>
                            <div className="text-[10px] text-muted-foreground font-normal">{g.tripLabel}</div>
                            <div className="flex items-center gap-1 mt-1">
                              {g.tripNumber != null && (
                                <span className="text-[10px] font-mono text-muted-foreground">#{g.tripNumber}/{g.tripYear}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground">{g.duration}</span>
                              <Badge className={`text-[9px] px-1.5 py-0 ${TRIP_TYPE_STYLE[g.tripType]}`}>{g.tripType}</Badge>
                            </div>
                          </TableCell>
                          <TableCell rowSpan={totalGroupRows} className="align-middle text-center">
                            <StatusBadge size="sm" tone={g.status === 'Done' ? 'success' : 'info'}>
                              {g.status}
                            </StatusBadge>
                          </TableCell>
                        </>
                      )}

                      <TableCell className="font-medium">{r.guestName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.agentName}
                        <div className="text-[10px]">{r.salesperson}</div>
                      </TableCell>
                      <TableCell>{r.cabin}</TableCell>

                      {isFirstOfBooking && (
                        <>
                          <TableCell rowSpan={r.guestRowCount}>
                            {r.invoices.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {r.invoices.map(inv => (
                                  <a key={inv.paymentId} href={`/print/invoice/${inv.paymentId}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-brand hover:underline font-medium whitespace-nowrap">
                                    {inv.invoiceNumber}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ))}
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right border-l">{formatMoney(r.publish, { currency: 'USD' })}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.discountPct > 0 ? formatPercent(r.discountPct, { fraction: false, decimals: 2 }) : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.agentCommission > 0 ? formatMoney(r.agentCommission, { currency: 'USD' }) : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right border-l">
                            <div className="font-semibold">{formatMoney(r.totalUSD, { currency: 'USD' })}</div>
                            {r.totalIDR != null && <div className="text-[10px] text-muted-foreground">{formatMoney(r.totalIDR)}</div>}
                          </TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.dp > 0 ? formatMoney(r.dp, { currency: 'USD' }) : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.pelunasan > 0 ? formatMoney(r.pelunasan, { currency: 'USD' }) : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.balance > 0 ? formatMoney(r.balance, { currency: 'USD' }) : '$-'}</TableCell>
                          <TableCell rowSpan={r.guestRowCount}>
                            <StatusBadge size="sm" tone={PAYMENT_STATUS_TONE[r.paymentStatusLabel] ?? PAYMENT_STATUS_TONE.unpaid}>
                              {r.paymentStatusLabel === 'PAID' ? 'PAID' : r.paymentStatusLabel.replace('_', ' ')}
                            </StatusBadge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })
                return [monthGapRow, monthLabelRow, ...groupRows].filter(Boolean) as ReactNode[]
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground px-1">Click a trip&apos;s date to see TRIP, TNK, payment method, and booking code per guest.</p>

      {selectedTrip && (
        <Dialog open={!!selectedTrip} onOpenChange={v => { if (!v) setSelectedTrip(null) }}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ship className="h-4 w-4 text-muted-foreground" />
                <span style={{ color: yachtColorMap[selectedTrip.yachtName] }}>{selectedTrip.yachtName}</span>
                <span className="text-muted-foreground">· {selectedTrip.tripLabel}</span>
                {selectedTrip.tripNumber != null && (
                  <span className="text-xs font-mono font-normal text-muted-foreground">#{selectedTrip.tripNumber}/{selectedTrip.tripYear}</span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.open(
                selectedTrip.tripType === 'Sharing'
                  ? `/print/crew-sheet/${selectedTrip.id}`
                  : `/print/crew-sheet/booking/${selectedTrip.id}`,
                '_blank'
              )}>
                <ClipboardList className="h-3.5 w-3.5" /> Crew Sheet
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.open(
                selectedTrip.tripType === 'Sharing'
                  ? `/print/guest-sheet/open-trip/${selectedTrip.id}`
                  : `/print/guest-sheet/booking/${selectedTrip.id}`,
                '_blank'
              )}>
                <FileText className="h-3.5 w-3.5" /> Guest Sheet
              </Button>
            </div>

            <div className="space-y-4">
              {/* Trip summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Trip Date
                  </p>
                  <p className="text-sm font-medium">{formatDateRange(selectedTrip.startDate, selectedTrip.endDate).toUpperCase()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Duration</p>
                  <p className="text-sm font-medium">{selectedTrip.duration}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Type</p>
                  <Badge className={`text-[10px] ${TRIP_TYPE_STYLE[selectedTrip.tripType]}`}>{selectedTrip.tripType}</Badge>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                  <StatusBadge size="sm" tone={selectedTrip.status === 'Done' ? 'success' : 'info'}>
                    {selectedTrip.status}
                  </StatusBadge>
                </div>
              </div>

              {/* Guests */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Guests & Bookings ({selectedTrip.rows.length})
                </p>
                <div className="space-y-2">
                  {(() => {
                    const byBooking = new Map<string, TripRow[]>()
                    selectedTrip.rows.forEach(r => {
                      const list = byBooking.get(r.bookingId) ?? []
                      list.push(r)
                      byBooking.set(r.bookingId, list)
                    })
                    return Array.from(byBooking.values()).map(rowsForBooking => {
                      const r0 = rowsForBooking[0]
                      return (
                        <div key={r0.bookingId} className="rounded-lg border p-3 text-xs space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground">{r0.bookingCode}</span>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge size="sm" tone={PAYMENT_STATUS_TONE[r0.paymentStatusLabel] ?? PAYMENT_STATUS_TONE.unpaid}>
                                {r0.paymentStatusLabel === 'PAID' ? 'PAID' : r0.paymentStatusLabel.replace('_', ' ')}
                              </StatusBadge>
                              {r0.invoices.map(inv => (
                                <a key={inv.paymentId} href={`/print/invoice/${inv.paymentId}`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-brand hover:underline font-medium">
                                  {inv.invoiceNumber}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-muted-foreground">
                            <span>Agent: <span className="text-foreground">{r0.agentName}</span></span>
                            <span>Sales: <span className="text-foreground">{r0.salesperson}</span></span>
                            <span>Pax: <span className="text-foreground">{r0.pax}</span></span>
                            <span>Method: <span className="text-foreground">{r0.paymentMethod ?? '—'}</span></span>
                          </div>

                          <div className="border-t pt-1.5 space-y-1">
                            {rowsForBooking.map((r, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="font-medium">{r.guestName}</span>
                                <span className="text-muted-foreground">{r.cabin}</span>
                              </div>
                            ))}
                          </div>

                          <div className="border-t pt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-muted-foreground">
                            <span>Publish: <span className="text-foreground">{formatMoney(r0.publish, { currency: 'USD' })}</span></span>
                            {r0.discountPct > 0 && <span>Disc.: <span className="text-foreground">{formatPercent(r0.discountPct, { fraction: false, decimals: 2 })}</span></span>}
                            {r0.agentCommission > 0 && <span>Agent Com.: <span className="text-foreground">{formatMoney(r0.agentCommission, { currency: 'USD' })}</span></span>}
                            <span>TRIP: <span className="text-foreground">{formatMoney(r0.trip, { currency: 'USD' })}</span></span>
                            {r0.tnk > 0 && <span>TNK: <span className="text-foreground">{formatMoney(r0.tnk, { currency: 'USD' })}</span></span>}
                            <span>Total (USD): <span className="text-foreground font-semibold">{formatMoney(r0.totalUSD, { currency: 'USD' })}</span></span>
                            {r0.totalIDR != null && <span>Total (IDR): <span className="text-foreground font-semibold">{formatMoney(r0.totalIDR)}</span></span>}
                            {r0.dp > 0 && <span>DP: <span className="text-foreground">{formatMoney(r0.dp, { currency: 'USD' })}</span></span>}
                            {r0.pelunasan > 0 && <span>2nd DP/Payment: <span className="text-foreground">{formatMoney(r0.pelunasan, { currency: 'USD' })}</span></span>}
                            <span>Balance: <span className="text-foreground">{r0.balance > 0 ? formatMoney(r0.balance, { currency: 'USD' }) : '$-'}</span></span>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
