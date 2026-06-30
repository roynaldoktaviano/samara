'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ExternalLink, Ship, Calendar, Users, ChevronRight, ClipboardList, FileText } from 'lucide-react'

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
  invoiceNumber: string | null
  paymentId: string | null
  paymentMethod: string | null
  paymentStatusLabel: string
}

interface TripGroup {
  id: string
  yachtName: string
  tripLabel: string
  tripType: 'Sharing' | 'Private'
  startDate: string
  endDate: string
  duration: string
  status: 'Done' | 'On Schedule'
  rows: TripRow[]
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtRange = (start: string, end: string) => {
  const s = new Date(start), e = new Date(end)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const dayFmt = (d: Date) => d.getDate()
  const monthYear = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase()
  return sameMonth
    ? `${dayFmt(s)}-${dayFmt(e)} ${monthYear}`
    : `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()} - ${e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`
}

const TRIP_TYPE_STYLE: Record<'Sharing' | 'Private', string> = {
  Sharing: 'bg-sky-100 text-sky-700 border-sky-200',
  Private: 'bg-orange-100 text-orange-700 border-orange-200',
}

const YACHT_PALETTE = ['#3b82f6', '#f97316', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4', '#eab308', '#ef4444']
function buildYachtColorMap(yachtNames: string[]): Record<string, string> {
  const sorted = [...yachtNames].sort()
  const map: Record<string, string> = {}
  sorted.forEach((name, i) => { map[name] = YACHT_PALETTE[i % YACHT_PALETTE.length] })
  return map
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  PAID:                 'bg-green-100 text-green-700 border-green-200',
  confirmed:            'bg-green-100 text-green-700 border-green-200',
  pending_confirmation: 'bg-amber-100 text-amber-700 border-amber-200',
  invoice_ready:        'bg-violet-100 text-violet-700 border-violet-200',
  requested:            'bg-blue-100 text-blue-700 border-blue-200',
  rejected:             'bg-red-100 text-red-700 border-red-200',
  cancelled:            'bg-slate-100 text-slate-600 border-slate-200',
  refunded:             'bg-blue-100 text-blue-700 border-blue-200',
  unpaid:               'bg-slate-100 text-slate-500 border-slate-200',
}

export default function TripSheet() {
  const [groups, setGroups]   = useState<TripGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]         = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [yearFilter, setYearFilter]   = useState('')
  const [vesselFilter, setVesselFilter] = useState('')
  const [selectedTrip, setSelectedTrip] = useState<TripGroup | null>(null)

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
      (r.invoiceNumber ?? '').toLowerCase().includes(q) ||
      r.agentName.toLowerCase().includes(q)
    ) } : g)
    .filter(g => g.rows.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-1">
        <div className="relative flex-1 min-w-0">
          <input
            placeholder="Search guest, booking, invoice, agent..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">All Months</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={vesselFilter} onChange={e => setVesselFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">All Vessels</option>
            {vessels.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
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
                <TableHead className="text-center">Pax</TableHead>
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
                return g.rows.map((r, idx) => {
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
                              <span className="group-hover:underline">{fmtRange(g.startDate, g.endDate)}</span>
                              <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-[10px] font-semibold mt-0.5" style={{ color: yachtColorMap[g.yachtName] }}>{g.yachtName}</div>
                            <div className="text-[10px] text-muted-foreground font-normal">{g.tripLabel}</div>
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[10px] text-muted-foreground">{g.duration}</span>
                              <Badge className={`text-[9px] px-1.5 py-0 ${TRIP_TYPE_STYLE[g.tripType]}`}>{g.tripType}</Badge>
                            </div>
                          </TableCell>
                          <TableCell rowSpan={totalGroupRows} className="align-middle text-center">
                            <Badge className={`text-[10px] ${g.status === 'Done' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                              {g.status}
                            </Badge>
                          </TableCell>
                        </>
                      )}

                      <TableCell className="font-medium">{r.guestName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.agentName}
                        <div className="text-[10px]">{r.salesperson}</div>
                      </TableCell>
                      <TableCell>{r.cabin}</TableCell>
                      <TableCell className="text-center">{r.pax}</TableCell>

                      {isFirstOfBooking && (
                        <>
                          <TableCell rowSpan={r.guestRowCount}>
                            {r.invoiceNumber && r.paymentId ? (
                              <a href={`/print/invoice/${r.paymentId}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[#1a5f6e] hover:underline font-medium whitespace-nowrap">
                                {r.invoiceNumber}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right border-l">${fmt(r.publish)}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.discountPct > 0 ? `${fmt(r.discountPct)}%` : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.agentCommission > 0 ? `$${fmt(r.agentCommission)}` : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right border-l">
                            <div className="font-semibold">${fmt(r.totalUSD)}</div>
                            {r.totalIDR != null && <div className="text-[10px] text-muted-foreground">Rp {r.totalIDR.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</div>}
                          </TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.dp > 0 ? `$${fmt(r.dp)}` : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.pelunasan > 0 ? `$${fmt(r.pelunasan)}` : ''}</TableCell>
                          <TableCell rowSpan={r.guestRowCount} className="text-right">{r.balance > 0 ? `$${fmt(r.balance)}` : '$-'}</TableCell>
                          <TableCell rowSpan={r.guestRowCount}>
                            <Badge className={`text-[10px] ${PAYMENT_STATUS_STYLE[r.paymentStatusLabel] ?? PAYMENT_STATUS_STYLE.unpaid}`}>
                              {r.paymentStatusLabel === 'PAID' ? 'PAID' : r.paymentStatusLabel.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })
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
                  <p className="text-sm font-medium">{fmtRange(selectedTrip.startDate, selectedTrip.endDate)}</p>
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
                  <Badge className={`text-[10px] ${selectedTrip.status === 'Done' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                    {selectedTrip.status}
                  </Badge>
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
                              <Badge className={`text-[10px] ${PAYMENT_STATUS_STYLE[r0.paymentStatusLabel] ?? PAYMENT_STATUS_STYLE.unpaid}`}>
                                {r0.paymentStatusLabel === 'PAID' ? 'PAID' : r0.paymentStatusLabel.replace('_', ' ')}
                              </Badge>
                              {r0.invoiceNumber && r0.paymentId && (
                                <a href={`/print/invoice/${r0.paymentId}`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[#1a5f6e] hover:underline font-medium">
                                  {r0.invoiceNumber}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
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
                            <span>Publish: <span className="text-foreground">${fmt(r0.publish)}</span></span>
                            {r0.discountPct > 0 && <span>Disc.: <span className="text-foreground">{fmt(r0.discountPct)}%</span></span>}
                            {r0.agentCommission > 0 && <span>Agent Com.: <span className="text-foreground">${fmt(r0.agentCommission)}</span></span>}
                            <span>TRIP: <span className="text-foreground">${fmt(r0.trip)}</span></span>
                            {r0.tnk > 0 && <span>TNK: <span className="text-foreground">${fmt(r0.tnk)}</span></span>}
                            <span>Total (USD): <span className="text-foreground font-semibold">${fmt(r0.totalUSD)}</span></span>
                            {r0.totalIDR != null && <span>Total (IDR): <span className="text-foreground font-semibold">Rp {r0.totalIDR.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span></span>}
                            {r0.dp > 0 && <span>DP: <span className="text-foreground">${fmt(r0.dp)}</span></span>}
                            {r0.pelunasan > 0 && <span>2nd DP/Payment: <span className="text-foreground">${fmt(r0.pelunasan)}</span></span>}
                            <span>Balance: <span className="text-foreground">{r0.balance > 0 ? `$${fmt(r0.balance)}` : '$-'}</span></span>
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
