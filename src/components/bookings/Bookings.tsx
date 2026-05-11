'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Search, Edit, BedDouble, AlertCircle,
  CreditCard, Receipt, Upload, ImageIcon, Trash2, Loader2,
} from 'lucide-react'
import { BookingWizard } from './BookingWizard'

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface BookingRecord {
  id: string
  bookingCode: string
  source: 'AGENT' | 'DIRECT'
  tripType: string
  startDate: string
  endDate: string
  totalPrice: number
  depositPaid: number
  discount: number
  guestCount: number
  status: string
  depositDueDate?: string | null
  finalDueDate?: string | null
  destination?: string
  notes?: string
  currency?: string
  exchangeRate?: number | null
  yacht?: { id: string; name: string; model?: string }
  openTrip?: { id: string; title: string; destination?: string }
  customer: { id: string; name: string; email?: string; phone?: string }
  agent?: { id: string; name: string; company?: string; commission?: number }
  guests: Array<{
    id: string; isLead: boolean; customerId: string
    customer?: { name: string }; cabin?: { name: string }
    arrivalPickupTime?: string | null; arrivalHotel?: string | null; arrivalFlight?: string | null
    departurePickupTime?: string | null; departureHotel?: string | null; departureFlight?: string | null
  }>
}

interface PaymentRecord {
  id: string
  bookingId: string
  invoiceNumber: string
  paymentType: string
  previouslyPaid: number
  amount: number
  currency: string
  status: string
  notes?: string
  hasProof?: boolean
  confirmedBy?: string
  confirmedAt?: string
  createdAt: string
  booking: {
    bookingCode: string
    tripType: string
    totalPrice: number
    depositPaid: number
    startDate: string
    endDate: string
    destination?: string
    customer: { name: string; email?: string; phone?: string }
    yacht?: { name: string; model?: string }
    openTrip?: { title: string; destination?: string }
    agent?: { name: string; company?: string }
    services: Array<{ name: string; price: number }>
  }
}

const netBook = (b: BookingRecord) =>
  b.source === 'AGENT' ? b.totalPrice * (1 - (b.agent?.commission ?? 0) / 100) : b.totalPrice

/* ─── Constants ─────────────────────────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  pending:        'bg-amber-100   text-amber-700   border-amber-200',
  partially_paid: 'bg-blue-100    text-blue-700    border-blue-200',
  fully_paid:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed:      'bg-purple-100  text-purple-700  border-purple-200',
  cancelled:      'bg-red-100     text-red-700     border-red-200',
  confirmed:      'bg-emerald-100 text-emerald-700 border-emerald-200',
}
const STATUS_LABELS: Record<string, string> = {
  pending:        'Pending',
  partially_paid: 'Partially Paid',
  fully_paid:     'Fully Paid',
  completed:      'Completed',
  cancelled:      'Cancelled',
  confirmed:      'Confirmed',
}
const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending_confirmation: { label: 'Awaiting Confirmation', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  confirmed:            { label: 'Confirmed',             color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected:             { label: 'Rejected',              color: 'bg-red-100 text-red-700 border-red-200' },
}

const ACCENT = '#bdac7e'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
const fmtDateInput = (d?: string | null) =>
  d ? new Date(d).toISOString().split('T')[0] : ''
const getDays = (s: string, e: string) =>
  Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000))
const fmtAmt = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function Bookings() {
  const { data: session } = useSession()
  const userRole          = (session?.user as { role?: string })?.role ?? ''
  const canManageBookings = userRole === 'ADMIN' || userRole === 'SALES'

  /* booking state */
  const [bookings,     setBookings]    = useState<BookingRecord[]>([])
  const [loading,      setLoading]     = useState(true)
  const [searchTerm,   setSearchTerm]  = useState('')
  const [statusFilter, setStatusFilter]= useState('all')
  const [sourceFilter, setSourceFilter]= useState('all')
  const [wizardOpen,   setWizardOpen]  = useState(false)
  const [editBooking,  setEditBooking] = useState<BookingRecord | null>(null)
  const [editSaving,   setEditSaving]  = useState(false)
  const [editStatus,   setEditStatus]  = useState('')
  const [editTotal,    setEditTotal]   = useState('')
  const [editDeposit,  setEditDeposit] = useState('')
  const [editDiscount, setEditDiscount]= useState('')
  const [editDepDue,   setEditDepDue]  = useState('')
  const [editFinalDue, setEditFinalDue]= useState('')
  const [editNotes,    setEditNotes]   = useState('')
  const [guestTravel,  setGuestTravel] = useState<Record<string, {
    arrivalPickupTime: string; arrivalHotel: string; arrivalFlight: string
    departurePickupTime: string; departureHotel: string; departureFlight: string
  }>>({})

  /* payment invoice state */
  const [paymentBooking, setPaymentBooking] = useState<BookingRecord | null>(null)
  const [paymentAmount,  setPaymentAmount]  = useState('')
  const [paymentNotes,   setPaymentNotes]   = useState('')
  const [paymentSaving,  setPaymentSaving]  = useState(false)
  const [payCurrency,    setPayCurrency]    = useState('USD')
  const [payAmtFocused,  setPayAmtFocused]  = useState(false)

  /* proof upload */
  const [proofPayment,   setProofPayment]   = useState<PaymentRecord | null>(null)
  const [proofPreview,   setProofPreview]   = useState<string | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [proofFetching,  setProofFetching]  = useState(false)
  const proofInputRef = useRef<HTMLInputElement>(null)

  /* payments list (for payment column context) */
  const [payments,        setPayments]        = useState<PaymentRecord[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  /* ── fetchers ── */
  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      if (res.ok) setBookings(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true)
    try {
      const res = await fetch('/api/payments')
      if (res.ok) setPayments(await res.json())
    } catch (err) { console.error(err) }
    finally { setPaymentsLoading(false) }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])
  useEffect(() => { if (canManageBookings) fetchPayments() }, [canManageBookings, fetchPayments])

  /* ── edit booking ── */
  const openEdit = (b: BookingRecord) => {
    setEditBooking(b)
    setEditStatus(b.status)
    setEditTotal(b.totalPrice.toString())
    setEditDeposit(b.depositPaid.toString())
    setEditDiscount(b.discount.toString())
    setEditDepDue(fmtDateInput(b.depositDueDate))
    setEditFinalDue(fmtDateInput(b.finalDueDate))
    setEditNotes(b.notes ?? '')
    const travel: typeof guestTravel = {}
    b.guests.forEach(g => {
      travel[g.id] = {
        arrivalPickupTime:   g.arrivalPickupTime   ?? '',
        arrivalHotel:        g.arrivalHotel        ?? '',
        arrivalFlight:       g.arrivalFlight       ?? '',
        departurePickupTime: g.departurePickupTime ?? '',
        departureHotel:      g.departureHotel      ?? '',
        departureFlight:     g.departureFlight     ?? '',
      }
    })
    setGuestTravel(travel)
  }
  const saveEdit = async () => {
    if (!editBooking) return
    setEditSaving(true)
    try {
      const [bookingRes] = await Promise.all([
        fetch(`/api/bookings/${editBooking.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: editStatus, totalPrice: editTotal, depositPaid: editDeposit,
            discount: editDiscount, depositDueDate: editDepDue || null,
            finalDueDate: editFinalDue || null, notes: editNotes,
          }),
        }),
        ...Object.entries(guestTravel).map(([guestId, travel]) =>
          fetch(`/api/guests/${guestId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(travel),
          })
        ),
      ])
      if (bookingRes.ok) { await fetchBookings(); setEditBooking(null) }
    } catch (e) { console.error(e) }
    finally { setEditSaving(false) }
  }

  /* ── delete booking ── */
  const deleteBooking = async (b: BookingRecord) => {
    if (!confirm(`Delete booking ${b.bookingCode}? This cannot be undone.`)) return
    try {
      await fetch(`/api/bookings/${b.id}`, { method: 'DELETE' })
      await fetchBookings()
    } catch (e) { console.error(e) }
  }

  /* ── record payment ── */
  const openPayment = (b: BookingRecord) => {
    setPaymentBooking(b)
    const initCurr = (b.currency && b.currency !== 'USD') ? b.currency : 'USD'
    setPayCurrency(initCurr)
    setPayAmtFocused(false)
    const remainingUSD = netBook(b) - b.depositPaid
    if (remainingUSD > 0) {
      const rate = b.exchangeRate ?? 1
      const displayAmt = (initCurr !== 'USD' && rate > 0) ? remainingUSD * rate : remainingUSD
      setPaymentAmount(displayAmt.toFixed(initCurr === 'IDR' ? 0 : 2))
    } else {
      setPaymentAmount('')
    }
    setPaymentNotes('')
  }
  const submitPayment = async () => {
    if (!paymentBooking || !paymentAmount) return
    setPaymentSaving(true)
    const rawAmt  = parseFloat(String(paymentAmount).replace(/,/g, '')) || 0
    const rate    = paymentBooking.exchangeRate ?? 1
    const amtUSD  = (payCurrency !== 'USD' && rate > 0) ? rawAmt / rate : rawAmt
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: paymentBooking.id, amount: amtUSD, currency: 'USD', notes: paymentNotes }),
      })
      if (res.ok) {
        setPaymentBooking(null)
        await Promise.all([fetchPayments(), fetchBookings()])
        window.dispatchEvent(new CustomEvent('payment-updated'))
      }
    } catch (e) { console.error(e) }
    finally { setPaymentSaving(false) }
  }

  /* ── proof upload ── */
  const openProofUpload = async (p: PaymentRecord) => {
    setProofPayment(p)
    setProofPreview(null)
    if (p.hasProof) {
      setProofFetching(true)
      try {
        const res = await fetch(`/api/payments/${p.id}`)
        if (res.ok) {
          const detail = await res.json()
          setProofPreview(detail.proofOfTransfer ?? null)
        }
      } catch (e) { console.error(e) }
      finally { setProofFetching(false) }
    }
  }
  const handleProofFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setProofPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }
  const saveProof = async () => {
    if (!proofPayment || !proofPreview) return
    setProofUploading(true)
    try {
      const res = await fetch(`/api/payments/${proofPayment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofOfTransfer: proofPreview }),
      })
      if (res.ok) { await fetchPayments(); setProofPayment(null); setProofPreview(null) }
    } catch (e) { console.error(e) }
    finally { setProofUploading(false) }
  }

  /* ── filters ── */
  const filtered = bookings.filter(b => {
    const q = searchTerm.toLowerCase()
    const matchSearch =
      b.bookingCode.toLowerCase().includes(q) ||
      b.customer.name.toLowerCase().includes(q) ||
      (b.yacht?.name ?? '').toLowerCase().includes(q) ||
      (b.openTrip?.title ?? '').toLowerCase().includes(q) ||
      (b.agent?.name ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || b.status === statusFilter
    const matchSource = sourceFilter === 'all' || b.source === sourceFilter
    return matchSearch && matchStatus && matchSource
  })

  const isDepositOverdue = (b: BookingRecord) =>
    b.status === 'pending' && !!b.depositDueDate && new Date(b.depositDueDate) < new Date()

  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Bookings</h3>
          <p className="text-muted-foreground text-sm">Manage all yacht reservations</p>
        </div>
        {canManageBookings && (
          <Button onClick={() => setWizardOpen(true)} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" /> New Booking
          </Button>
        )}
      </div>

      {/* ── Bookings Table ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All Bookings</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} booking${filtered.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="fully_paid">Fully Paid</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="DIRECT">Direct</SelectItem>
                  <SelectItem value="AGENT">Agent</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by code, customer, yacht, agent..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-7 h-8 text-xs w-72"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Yacht / Trip</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Due Dates</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageBookings && <TableHead className="text-center">Payment</TableHead>}
                  {canManageBookings && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || (canManageBookings && paymentsLoading) ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canManageBookings ? 12 : 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManageBookings ? 12 : 10} className="text-center py-12 text-muted-foreground">
                      {bookings.length === 0
                        ? 'No bookings yet — click "New Booking" to get started.'
                        : 'No bookings match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : filtered.map(b => (
                  <TableRow key={b.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-medium">{b.bookingCode}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <Badge variant="outline" className="text-xs"
                          style={b.source === 'AGENT' ? { borderColor: ACCENT, color: ACCENT } : {}}>
                          {b.source === 'AGENT' ? 'Agent' : 'Direct'}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {b.tripType === 'OPEN_TRIP' ? 'Open Trip' : 'Private Charter'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {b.tripType === 'OPEN_TRIP' ? b.openTrip?.title : b.yacht?.name ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.tripType === 'OPEN_TRIP' ? b.openTrip?.destination : b.yacht?.model}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{b.customer.name}</div>
                      {b.agent && <div className="text-xs text-muted-foreground">via {b.agent.name}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <div>{fmtDate(b.startDate)}</div>
                        <div className="text-muted-foreground">{fmtDate(b.endDate)}</div>
                        <div className="text-muted-foreground">{getDays(b.startDate, b.endDate)}d</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{b.guestCount}</TableCell>
                    <TableCell className="text-sm font-medium">
                      ${netBook(b).toLocaleString()}
                      {b.source === 'AGENT' && (b.agent?.commission ?? 0) > 0
                        ? <div className="text-xs text-blue-600">{b.agent!.commission}% comm</div>
                        : b.discount > 0 && <div className="text-xs text-emerald-600">{b.discount}% off</div>}
                    </TableCell>
                    <TableCell className="text-sm">${b.depositPaid.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5 min-w-20">
                        {b.depositDueDate ? (
                          <div className={`flex items-center gap-1 ${isDepositOverdue(b) ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {isDepositOverdue(b) && <AlertCircle className="w-3 h-3 shrink-0" />}
                            DP: {fmtDate(b.depositDueDate)}
                          </div>
                        ) : <span className="text-muted-foreground/50">—</span>}
                        {b.finalDueDate && (
                          <div className="text-muted-foreground">Bal: {fmtDate(b.finalDueDate)}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[b.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </TableCell>
                    {canManageBookings && (() => {
                      const bookingPmts = payments.filter(p => p.bookingId === b.id)
                      const pendingPmt  = bookingPmts.find(p => p.status === 'pending_confirmation')
                      const hasAnyPmt   = bookingPmts.length > 0
                      const canRecord   = b.status !== 'cancelled' && b.status !== 'fully_paid' && b.status !== 'completed'
                      const nextType    = hasAnyPmt ? 'Pelunasan' : 'DP'
                      return (
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            {canRecord && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => openPayment(b)}
                              >
                                <CreditCard className="h-3 w-3 mr-1" /> Buat Invoice {nextType}
                              </Button>
                            )}
                            {pendingPmt && (
                              <Button
                                variant="ghost" size="sm"
                                className={`h-7 px-2 text-xs ${pendingPmt.hasProof ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'}`}
                                onClick={() => openProofUpload(pendingPmt)}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                {pendingPmt.hasProof ? 'Update Bukti' : 'Upload Bukti'}
                              </Button>
                            )}
                            {bookingPmts.map((p, idx) => (
                              <Button
                                key={p.id}
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => window.open(`/print/invoice/${p.id}`, '_blank')}
                              >
                                <Receipt className="h-3 w-3 mr-1" />
                                {p.paymentType === 'PELUNASAN'
                                  ? 'Invoice Pelunasan'
                                  : idx === 0 ? 'Invoice DP' : `Invoice ${idx + 1}`}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      )
                    })()}
                    {canManageBookings && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {userRole === 'ADMIN' && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteBooking(b)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ════ Record Payment Dialog ════ */}
      <Dialog open={!!paymentBooking} onOpenChange={v => !v && setPaymentBooking(null)}>
        <DialogContent className={paymentBooking && payments.filter(p => p.bookingId === paymentBooking.id).length > 0 ? 'sm:max-w-2xl' : 'sm:max-w-md'}>
          {paymentBooking && (() => {
            const prev        = payments.filter(p => p.bookingId === paymentBooking.id)
            const hasHistory  = prev.length > 0
            const bookingCurr = paymentBooking.currency ?? 'USD'
            const hasAltCurr  = bookingCurr !== 'USD'
            const rate        = paymentBooking.exchangeRate ?? 1
            const CURR_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', IDR: 'Rp' }
            const currSymbol  = CURR_SYMBOLS[payCurrency] ?? payCurrency
            const isIDR       = payCurrency === 'IDR'

            const toDisplay = (usd: number) =>
              payCurrency !== 'USD' && rate > 0 ? usd * rate : usd

            const fmtPayAmt = (usd: number) => {
              const v = toDisplay(usd)
              if (isIDR) return `Rp ${v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
              return `${currSymbol}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" style={{ color: ACCENT }} />
                    Record Payment
                  </DialogTitle>
                </DialogHeader>

                {/* Currency toggle — only shown if booking has non-USD currency */}
                {hasAltCurr && (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}06` }}>
                    <span className="text-xs text-muted-foreground shrink-0">Pay in</span>
                    <div className="flex gap-1.5">
                      {(['USD', bookingCurr] as string[]).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            if (c === payCurrency) return
                            // Convert current amount to new currency
                            const raw = parseFloat(String(paymentAmount).replace(/,/g, '')) || 0
                            if (raw > 0) {
                              const inUSD = payCurrency !== 'USD' && rate > 0 ? raw / rate : raw
                              const inNew = c !== 'USD' && rate > 0 ? inUSD * rate : inUSD
                              setPaymentAmount(inNew.toFixed(c === 'IDR' ? 0 : 2))
                            }
                            setPayCurrency(c)
                          }}
                          className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                          style={payCurrency === c
                            ? { backgroundColor: ACCENT, color: 'white', borderColor: ACCENT }
                            : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    {payCurrency !== 'USD' && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        1 USD = {rate.toLocaleString('en-US', { maximumFractionDigits: isIDR ? 0 : 4 })} {bookingCurr}
                      </span>
                    )}
                  </div>
                )}

                <div className={hasHistory ? 'grid grid-cols-2 gap-3' : ''}>
                  {/* Left: booking summary */}
                  <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Booking</span>
                      <span className="font-mono font-semibold">{paymentBooking.bookingCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">{paymentBooking.customer.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium">{fmtPayAmt(netBook(paymentBooking))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Already Paid</span>
                      <span className="font-medium text-emerald-600">{fmtPayAmt(paymentBooking.depositPaid)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-semibold">
                      <span>Remaining</span>
                      <span className={netBook(paymentBooking) - paymentBooking.depositPaid > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                        {fmtPayAmt(Math.max(0, netBook(paymentBooking) - paymentBooking.depositPaid))}
                      </span>
                    </div>
                  </div>

                  {/* Right: payment history (only when exists) */}
                  {hasHistory && (
                    <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-2">
                      <p className="text-muted-foreground text-[11px] uppercase tracking-wide font-semibold">Riwayat Pembayaran</p>
                      <div className="space-y-1.5">
                        {prev.map(p => {
                          const ps = PAYMENT_STATUS[p.status]
                          return (
                            <div key={p.id} className="space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[11px] text-muted-foreground">{p.invoiceNumber}</span>
                                <span className="text-xs font-semibold">{fmtAmt(p.amount)}</span>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${ps?.color ?? 'bg-muted text-muted-foreground'}`}>
                                {ps?.label ?? p.status}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Payment Amount ({payCurrency}) <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-muted-foreground select-none">{currSymbol}</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={
                          payAmtFocused || !paymentAmount
                            ? paymentAmount
                            : (parseFloat(String(paymentAmount).replace(/,/g, '')) || 0).toLocaleString('en-US', { maximumFractionDigits: isIDR ? 0 : 2 })
                        }
                        onFocus={() => setPayAmtFocused(true)}
                        onBlur={() => setPayAmtFocused(false)}
                        onChange={e => setPaymentAmount(e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                        className="pl-7"
                      />
                    </div>
                    {payCurrency !== 'USD' && paymentAmount && (
                      <p className="text-xs text-muted-foreground">
                        ≈ ${((parseFloat(String(paymentAmount).replace(/,/g, '')) || 0) / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD — stored as USD
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Kurang dari total → Partially Paid · Sama dengan total → Fully Paid
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Textarea placeholder="e.g. Bank transfer via BCA, ref #123456"
                      value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
                      rows={2} className="text-sm resize-none" />
                  </div>
                  <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    ℹ Setelah submit, tombol <strong>Lihat Invoice</strong> dan <strong>Upload Bukti</strong> akan muncul di baris booking.
                  </p>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setPaymentBooking(null)}>Cancel</Button>
                  <Button disabled={paymentSaving || !paymentAmount || (parseFloat(String(paymentAmount).replace(/,/g, '')) || 0) <= 0}
                    onClick={submitPayment}
                    style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                    {paymentSaving ? 'Submitting…' : 'Submit & Generate Invoice'}
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ════ Upload Proof of Transfer Dialog ════ */}
      <Dialog open={!!proofPayment} onOpenChange={v => { if (!v) { setProofPayment(null); setProofPreview(null) } }}>
        <DialogContent className="sm:max-w-md">
          {proofPayment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="h-4 w-4" style={{ color: ACCENT }} />
                  Upload Transfer Proof
                </DialogTitle>
              </DialogHeader>

              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1 mb-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice</span>
                  <span className="font-mono font-semibold">{proofPayment.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-semibold">{fmtAmt(proofPayment.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{proofPayment.booking.customer.name}</span>
                </div>
              </div>

              <div
                className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors min-h-36 overflow-hidden relative ${proofFetching ? 'cursor-default' : 'cursor-pointer hover:border-primary/50'}`}
                onClick={() => { if (!proofFetching) proofInputRef.current?.click() }}
              >
                {proofFetching ? (
                  <div className="flex flex-col items-center gap-2.5 py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin opacity-40" />
                    <p className="text-sm">Memeriksa bukti transfer...</p>
                  </div>
                ) : proofPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proofPreview} alt="Transfer proof" className="w-full max-h-72 object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <ImageIcon className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Click to select image</p>
                    <p className="text-xs opacity-60">JPG, PNG, or PDF screenshot</p>
                  </div>
                )}
              </div>
              <input
                ref={proofInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProofFile}
              />
              {proofPreview && (
                <Button variant="ghost" size="sm" className="text-xs w-full"
                  onClick={() => proofInputRef.current?.click()}>
                  Change image
                </Button>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setProofPayment(null); setProofPreview(null) }}>Cancel</Button>
                <Button disabled={!proofPreview || proofUploading || proofFetching}
                  onClick={saveProof}
                  style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                  {proofUploading ? 'Uploading…' : 'Save Proof'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ════ Edit Booking Dialog ════ */}
      <Dialog open={!!editBooking} onOpenChange={v => !v && setEditBooking(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {editBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-base">{editBooking.bookingCode}</span>
                  <span className="text-sm font-normal text-muted-foreground">— Edit Booking</span>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-0.5">Customer</p>
                  <p className="font-semibold">{editBooking.customer.name}</p>
                  {editBooking.agent && <p className="text-muted-foreground">via {editBooking.agent.name}</p>}
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-0.5">{editBooking.tripType === 'OPEN_TRIP' ? 'Trip' : 'Yacht'}</p>
                  <p className="font-semibold">{editBooking.tripType === 'OPEN_TRIP' ? editBooking.openTrip?.title : editBooking.yacht?.name}</p>
                  <p className="text-muted-foreground">{fmtDate(editBooking.startDate)} → {fmtDate(editBooking.endDate)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-0.5">Guests & Cabins</p>
                  {editBooking.guests.map(g => (
                    <div key={g.id} className="flex items-center gap-1">
                      <span className="font-medium">{g.customer?.name ?? '—'}</span>
                      {g.cabin && <span className="text-muted-foreground flex items-center gap-0.5"><BedDouble className="w-2.5 h-2.5" /> {g.cabin.name}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Guest Travel Details ── */}
              {editBooking.guests.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guest Travel Details</p>
                  {editBooking.guests.map(g => {
                    const t = guestTravel[g.id] ?? { arrivalPickupTime: '', arrivalHotel: '', arrivalFlight: '', departurePickupTime: '', departureHotel: '', departureFlight: '' }
                    const setT = (k: keyof typeof t) => (e: React.ChangeEvent<HTMLInputElement>) =>
                      setGuestTravel(prev => ({ ...prev, [g.id]: { ...t, [k]: e.target.value } }))
                    return (
                      <div key={g.id} className="rounded-lg border p-3 space-y-2.5">
                        <p className="text-xs font-semibold">{g.customer?.name ?? '—'}{g.isLead && <span className="ml-1.5 text-[10px] text-amber-600 font-normal">Group Leader</span>}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a5f6e]">Arrival</p>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Pick-up Date & Time</Label>
                              <Input value={t.arrivalPickupTime} onChange={setT('arrivalPickupTime')} placeholder="e.g. 12 Jul, 09:00" className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Hotel / Airport</Label>
                              <Input value={t.arrivalHotel} onChange={setT('arrivalHotel')} placeholder="Hotel or airport name" className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Flight Number</Label>
                              <Input value={t.arrivalFlight} onChange={setT('arrivalFlight')} placeholder="GA123" className="h-7 text-xs" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a5f6e]">Departure</p>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Pick-up Date & Time</Label>
                              <Input value={t.departurePickupTime} onChange={setT('departurePickupTime')} placeholder="e.g. 15 Jul, 14:00" className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Hotel / Airport</Label>
                              <Input value={t.departureHotel} onChange={setT('departureHotel')} placeholder="Hotel or airport name" className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Flight Number</Label>
                              <Input value={t.departureFlight} onChange={setT('departureFlight')} placeholder="GA456" className="h-7 text-xs" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="fully_paid">Fully Paid</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Auto-computed from payments. Only Completed & Cancelled are manual.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount (%)</Label>
                  <Input type="number" min="0" max="100" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Total Price (USD)</Label>
                  <Input type="number" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount Paid (USD)</Label>
                  <Input type="number" min="0" value={editDeposit} onChange={e => setEditDeposit(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Due Date</Label>
                  <Input type="date" value={editDepDue} onChange={e => setEditDepDue(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Final Balance Due Date</Label>
                  <Input type="date" value={editFinalDue} min={editDepDue} onChange={e => setEditFinalDue(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Input placeholder="Internal notes…" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditBooking(null)}>Cancel</Button>
                <Button disabled={editSaving} onClick={saveEdit}
                  style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <BookingWizard open={wizardOpen} onOpenChange={setWizardOpen} onSuccess={fetchBookings} />
    </div>
  )
}
