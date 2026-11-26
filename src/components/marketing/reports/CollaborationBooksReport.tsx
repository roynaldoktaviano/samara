'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Handshake, Layers, Wallet, ListTree } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge, BookingStatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'
import { PageHeader, KpiCard } from '@/components/marketing/shared/MarketingUI'
import { CollaborationBudgetCard } from '@/components/bookings/CollaborationBudgetCard'

interface Row {
  id: string
  bookingCode: string
  tripType: 'PRIVATE_CHARTER' | 'OPEN_TRIP'
  status: string
  cancelled: boolean
  startDate: string
  endDate: string
  guestCount: number
  purpose: string | null
  currency: string
  createdByName: string | null
  vessel: string | null
  openTripTitle: string | null
  leadGuest: string | null
  items: { id: string; name: string; amount: number }[]
  total: number
}

const yearStart = () => `${new Date().getFullYear()}-01-01`
const yearEnd = () => `${new Date().getFullYear()}-12-31`

/** Sums per currency — IDR and USD books are never added together. */
function byCurrency<T>(rows: T[], cur: (r: T) => string, amt: (r: T) => number) {
  const m = new Map<string, number>()
  for (const r of rows) m.set(cur(r), (m.get(cur(r)) ?? 0) + amt(r))
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export default function CollaborationBooksReport() {
  const [from, setFrom] = useState(yearStart)
  const [to, setTo] = useState(yearEnd)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Loading is flipped on by the range setters below, so the effect only sets state from the response.
  useEffect(() => {
    let stale = false
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    fetch(`/api/marketing/collaboration-books?${params}`)
      .then(async res => {
        if (stale) return
        if (!res.ok) { setError('Failed to load collaboration books'); setRows([]); return }
        const data: Row[] = await res.json()
        if (!stale) { setRows(data); setError('') }
      })
      .catch(() => { if (!stale) setError('Failed to load collaboration books') })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [from, to])

  const setRange = (f: string, t: string) => { setLoading(true); setFrom(f); setTo(t) }

  const active = useMemo(() => rows.filter(r => !r.cancelled), [rows])
  const totals = useMemo(() => byCurrency(active, r => r.currency, r => r.total), [active])
  // Same need across books ("Fuel", "fuel ") folds together; label keeps the first spelling seen.
  const needs = useMemo(() => {
    const m = new Map<string, { name: string; currency: string; amount: number; books: number }>()
    for (const r of active) {
      for (const it of r.items) {
        const key = `${r.currency}|${it.name.trim().toLowerCase()}`
        const cur = m.get(key) ?? { name: it.name.trim(), currency: r.currency, amount: 0, books: 0 }
        cur.amount += it.amount; cur.books += 1
        m.set(key, cur)
      }
    }
    return [...m.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount)
  }, [active])

  const totalLabel = totals.length ? totals.map(([c, v]) => formatMoney(v, { currency: c })).join(' + ') : formatMoney(0, { currency: 'IDR' })
  const avgLabel = totals.length
    ? totals.map(([c, v]) => {
        const n = active.filter(r => r.currency === c).length
        return formatMoney(n ? v / n : 0, { currency: c })
      }).join(' · ')
    : '—'

  const patchRow = (id: string, next: { budgetCurrency: string; budgetItems: Row['items'] }) =>
    setRows(prev => prev.map(r => r.id === id
      ? { ...r, currency: next.budgetCurrency, items: next.budgetItems, total: next.budgetItems.reduce((s, i) => s + i.amount, 0) }
      : r))

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        eyebrow="MARKETING REPORTS"
        title="Collaboration Books"
        subtitle="What each collaboration trip costs internally. Guests pay nothing; these are the budget structures Marketing recorded."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="cb-from" className="text-xs text-muted-foreground">Trip start from</Label>
              <Input id="cb-from" type="date" value={from} onChange={e => setRange(e.target.value, to)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cb-to" className="text-xs text-muted-foreground">to</Label>
              <Input id="cb-to" type="date" value={to} onChange={e => setRange(from, e.target.value)} className="h-9 w-40" />
            </div>
            <Button variant="outline" className="h-9" onClick={() => setRange('', '')}>All time</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={Handshake} label="Collaboration books" value={String(active.length)}
          sub={rows.length > active.length ? `${rows.length - active.length} cancelled not counted` : 'Excludes cancelled'} />
        <KpiCard icon={Wallet} label="Total budget" value={totalLabel} />
        <KpiCard icon={Layers} label="Average per book" value={avgLabel} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-12 text-center">No collaboration books in this period. Create one from Calendar › Add Collaboration Book.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Booking</TableHead>
                    <TableHead>Trip</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>PIC</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => {
                    const open = expanded === r.id
                    return (
                      <Fragment key={r.id}>
                        <TableRow className={`cursor-pointer ${r.cancelled ? 'opacity-60' : ''}`} onClick={() => setExpanded(open ? null : r.id)}>
                          <TableCell className="pr-0">
                            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{r.bookingCode}</TableCell>
                          <TableCell className="text-sm">
                            <div>{r.tripType === 'OPEN_TRIP' ? (r.openTripTitle ?? 'Open Trip') : 'Private Charter'}</div>
                            <div className="text-xs text-muted-foreground">{[r.vessel, r.leadGuest && `${r.leadGuest} · ${r.guestCount} pax`].filter(Boolean).join(' · ')}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(r.startDate, 'medium', { utc: true })} – {formatDate(r.endDate, 'medium', { utc: true })}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate" title={r.purpose ?? undefined}>{r.purpose ?? '—'}</TableCell>
                          <TableCell className="text-sm">{r.createdByName ?? '—'}</TableCell>
                          <TableCell>
                            {r.cancelled ? <StatusBadge tone="neutral">Cancelled</StatusBadge> : <BookingStatusBadge status={r.status} />}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{r.items.length}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{formatMoney(r.total, { currency: r.currency })}</TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={9} className="bg-muted/20">
                              <div className="max-w-xl py-1">
                                <CollaborationBudgetCard
                                  booking={{ id: r.id, budgetCurrency: r.currency, budgetItems: r.items }}
                                  canEdit
                                  onSaved={next => patchRow(r.id, next)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {needs.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <ListTree className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Budget by need</p>
              <p className="text-xs text-muted-foreground">Same item name summed across all books in this period</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Need</TableHead>
                  <TableHead className="text-right">Books</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needs.map(n => (
                  <TableRow key={`${n.currency}|${n.name}`}>
                    <TableCell className="text-sm">{n.name}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{n.books}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(n.amount, { currency: n.currency })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
