'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Receipt, X, Anchor } from 'lucide-react'

interface TripSummary {
  booking: { id: string; bookingCode: string; startDate: string; endDate: string; status: string; customer: { name: string }; yacht: { id: string; name: string } | null }
  saleCount: number; subtotal: number; discountAmount: number; total: number
}
interface SaleItem { id: string; itemId: string | null; packageId: string | null; name: string; unit: string; price: number; qty: number; round: number }
interface Sale {
  id: string; guestName: string | null; status: 'open' | 'closed'; payMethod: string | null
  total: number; discountId: string | null; discountName: string | null; discountAmount: number
  employeeName: string | null; complimentaryReason: string | null; closedAt: string | null; createdAt: string
  items: SaleItem[]
  guest: { customer: { name: string } } | null
}
interface TripDetail {
  booking: { id: string; bookingCode: string; startDate: string; endDate: string; status: string; customer: { name: string }; yacht: { id: string; name: string } | null }
  sales: Sale[]
}

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export default function PosBillingHistoryPage() {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<TripDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    const res = await fetch(`/api/pos/billing?${params}`)
    if (res.ok) setTrips(await res.json())
    setLoading(false)
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function openTrip(bookingId: string) {
    setDetail(null); setDetailLoading(true)
    const res = await fetch(`/api/pos/billing/${bookingId}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">POS Billing History</h2>
        <p className="text-muted-foreground text-sm mt-1">Cashier sales grouped by trip</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input className="w-full h-9 border rounded-md pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors"
          placeholder="Search by booking code or guest…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Trip</th>
              <th className="text-left px-4 py-3 font-medium">Yacht</th>
              <th className="text-left px-4 py-3 font-medium">Dates</th>
              <th className="text-center px-4 py-3 font-medium">Sales</th>
              <th className="text-right px-4 py-3 font-medium">Discount</th>
              <th className="text-right px-4 py-3 font-medium">Total Billed</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td className="px-4 py-3.5" colSpan={6}><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
              ))
            ) : trips.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No POS sales recorded yet.
              </td></tr>
            ) : trips.map(t => (
              <tr key={t.booking.id} onClick={() => openTrip(t.booking.id)} className="hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-3">
                  <p className="font-mono text-sm font-medium">{t.booking.bookingCode}</p>
                  <p className="text-xs text-muted-foreground">{t.booking.customer.name}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.booking.yacht && <span className="flex items-center gap-1"><Anchor className="h-3 w-3 shrink-0" />{t.booking.yacht.name}</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(t.booking.startDate)} – {fmtDate(t.booking.endDate)}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{t.saleCount}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{t.discountAmount > 0 ? `−${fmtMoney(t.discountAmount)}` : '—'}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtMoney(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b flex items-start justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-base">{detail?.booking.bookingCode ?? 'Loading…'}</h3>
                {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail.booking.customer.name} · {detail.booking.yacht?.name} · {fmtDate(detail.booking.startDate)} – {fmtDate(detail.booking.endDate)}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              {detailLoading || !detail ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-4 w-full rounded bg-muted animate-pulse" />)}</div>
              ) : detail.sales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sales for this trip.</p>
              ) : detail.sales.map(sale => (
                <div key={sale.id} className="rounded-lg border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{sale.guestName ?? sale.guest?.customer?.name ?? 'Guest'}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.status === 'open' ? 'Open tab' : `Closed ${sale.closedAt ? fmtDate(sale.closedAt) : ''} · ${sale.payMethod}`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sale.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {sale.status === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <div className="px-4 py-2 divide-y">
                    {sale.items.map(item => (
                      <div key={item.id} className="flex justify-between py-1.5 text-sm">
                        <span>{item.qty} × {item.name}{item.packageId && <span className="ml-1.5 text-[10px] font-bold text-amber-600">PKG</span>}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtMoney(item.qty * item.price)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t bg-muted/20 space-y-1">
                    {sale.discountAmount > 0 && (
                      <div className="flex justify-between text-xs text-green-700">
                        <span>Discount{sale.discountName ? ` (${sale.discountName})` : ''}</span>
                        <span>−{fmtMoney(sale.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Total</span>
                      <span>{fmtMoney(sale.total - sale.discountAmount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
