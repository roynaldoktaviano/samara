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
  CreditCard, Receipt, Upload, ImageIcon, Trash2, Loader2, Pencil, PlaneTakeoff, FileText, User, Building2,
  SlidersHorizontal, X, Calendar, Ship, Tag, Layers, RotateCw, Waves, ChevronRight,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { BookingWizard } from './BookingWizard'
import GuestEditSheet from '@/components/customers/GuestEditSheet'

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
  holdUntil?: string | null
  destination?: string
  notes?: string
  cancelReason?: string | null
  salesperson?: string | null
  salespersonUser?: { name: string | null } | null
  currency?: string
  exchangeRate?: number | null
  createdAt?: string
  hasDiving?: boolean
  yacht?: { id: string; name: string; model?: string; canDiving?: boolean }
  openTrip?: { id: string; title: string; destination?: string }
  customer: { id: string; name: string; email?: string; phone?: string }
  agent?:        { id: string; name: string; commission?: number }
  agentContact?: { id: string; name: string; email?: string | null; whatsapp?: string | null } | null
  services?:     Array<{ id: string; name: string; price: number; quantity: number }>
  salespersonId?: string | null
  guests: Array<{
    id: string; isLead: boolean; customerId: string
    customer?: { name: string }; cabin?: { id: string; name: string }
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
  paymentMethod?: string | null
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
  on_hold:        'bg-green-100   text-green-700   border-green-200',
  pending:        'bg-yellow-100  text-yellow-700  border-yellow-200',
  partially_paid: 'bg-blue-100    text-blue-700    border-blue-200',
  fully_paid:     'bg-red-100     text-red-700     border-red-200',
  completed:      'bg-purple-100  text-purple-700  border-purple-200',
  cancelled:      'bg-slate-100   text-slate-500   border-slate-200',
  confirmed:      'bg-red-100     text-red-700     border-red-200',
}
const STATUS_LABELS: Record<string, string> = {
  on_hold:        'On Hold',
  pending:        'Pending',
  partially_paid: 'Partially Paid',
  fully_paid:     'Fully Paid',
  completed:      'Completed',
  cancelled:      'Cancelled',
  confirmed:      'Confirmed',
}
const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  requested:            { label: 'Awaiting Finance',      color: 'bg-blue-50 text-blue-600 border-blue-200' },
  invoice_ready:        { label: 'Invoice Ready',         color: 'bg-violet-100 text-violet-700 border-violet-200' },
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
  const [typeFilter,   setTypeFilter]  = useState('all')
  const [dateFrom,     setDateFrom]    = useState('')
  const [dateTo,       setDateTo]      = useState('')
  const [wizardOpen,        setWizardOpen]        = useState(false)
  const [completeBookingId, setCompleteBookingId] = useState<string | undefined>(undefined)
  const [editBooking,       setEditBooking]       = useState<BookingRecord | null>(null)
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
  const [paymentBooking,  setPaymentBooking]  = useState<BookingRecord | null>(null)
  const [paymentNotes,    setPaymentNotes]    = useState('')
  const [paymentSaving,   setPaymentSaving]   = useState(false)
  const [payAmtMode,      setPayAmtMode]      = useState<'amount' | 'percent'>('amount')
  const [payAmtValue,     setPayAmtValue]     = useState('')
  const [payPctValue,     setPayPctValue]     = useState('')
  const [payBillTo,       setPayBillTo]       = useState<'AGENT' | 'CUSTOMER'>('AGENT')
  const [payMethod,       setPayMethod]       = useState('Transfer Bank')

  /* proof / submit payment */
  const [proofPayment,   setProofPayment]   = useState<PaymentRecord | null>(null)
  const [proofPreview,   setProofPreview]   = useState<string | null>(null)
  const [proofMethod,    setProofMethod]    = useState('Transfer Bank')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofFetching,  setProofFetching]  = useState(false)
  const proofInputRef = useRef<HTMLInputElement>(null)

  /* payments list (for payment column context) */
  const [payments,        setPayments]        = useState<PaymentRecord[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  /* guest travel dialog */
  const [travelBooking, setTravelBooking] = useState<BookingRecord | null>(null)
  const [travelSaving,  setTravelSaving]  = useState(false)

  /* booking detail sheet */
  const [detailBooking,       setDetailBooking]       = useState<BookingRecord | null>(null)
  const [detailCabins,        setDetailCabins]        = useState<any[]>([])
  const [detailCabinsLoading, setDetailCabinsLoading] = useState(false)
  const [cancelDialogBooking, setCancelDialogBooking] = useState<BookingRecord | null>(null)
  const [cancelReasonText,    setCancelReasonText]    = useState('')
  const [cancelSaving,        setCancelSaving]        = useState(false)
  /* reschedule inside edit dialog */
  const [rescheduleMode,      setRescheduleMode]      = useState(false)
  const [rescheduleStart,     setRescheduleStart]     = useState('')
  const [rescheduleEnd,       setRescheduleEnd]       = useState('')
  const [rescheduleReason,    setRescheduleReason]    = useState('')
  const [rescheduleSaving,    setRescheduleSaving]    = useState(false)
  const [rescheduleOpenTrips, setRescheduleOpenTrips] = useState<Array<{ id: string; title: string; destination?: string | null; startDate: string; endDate: string; spotsAvailable: number; cabinStatuses: Array<{ id: string; name: string; bookingStatus: string | null }> }>>([])
  const [rescheduleOTId,      setRescheduleOTId]      = useState('')
  const [rescheduleOTLoading, setRescheduleOTLoading] = useState(false)
  const [rescheduleNewCabinId,  setRescheduleNewCabinId]  = useState('')
  const [rescheduleYachts,      setRescheduleYachts]      = useState<Array<{ id: string; name: string; model?: string }>>([])
  const [rescheduleYachtId,     setRescheduleYachtId]     = useState('')
  const [rescheduleYachtLoading,setRescheduleYachtLoading]= useState(false)
  /* cancel inside edit dialog */
  const [editCancelMode,   setEditCancelMode]   = useState(false)
  const [editCancelReason, setEditCancelReason] = useState('')
  const [editCancelSaving, setEditCancelSaving] = useState(false)
  const [editGuestId,      setEditGuestId]      = useState<string | null>(null)
  const [editGuestBgId,       setEditGuestBgId]       = useState<string | null>(null)
  const [editGuestHasDiving,  setEditGuestHasDiving]  = useState(false)
  const [cabinSaving,         setCabinSaving]         = useState<string | null>(null) // bgId being saved

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
    setRescheduleMode(false); setRescheduleStart(''); setRescheduleEnd(''); setRescheduleReason('')
    setRescheduleOTId(''); setRescheduleOpenTrips([]); setRescheduleNewCabinId('')
    setRescheduleYachtId(''); setRescheduleYachts([])
    setEditCancelMode(false); setEditCancelReason('')
  }
  const saveEdit = async () => {
    if (!editBooking) return
    setEditSaving(true)
    try {
      const bookingRes = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus, totalPrice: editTotal, depositPaid: editDeposit,
          discount: editDiscount, depositDueDate: editDepDue || null,
          finalDueDate: editFinalDue || null, notes: editNotes,
        }),
      })
      if (bookingRes.ok) { await fetchBookings(); setEditBooking(null) }
    } catch (e) { console.error(e) }
    finally { setEditSaving(false) }
  }

  const applyReschedule = async () => {
    if (!editBooking || !rescheduleReason.trim()) return
    const isOT = editBooking.tripType === 'OPEN_TRIP'
    if (isOT && (!rescheduleOTId || !rescheduleNewCabinId)) return
    if (!isOT && (!rescheduleStart || !rescheduleEnd)) return
    setRescheduleSaving(true)
    try {
      const selectedOT = isOT ? rescheduleOpenTrips.find(t => t.id === rescheduleOTId) : null
      const body: Record<string, string> = { rescheduleReason: rescheduleReason.trim() }
      if (isOT && selectedOT) {
        body.openTripId   = selectedOT.id
        body.startDate    = selectedOT.startDate
        body.endDate      = selectedOT.endDate
        body.newCabinId   = rescheduleNewCabinId
      } else {
        body.startDate = rescheduleStart
        body.endDate   = rescheduleEnd
        if (rescheduleYachtId) body.yachtId = rescheduleYachtId
      }
      const res = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) { await fetchBookings(); setEditBooking(null) }
    } catch (e) { console.error(e) }
    finally { setRescheduleSaving(false) }
  }

  const confirmEditCancel = async () => {
    if (!editBooking || !editCancelReason.trim()) return
    setEditCancelSaving(true)
    try {
      const res = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelReason: editCancelReason.trim() }),
      })
      if (res.ok) { await fetchBookings(); setEditBooking(null) }
    } catch (e) { console.error(e) }
    finally { setEditCancelSaving(false) }
  }

  /* ── delete booking ── */
  const deleteBooking = async (b: BookingRecord) => {
    if (!confirm(`Delete booking ${b.bookingCode}? This cannot be undone.`)) return
    try {
      await fetch(`/api/bookings/${b.id}`, { method: 'DELETE' })
      await fetchBookings()
    } catch (e) { console.error(e) }
  }

  /* ── cancel booking ── */
  const openCancelDialog = (b: BookingRecord) => {
    setCancelReasonText('')
    setCancelDialogBooking(b)
  }

  const confirmCancelBooking = async () => {
    if (!cancelDialogBooking) return
    setCancelSaving(true)
    try {
      await fetch(`/api/bookings/${cancelDialogBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelReason: cancelReasonText.trim() || null }),
      })
      await fetchBookings()
      setCancelDialogBooking(null)
      setDetailBooking(null)
    } catch (e) { console.error(e) }
    finally { setCancelSaving(false) }
  }

  /* ── request invoice ── */
  const openPayment = (b: BookingRecord) => {
    setPaymentBooking(b)
    setPaymentNotes('')
    setPayAmtMode('amount')
    setPayAmtValue('')
    setPayPctValue('')
    setPayBillTo(b.source === 'AGENT' ? 'AGENT' : 'CUSTOMER')
    setPayMethod('Transfer Bank')
  }
  const submitPayment = async () => {
    if (!paymentBooking) return
    setPaymentSaving(true)
    const remaining = Math.max(0, netBook(paymentBooking) - paymentBooking.depositPaid)
    let amount = 0
    if (payAmtMode === 'amount') {
      amount = parseFloat(payAmtValue.replace(/,/g, '')) || 0
    } else {
      const pct = Math.min(100, Math.max(0, parseFloat(payPctValue) || 0))
      amount = Math.round(remaining * pct / 100 * 100) / 100
    }
    if (amount <= 0 || amount > remaining) { setPaymentSaving(false); return }
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: paymentBooking.id,
          notes: paymentNotes,
          amount: amount > 0 ? amount : undefined,
          billToType: payBillTo,
          paymentMethod: payMethod || undefined,
        }),
      })
      if (res.ok) {
        setPaymentBooking(null)
        await Promise.all([fetchPayments(), fetchBookings()])
        window.dispatchEvent(new CustomEvent('payment-updated'))
      }
    } catch (e) { console.error(e) }
    finally { setPaymentSaving(false) }
  }

  const SHARED_KEY = '__shared__'

  const openTravel = (b: BookingRecord) => {
    const first = b.guests[0]
    setGuestTravel({
      [SHARED_KEY]: {
        arrivalPickupTime:   first?.arrivalPickupTime   ?? '',
        arrivalHotel:        first?.arrivalHotel        ?? '',
        arrivalFlight:       first?.arrivalFlight       ?? '',
        departurePickupTime: first?.departurePickupTime ?? '',
        departureHotel:      first?.departureHotel      ?? '',
        departureFlight:     first?.departureFlight     ?? '',
      },
    })
    setTravelBooking(b)
  }

  const saveTravel = async () => {
    if (!travelBooking) return
    setTravelSaving(true)
    try {
      const shared = guestTravel[SHARED_KEY]
      if (shared) {
        await Promise.all(
          travelBooking.guests.map(g =>
            fetch(`/api/guests/${g.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(shared),
            })
          )
        )
      }
      await fetchBookings()
      setTravelBooking(null)
    } catch (e) { console.error(e) }
    finally { setTravelSaving(false) }
  }

  const openDetail = async (b: BookingRecord) => {
    setDetailBooking(b)
    setDetailCabins([])
    if (b.tripType === 'OPEN_TRIP' && b.openTrip?.id) {
      setDetailCabinsLoading(true)
      try {
        const res = await fetch(`/api/open-trips/${b.openTrip.id}`)
        if (res.ok) setDetailCabins((await res.json()).cabins ?? [])
      } catch (e) { console.error(e) }
      finally { setDetailCabinsLoading(false) }
    }
  }

  const saveCabin = async (bgId: string, cabinId: string) => {
    setCabinSaving(bgId)
    try {
      await fetch(`/api/guests/${bgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cabinId }),
      })
      await fetchBookings()
      // refresh detail with updated data
      const updated = await fetch('/api/bookings').then(r => r.json())
      const fresh = (updated as BookingRecord[]).find(b => b.id === detailBooking?.id)
      if (fresh) setDetailBooking(fresh)
      await openDetail(fresh ?? detailBooking!)
    } catch (e) { console.error(e) }
    finally { setCabinSaving(null) }
  }

  /* ── submit payment proof ── */
  const openProofUpload = (p: PaymentRecord) => {
    setProofPayment(p)
    setProofPreview(null)
  }
  const handleProofFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG and PNG files are allowed')
      e.target.value = ''
      return
    }
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1200
      let { width, height } = img
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height)
        width  = Math.round(width  * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      setProofPreview(canvas.toDataURL('image/jpeg', 0.75))
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
  }
  const saveProof = async () => {
    if (!proofPayment || !proofPreview) return
    setProofUploading(true)
    try {
      const res = await fetch(`/api/payments/${proofPayment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_proof', proofOfTransfer: proofPreview }),
      })
      if (res.ok) {
        await Promise.all([fetchPayments(), fetchBookings()])
        setProofPayment(null)
        setProofPreview(null)
        window.dispatchEvent(new CustomEvent('payment-updated'))
      }
    } catch (e) { console.error(e) }
    finally { setProofUploading(false) }
  }

  /* ── filters ── */
  const hasActiveFilter = statusFilter !== 'all' || sourceFilter !== 'all' || typeFilter !== 'all' || !!dateFrom || !!dateTo || !!searchTerm
  const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); setSourceFilter('all'); setTypeFilter('all'); setDateFrom(''); setDateTo('') }

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
    const matchType   = typeFilter   === 'all' || b.tripType === typeFilter
    const matchDate   = (() => {
      if (!dateFrom && !dateTo) return true
      const s = b.startDate.split('T')[0]
      const e = b.endDate.split('T')[0]
      if (dateFrom && e < dateFrom) return false
      if (dateTo   && s > dateTo)   return false
      return true
    })()
    return matchSearch && matchStatus && matchSource && matchType && matchDate
  })

  const isDepositOverdue = (b: BookingRecord) =>
    b.status === 'pending' && !!b.depositDueDate && new Date(b.depositDueDate) < new Date()

  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">Bookings</h3>
            <button onClick={() => fetchBookings()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
        <CardHeader className="pb-3">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>All Bookings</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} of ${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="font-medium">Filters</span>
              {hasActiveFilter && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors text-[11px] font-semibold"
                >
                  <X className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>
          </div>

          {/* Filter row 1: search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by code, customer, yacht, agent..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {searchTerm && (
              <button className="absolute right-2.5 top-2.5" onClick={() => setSearchTerm('')}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Filter row 2: dropdowns + date range */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Trip Type */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className={`h-8 text-xs pr-2 border rounded-lg w-32 sm:w-[148px] ${typeFilter !== 'all' ? 'border-violet-400 bg-violet-50 text-violet-700 font-semibold' : ''}`}>
                  <SelectValue placeholder="Trip Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="PRIVATE_CHARTER">Private Charter</SelectItem>
                  <SelectItem value="OPEN_TRIP">Open Trip</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={`h-8 text-xs pr-2 border rounded-lg w-32 sm:w-[148px] ${statusFilter !== 'all' ? 'border-amber-400 bg-amber-50 text-amber-700 font-semibold' : ''}`}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="fully_paid">Fully Paid</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className={`h-8 text-xs pr-2 border rounded-lg w-28 sm:w-[120px] ${sourceFilter !== 'all' ? 'border-sky-400 bg-sky-50 text-sky-700 font-semibold' : ''}`}>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="DIRECT">Direct</SelectItem>
                  <SelectItem value="AGENT">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground hidden sm:inline">Trip date</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className={`h-8 text-xs w-32 sm:w-36 ${dateFrom ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold' : ''}`}
                title="From date"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={e => setDateTo(e.target.value)}
                className={`h-8 text-xs w-32 sm:w-36 ${dateTo ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold' : ''}`}
                title="To date"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Yacht / Trip</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="hidden md:table-cell">Guests</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden md:table-cell">Paid</TableHead>
                  <TableHead className="hidden lg:table-cell">Due Dates</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageBookings && <TableHead className="hidden sm:table-cell text-center">Payment</TableHead>}
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
                  <TableRow key={b.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(b)}>
                    <TableCell>
                      <div className="font-mono text-xs font-medium">{b.bookingCode}</div>
                      {b.createdAt && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(b.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
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
                    <TableCell className="hidden md:table-cell text-sm">{b.guestCount}</TableCell>
                    <TableCell className="text-sm font-medium">
                      ${netBook(b).toLocaleString()}
                      {b.source === 'AGENT' && (b.agent?.commission ?? 0) > 0
                        ? <div className="text-xs text-blue-600">{b.agent!.commission}% comm</div>
                        : b.discount > 0 && <div className="text-xs text-emerald-600">{b.discount}% off</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">${b.depositPaid.toLocaleString()}</TableCell>
                    <TableCell className="hidden lg:table-cell">
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
                      const bookingPmts     = payments.filter(p => p.bookingId === b.id)
                      const activePmt       = bookingPmts.find(p => ['requested', 'invoice_ready', 'pending_confirmation'].includes(p.status))
                      const confirmedPmts   = bookingPmts.filter(p => p.status === 'confirmed')
                      const hasConfirmedPmt = confirmedPmts.length > 0
                      const hasSettlement   = bookingPmts.some(p => p.paymentType === 'PELUNASAN')
                      const pelunasanBlocked = bookingPmts.length > 0 && !hasConfirmedPmt
                      const canRequest      = b.status !== 'cancelled' && b.status !== 'fully_paid' && b.status !== 'completed' && b.status !== 'on_hold' && !activePmt && !hasSettlement
                      const holdExpiry = b.holdUntil ? new Date(b.holdUntil) : null
                      const isExpired  = holdExpiry ? holdExpiry < new Date() : false
                      const isUrgent   = holdExpiry && !isExpired ? (holdExpiry.getTime() - Date.now()) < 2 * 60 * 60 * 1000 : false
                      return (
                        <TableCell className="hidden sm:table-cell" onClick={e => e.stopPropagation()}>
                          {b.status === 'cancelled' ? null : (
                          <div className="flex flex-col gap-1 min-w-0">

                            {/* On Hold */}
                            {b.status === 'on_hold' ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-6 px-2 text-[11px] font-semibold text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-full border border-orange-200"
                                  onClick={() => { setCompleteBookingId(b.id); setWizardOpen(true) }}
                                >
                                  <ChevronRight className="h-3 w-3 mr-0.5" /> Complete
                                </Button>
                                {holdExpiry && (
                                  <span className={`text-[10px] font-medium ${isExpired ? 'text-red-500' : isUrgent ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                    {isExpired ? '⚠ Expired' : `until ${holdExpiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${holdExpiry.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                                  </span>
                                )}
                              </div>
                            ) : activePmt ? (
                              /* Active payment in progress */
                              <div className="flex flex-col gap-1">
                                {activePmt.status === 'requested' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 w-fit">
                                    ⏳ Awaiting Finance
                                  </span>
                                )}
                                {activePmt.status === 'invoice_ready' && (
                                  <>
                                    <button
                                      onClick={() => window.open(`/print/invoice/${activePmt.id}`, '_blank')}
                                      className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium text-violet-600 border border-violet-200 hover:bg-violet-50 transition-colors w-fit"
                                    >
                                      <Receipt className="h-2.5 w-2.5" /> Download Invoice
                                    </button>
                                    <Button
                                      variant="ghost" size="sm"
                                      className="h-6 px-2 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-full border border-emerald-200 w-fit"
                                      onClick={() => openProofUpload(activePmt)}
                                    >
                                      <Upload className="h-3 w-3 mr-1" /> Submit Proof
                                    </Button>
                                  </>
                                )}
                                {activePmt.status === 'pending_confirmation' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 w-fit">
                                    ⏳ Awaiting Confirmation
                                  </span>
                                )}
                              </div>
                            ) : canRequest ? (
                              <Button
                                variant="ghost" size="sm"
                                disabled={pelunasanBlocked}
                                title={pelunasanBlocked ? 'Confirm the deposit first' : undefined}
                                className={`h-6 px-2 text-[11px] font-semibold rounded-full border w-fit ${pelunasanBlocked ? 'opacity-35 cursor-not-allowed border-border text-muted-foreground' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                                onClick={() => !pelunasanBlocked && openPayment(b)}
                              >
                                <CreditCard className="h-3 w-3 mr-1" /> Request Invoice
                              </Button>
                            ) : null}

                            {/* Confirmed invoices */}
                            {confirmedPmts.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {confirmedPmts.map((p, idx) => (
                                  <button
                                    key={p.id}
                                    onClick={() => window.open(`/print/invoice/${p.id}`, '_blank')}
                                    className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition-colors"
                                    title={p.invoiceNumber}
                                  >
                                    <Receipt className="h-2.5 w-2.5" />
                                    {p.paymentType === 'PELUNASAN' ? 'SL ✓' : idx === 0 ? 'DP ✓' : `#${idx + 1} ✓`}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          )}
                        </TableCell>
                      )
                    })()}
                    {canManageBookings && (
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {b.status !== 'cancelled' && b.guests.length > 0 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-sky-500 hover:text-sky-600 hover:bg-sky-50" title="Guest Travel Details" onClick={() => openTravel(b)}>
                              <PlaneTakeoff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {b.status !== 'cancelled' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {userRole === 'ADMIN' && b.status === 'cancelled' && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                              title="Delete booking"
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

      {/* ════ Request Invoice Dialog ════ */}
      <Dialog open={!!paymentBooking} onOpenChange={v => !v && setPaymentBooking(null)}>
        <DialogContent className="sm:max-w-md w-[calc(100vw-1rem)]">
          {paymentBooking && (() => {
            const net       = netBook(paymentBooking)
            const remaining = Math.max(0, net - paymentBooking.depositPaid)
            const pct       = parseFloat(payPctValue) || 0
            const amtFromPct = Math.round(remaining * pct / 100 * 100) / 100
            const amtDirect  = parseFloat(payAmtValue.replace(/,/g, '')) || 0
            const previewAmt = payAmtMode === 'percent' ? amtFromPct : amtDirect
            const fmtD = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" style={{ color: ACCENT }} />
                    Request Invoice
                  </DialogTitle>
                </DialogHeader>

                {/* Booking summary */}
                <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
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
                    <span className="font-medium">{fmtD(net)}</span>
                  </div>
                  {paymentBooking.depositPaid > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Already Paid</span>
                      <span className="text-emerald-600 font-medium">{fmtD(paymentBooking.depositPaid)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>Remaining</span>
                    <span className="text-amber-600">{fmtD(remaining)}</span>
                  </div>
                </div>

                {/* Amount input with mode toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Invoice Amount <span className="text-red-500">*</span></Label>
                    <div className="flex rounded-lg border overflow-hidden text-xs">
                      {(['amount', 'percent'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setPayAmtMode(m); setPayAmtValue(''); setPayPctValue('') }}
                          className={`px-3 py-1 font-medium transition-colors ${payAmtMode === m ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                          style={payAmtMode === m ? { backgroundColor: ACCENT } : {}}
                        >
                          {m === 'amount' ? 'Amount' : 'Percent (%)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {payAmtMode === 'amount' ? (
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={payAmtValue}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9.]/g, '')
                          const val = parseFloat(raw) || 0
                          setPayAmtValue(val > remaining ? String(remaining) : raw)
                        }}
                        className="pl-7"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          placeholder="30"
                          value={payPctValue}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0
                            setPayPctValue(val > 100 ? '100' : e.target.value)
                          }}
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                      </div>
                      {/* Quick-select common percentages */}
                      <div className="flex gap-1.5 flex-wrap">
                        {[30, 50, 70, 100].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPayPctValue(String(p))}
                            className={`px-2.5 py-1 rounded-full text-xs border font-medium transition-colors ${payPctValue === String(p) ? 'text-white border-transparent' : 'text-muted-foreground border-border hover:bg-muted'}`}
                            style={payPctValue === String(p) ? { backgroundColor: ACCENT } : {}}
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewAmt > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {payAmtMode === 'percent' && pct > 0 && (
                        <span>= {fmtD(previewAmt)} · </span>
                      )}
                      Remaining after this: <span className={remaining - previewAmt <= 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{fmtD(Math.max(0, remaining - previewAmt))}</span>
                    </p>
                  )}
                </div>

                {/* Bill To — AGENT bookings only */}
                {paymentBooking.source === 'AGENT' && paymentBooking.agent && (
                  <div className="space-y-2">
                    <Label>Bill To</Label>
                    <div className="flex rounded-lg border overflow-hidden text-xs">
                      {(['AGENT', 'CUSTOMER'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setPayBillTo(opt)}
                          className={`flex-1 py-2 px-3 font-medium transition-colors flex items-center justify-center gap-1.5 ${payBillTo === opt ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                          style={payBillTo === opt ? { backgroundColor: ACCENT } : {}}
                        >
                          {opt === 'AGENT' ? (
                            <><Building2 className="h-3.5 w-3.5" />{paymentBooking.agent!.name}</>
                          ) : (
                            <><User className="h-3.5 w-3.5" />{paymentBooking.customer.name}</>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {payBillTo === 'AGENT' ? 'Invoice will be addressed to the agent company.' : 'Invoice will be addressed directly to the guest.'}
                    </p>
                  </div>
                )}

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select method..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Transfer Bank">Transfer Bank</SelectItem>
                      <SelectItem value="Transfer Bank (BCA)">Transfer Bank (BCA)</SelectItem>
                      <SelectItem value="Transfer Bank (Mandiri)">Transfer Bank (Mandiri)</SelectItem>
                      <SelectItem value="Transfer Bank (BRI)">Transfer Bank (BRI)</SelectItem>
                      <SelectItem value="Transfer Bank (BNI)">Transfer Bank (BNI)</SelectItem>
                      <SelectItem value="Wire Transfer">Wire Transfer (International)</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="PayPal">PayPal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Textarea
                    placeholder="e.g. 30% deposit, please issue invoice promptly..."
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setPaymentBooking(null)}>Cancel</Button>
                  <Button
                    disabled={paymentSaving || previewAmt <= 0}
                    onClick={submitPayment}
                    style={{ backgroundColor: ACCENT, color: 'white' }}
                    className="hover:opacity-90"
                  >
                    {paymentSaving ? 'Submitting…' : 'Request Invoice'}
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ════ Submit Pembayaran Dialog ════ */}
      <Dialog open={!!proofPayment} onOpenChange={v => { if (!v) { setProofPayment(null); setProofPreview(null) } }}>
        <DialogContent className="sm:max-w-md w-[calc(100vw-1rem)]">
          {proofPayment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="h-4 w-4" style={{ color: ACCENT }} />
                  Submit Payment Proof
                </DialogTitle>
              </DialogHeader>

              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
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

              <div className="space-y-1.5">
                <Label>Transfer Proof <span className="text-red-500">*</span></Label>
                <div
                  className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors min-h-36 overflow-hidden cursor-pointer hover:border-primary/50"
                  onClick={() => proofInputRef.current?.click()}
                >
                  {proofPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proofPreview} alt="Transfer proof" className="w-full max-h-72 object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <ImageIcon className="h-10 w-10 opacity-30" />
                      <p className="text-sm">Click to select image</p>
                      <p className="text-xs opacity-60">JPG, JPEG or PNG · Auto-compressed</p>
                    </div>
                  )}
                </div>
                <input ref={proofInputRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={handleProofFile} />
                {proofPreview && (
                  <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => proofInputRef.current?.click()}>
                    Change image
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setProofPayment(null); setProofPreview(null) }}>Cancel</Button>
                <Button
                  disabled={!proofPreview || proofUploading}
                  onClick={saveProof}
                  style={{ backgroundColor: ACCENT, color: 'white' }}
                  className="hover:opacity-90"
                >
                  {proofUploading ? 'Submitting…' : 'Submit Payment'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ════ Edit Booking Dialog ════ */}
      <Dialog open={!!editBooking} onOpenChange={v => { if (!v) setEditBooking(null) }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {editBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-base">{editBooking.bookingCode}</span>
                  <span className="text-sm font-normal text-muted-foreground">— Edit Booking</span>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className="text-muted-foreground">{editBooking.tripType === 'OPEN_TRIP' ? 'Trip' : 'Yacht'}</p>
                    {!rescheduleMode && !editCancelMode && (
                      <button
                        type="button"
                        onClick={async () => {
                          setRescheduleStart(fmtDateInput(editBooking.startDate))
                          setRescheduleEnd(fmtDateInput(editBooking.endDate))
                          setRescheduleReason('')
                          setRescheduleOTId('')
                          setRescheduleYachtId(editBooking.yacht?.id ?? '')
                          setRescheduleMode(true)
                          if (editBooking.tripType === 'PRIVATE_CHARTER') {
                            setRescheduleYachtLoading(true)
                            try {
                              const res = await fetch('/api/yachts')
                              if (res.ok) {
                                const data = await res.json()
                                setRescheduleYachts((data as Array<{ id: string; name: string; model?: string }>))
                              }
                            } catch (e) { console.error(e) }
                            finally { setRescheduleYachtLoading(false) }
                          }
                          if (editBooking.tripType === 'OPEN_TRIP') {
                            setRescheduleOTLoading(true)
                            try {
                              const res = await fetch('/api/open-trips')
                              if (res.ok) {
                                const data = await res.json()
                                setRescheduleOpenTrips(
                                  (data as Array<{ id: string; title: string; destination?: string | null; startDate: string; endDate: string; status?: string; spotsAvailable?: number; availableSpots?: number; cabinStatuses?: Array<{ id: string; name: string; bookingStatus: string | null }> }>)
                                    .filter(t => t.id !== editBooking.openTrip?.id && t.status !== 'cancelled' && t.status !== 'closed')
                                    .map(t => ({ ...t, spotsAvailable: t.spotsAvailable ?? t.availableSpots ?? 0, cabinStatuses: t.cabinStatuses ?? [] }))
                                )
                              }
                            } catch (e) { console.error(e) }
                            finally { setRescheduleOTLoading(false) }
                          }
                        }}
                        className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 shrink-0"
                      >
                        <Calendar className="h-3 w-3" /> Reschedule
                      </button>
                    )}
                  </div>
                  <p className="font-semibold">{editBooking.tripType === 'OPEN_TRIP' ? editBooking.openTrip?.title : editBooking.yacht?.name}</p>
                  <p className="text-muted-foreground">{fmtDate(editBooking.startDate)} → {fmtDate(editBooking.endDate)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-1">Guests & Cabins</p>
                  <div className="space-y-1">
                    {editBooking.guests.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setEditGuestId(g.customerId)}
                        className="flex items-center gap-1.5 w-full text-left hover:opacity-70 transition-opacity"
                      >
                        {g.isLead
                          ? <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">LEAD</span>
                          : <span className="text-[9px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">GUEST</span>
                        }
                        <span className="font-medium truncate">{g.customer?.name ?? '—'}</span>
                        {g.cabin && <span className="text-muted-foreground flex items-center gap-0.5 shrink-0"><BedDouble className="w-2.5 h-2.5" />{g.cabin.name}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Reschedule section ── */}
              {rescheduleMode && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" /> Reschedule Booking
                    </h4>
                    <button type="button" onClick={() => setRescheduleMode(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {editBooking.tripType === 'OPEN_TRIP' ? (
                    /* Open Trip: pick another trip schedule */
                    <div className="space-y-2">
                      <Label className="text-xs">Select New Trip Schedule <span className="text-red-500">*</span></Label>
                      {rescheduleOTLoading ? (
                        <div className="text-xs text-muted-foreground py-2">Loading trips…</div>
                      ) : rescheduleOpenTrips.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-2">No other available open trips found.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                          {rescheduleOpenTrips.map(t => {
                            const selected = rescheduleOTId === t.id
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => { setRescheduleOTId(t.id); setRescheduleNewCabinId('') }}
                                className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${selected ? 'border-blue-400 bg-blue-100 text-blue-800' : 'border-border bg-white hover:bg-muted/40'}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold truncate">{t.title}</span>
                                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${t.spotsAvailable > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                    {t.spotsAvailable > 0 ? `${t.spotsAvailable} spots` : 'Full'}
                                  </span>
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                                  {t.destination && <span className="ml-1.5">· {t.destination}</span>}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Cabin picker — shown after a trip is selected */}
                      {rescheduleOTId && (() => {
                        const selectedTrip = rescheduleOpenTrips.find(t => t.id === rescheduleOTId)
                        const cabins = selectedTrip?.cabinStatuses ?? []
                        return (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Select Cabin <span className="text-red-500">*</span></Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {cabins.map(c => {
                                const occupied = c.bookingStatus !== null
                                const picked   = rescheduleNewCabinId === c.id
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    disabled={occupied}
                                    onClick={() => setRescheduleNewCabinId(c.id)}
                                    className={`rounded-lg border px-2 py-1.5 text-xs text-center transition-colors
                                      ${occupied ? 'bg-muted/40 text-muted-foreground border-border cursor-not-allowed opacity-50' :
                                        picked   ? 'border-blue-400 bg-blue-100 text-blue-800 font-semibold' :
                                                   'border-border bg-white hover:bg-muted/40'}`}
                                  >
                                    <BedDouble className="h-3 w-3 mx-auto mb-0.5" />
                                    {c.name}
                                    {occupied && <div className="text-[9px] text-red-400 mt-0.5">Occupied</div>}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    /* Private Charter: pick yacht + dates */
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Select Yacht <span className="text-red-500">*</span></Label>
                        {rescheduleYachtLoading ? (
                          <div className="text-xs text-muted-foreground py-2">Loading yachts…</div>
                        ) : (
                          <div className="space-y-1.5">
                            {rescheduleYachts.map(y => {
                              const overlapping = bookings.some(b =>
                                b.id !== editBooking.id &&
                                b.tripType === 'PRIVATE_CHARTER' &&
                                b.yacht?.id === y.id &&
                                b.status !== 'cancelled' &&
                                rescheduleStart && rescheduleEnd &&
                                new Date(b.startDate) < new Date(rescheduleEnd) &&
                                new Date(b.endDate) > new Date(rescheduleStart)
                              )
                              const picked = rescheduleYachtId === y.id
                              return (
                                <button
                                  key={y.id}
                                  type="button"
                                  disabled={overlapping}
                                  onClick={() => setRescheduleYachtId(y.id)}
                                  className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors
                                    ${overlapping ? 'opacity-50 cursor-not-allowed border-border bg-muted/30' :
                                      picked      ? 'border-blue-400 bg-blue-100 text-blue-800' :
                                                    'border-border bg-white hover:bg-muted/40'}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{y.name}</span>
                                    {overlapping
                                      ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Unavailable</span>
                                      : <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Available</span>
                                    }
                                  </div>
                                  {y.model && <div className="text-muted-foreground mt-0.5">{y.model}</div>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">New Start Date <span className="text-red-500">*</span></Label>
                          <Input type="date" value={rescheduleStart}
                            onChange={e => { setRescheduleStart(e.target.value); if (rescheduleEnd && e.target.value > rescheduleEnd) setRescheduleEnd(e.target.value) }} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">New End Date <span className="text-red-500">*</span></Label>
                          <Input type="date" value={rescheduleEnd} min={rescheduleStart}
                            onChange={e => setRescheduleEnd(e.target.value)} />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Availability updates based on selected dates.</p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
                    <Textarea rows={2} placeholder="e.g. Guest request, weather conditions…"
                      value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRescheduleMode(false)}>Cancel</Button>
                    <Button size="sm"
                      disabled={
                        !rescheduleReason.trim() || rescheduleSaving ||
                        (editBooking.tripType === 'OPEN_TRIP'
                          ? (!rescheduleOTId || !rescheduleNewCabinId)
                          : (!rescheduleStart || !rescheduleEnd || !rescheduleYachtId))
                      }
                      onClick={applyReschedule}
                      className="bg-blue-600 hover:bg-blue-700 text-white">
                      {rescheduleSaving ? 'Saving…' : 'Apply Reschedule'}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Cancel section ── */}
              {editCancelMode && (
                <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                      <X className="h-4 w-4" /> Cancel Booking
                    </h4>
                    <button type="button" onClick={() => setEditCancelMode(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cancellation Reason <span className="text-red-500">*</span></Label>
                    <Textarea rows={2} placeholder="e.g. Guest cancelled, no payment received…"
                      value={editCancelReason} onChange={e => setEditCancelReason(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditCancelMode(false)}>Back</Button>
                    <Button size="sm" variant="destructive"
                      disabled={!editCancelReason.trim() || editCancelSaving}
                      onClick={confirmEditCancel}>
                      {editCancelSaving ? 'Cancelling…' : 'Confirm Cancel'}
                    </Button>
                  </div>
                </div>
              )}

              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}
                    disabled={editStatus !== 'completed' && editStatus !== 'cancelled'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="fully_paid">Fully Paid</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Auto-computed from payments. Only Completed & Cancelled are editable.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                    <Input type="number" min="0" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="pl-7" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Total Price (USD)</Label>
                  <Input type="number" min="0" value={editTotal} disabled className="bg-muted text-muted-foreground cursor-not-allowed" />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount Paid (USD)</Label>
                  <Input type="number" min="0" value={editDeposit} onChange={e => setEditDeposit(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Due Date</Label>
                  <Input type="date" value={editDepDue} min={new Date().toISOString().split('T')[0]} onChange={e => setEditDepDue(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Final Balance Due Date</Label>
                  <Input type="date" value={editFinalDue} min={editDepDue || new Date().toISOString().split('T')[0]} onChange={e => setEditFinalDue(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Input placeholder="Internal notes…" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter className="flex-row items-center justify-between gap-2">
                {!editCancelMode && !rescheduleMode && (
                  <Button variant="outline"
                    onClick={() => { setEditCancelMode(true); setRescheduleMode(false) }}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300">
                    <X className="h-3.5 w-3.5 mr-1.5" /> Cancel Booking
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" onClick={() => setEditBooking(null)}>Close</Button>
                  <Button disabled={editSaving || rescheduleMode || editCancelMode} onClick={saveEdit}
                    style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ════ Guest Travel Details Dialog ════ */}
      <Dialog open={!!travelBooking} onOpenChange={v => !v && setTravelBooking(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {travelBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PlaneTakeoff className="h-4 w-4 text-sky-500" />
                  Guest Travel Details
                  <span className="font-mono text-sm font-normal text-muted-foreground">— {travelBooking.bookingCode}</span>
                </DialogTitle>
              </DialogHeader>

              {/* ── Shared travel form (applies to all guests) ── */}
              {(() => {
                const t = guestTravel[SHARED_KEY] ?? { arrivalPickupTime: '', arrivalHotel: '', arrivalFlight: '', departurePickupTime: '', departureHotel: '', departureFlight: '' }
                const setT = (k: keyof typeof t) => (e: React.ChangeEvent<HTMLInputElement>) =>
                  setGuestTravel(prev => ({ ...prev, [SHARED_KEY]: { ...t, [k]: e.target.value } }))
                return (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-sky-50/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-sky-600 flex items-center gap-1.5">
                          <PlaneTakeoff className="h-3.5 w-3.5" />
                          Group Travel Details
                          <span className="text-muted-foreground font-normal">— applies to all guests</span>
                        </p>
                        <Button
                          variant="outline" size="sm"
                          className="h-7 px-3 text-xs gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
                          onClick={() => window.open(`/print/crew-sheet/booking/${travelBooking.id}`, '_blank')}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Download All Guest Sheets
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Arrival</p>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Pick-up Date & Time</Label>
                            <Input type="datetime-local" value={t.arrivalPickupTime} onChange={setT('arrivalPickupTime')} className="h-8 text-xs bg-white" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Hotel / Airport</Label>
                            <Input value={t.arrivalHotel} onChange={setT('arrivalHotel')} placeholder="Hotel or airport name" className="h-8 text-xs bg-white" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Flight Number</Label>
                            <Input value={t.arrivalFlight} onChange={setT('arrivalFlight')} placeholder="GA123" className="h-8 text-xs bg-white" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Departure</p>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Pick-up Date & Time</Label>
                            <Input type="datetime-local" value={t.departurePickupTime} onChange={setT('departurePickupTime')} className="h-8 text-xs bg-white" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Hotel / Airport</Label>
                            <Input value={t.departureHotel} onChange={setT('departureHotel')} placeholder="Hotel or airport name" className="h-8 text-xs bg-white" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Flight Number</Label>
                            <Input value={t.departureFlight} onChange={setT('departureFlight')} placeholder="GA456" className="h-8 text-xs bg-white" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Guest list — sheet only */}
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-widest">
                        Guests ({travelBooking.guests.length} pax)
                      </p>
                      <div className="space-y-1.5">
                        {travelBooking.guests.map(g => (
                          <div key={g.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-sm font-medium leading-tight">{g.customer?.name ?? '—'}</p>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  {g.isLead && <span className="text-amber-600 font-semibold">Group Leader</span>}
                                  {g.cabin && <span className="flex items-center gap-0.5"><BedDouble className="w-3 h-3" /> {g.cabin.name}</span>}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                              onClick={() => window.open(`/print/guest-sheet/${g.id}`, '_blank')}
                            >
                              <FileText className="h-3 w-3 mr-1" /> Guest Sheet
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}

              <DialogFooter>
                <Button variant="outline" onClick={() => setTravelBooking(null)}>Cancel</Button>
                <Button disabled={travelSaving} onClick={saveTravel} className="bg-sky-600 hover:bg-sky-700 text-white">
                  {travelSaving ? 'Saving…' : 'Save Travel Details'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ════ Booking Detail Modal ════ */}
      <Dialog open={!!detailBooking} onOpenChange={v => !v && setDetailBooking(null)}>
        <DialogContent showCloseButton={false} className="p-0 gap-0 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
          <DialogTitle className="sr-only">Booking Detail</DialogTitle>
          {detailBooking && (() => {
            const db_ = detailBooking
            const svcTotal   = (db_.services ?? []).reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
            const basePrice  = db_.totalPrice - svcTotal
            const commPct    = db_.source === 'AGENT' ? (db_.agent?.commission ?? 0) : 0
            const commAmt    = commPct > 0 ? Math.max(0, basePrice - db_.discount) * commPct / 100 : 0
            const net        = Math.max(0, basePrice - db_.discount) + svcTotal - commAmt
            const remaining  = Math.max(0, net - db_.depositPaid)
            const fmtAmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            return (
              <>
                {/* Header */}
                <div style={{ backgroundColor: '#1a5f6e' }} className="px-5 pt-5 pb-4 text-white shrink-0 rounded-t-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono tracking-widest text-white/50 mb-0.5">{db_.bookingCode}</p>
                      <p className="text-lg font-bold leading-tight truncate">{db_.customer.name}</p>
                      <p className="text-sm text-white/70 mt-0.5 truncate">
                        {db_.tripType === 'OPEN_TRIP' ? db_.openTrip?.title : db_.yacht?.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <span className={`text-[11px] font-semibold rounded-full px-3 py-1 ${STATUS_STYLES[db_.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABELS[db_.status] ?? db_.status}
                      </span>
                      <button
                        onClick={() => setDetailBooking(null)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cancelled reason banner */}
                {db_.status === 'cancelled' && (
                  <div className="px-5 py-3 bg-slate-50 border-b flex items-start gap-2.5">
                    <X className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-600 mb-0.5">Booking Cancelled</p>
                      <p className="text-xs text-slate-500">
                        {db_.cancelReason ? db_.cancelReason : 'No cancellation reason provided.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                  {/* Summary */}
                  <div className="px-5 py-4 space-y-4">

                    {/* Trip dates */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { label: 'Check-in',  val: fmtDate(db_.startDate) },
                        { label: 'Check-out', val: fmtDate(db_.endDate) },
                      ].map(r => (
                        <div key={r.label} className="rounded-lg border p-2.5">
                          <p className="text-muted-foreground mb-0.5">{r.label}</p>
                          <p className="font-semibold text-sm">{r.val}</p>
                        </div>
                      ))}
                      {(db_.destination || db_.openTrip?.destination) && (
                        <div className="col-span-2 rounded-lg border p-2.5">
                          <p className="text-muted-foreground mb-0.5 text-xs">Destination</p>
                          <p className="font-semibold text-sm">{db_.destination ?? db_.openTrip?.destination}</p>
                        </div>
                      )}
                    </div>

                    {/* Price breakdown */}
                    <div className="rounded-lg border overflow-hidden text-xs">
                      <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/40 border-b">
                        Price Breakdown
                      </p>
                      <div className="px-3 py-2 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Base Price</span>
                          <span className="font-medium">{fmtAmt(basePrice)}</span>
                        </div>
                        {(db_.services ?? []).map(s => (
                          <div key={s.id} className="flex justify-between">
                            <span className="text-muted-foreground truncate max-w-[60%]">
                              {s.name}{(s.quantity ?? 1) > 1 ? ` ×${s.quantity}` : ''}
                            </span>
                            <span className="font-medium">{fmtAmt(s.price * (s.quantity ?? 1))}</span>
                          </div>
                        ))}
                        {db_.discount > 0 && (
                          <div className="flex justify-between text-emerald-600">
                            <span>Discount</span>
                            <span>−{fmtAmt(db_.discount)}</span>
                          </div>
                        )}
                        {commAmt > 0 && (
                          <div className="flex justify-between text-muted-foreground italic">
                            <span>Agent Commission ({commPct}%)</span>
                            <span>(−{fmtAmt(commAmt)})</span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between px-3 py-2 border-t bg-muted/20 font-bold text-sm">
                        <span>Total</span>
                        <span style={{ color: '#bdac7e' }}>{fmtAmt(net)}</span>
                      </div>
                    </div>

                    {/* Payment status */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border p-2.5">
                        <p className="text-muted-foreground mb-0.5">Paid</p>
                        <p className="font-semibold text-sm text-emerald-600">{fmtAmt(db_.depositPaid)}</p>
                      </div>
                      <div className={`rounded-lg border p-2.5 ${remaining > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
                        <p className="text-muted-foreground mb-0.5">Remaining</p>
                        <p className={`font-semibold text-sm ${remaining > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                          {fmtAmt(remaining)}
                        </p>
                      </div>
                    </div>
                    {(db_.depositDueDate || db_.finalDueDate) && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {db_.depositDueDate && (
                          <div className="rounded-lg border p-2.5">
                            <p className="text-muted-foreground mb-0.5">Deposit Due</p>
                            <p className="font-semibold">{fmtDate(db_.depositDueDate)}</p>
                          </div>
                        )}
                        {db_.finalDueDate && (
                          <div className="rounded-lg border p-2.5">
                            <p className="text-muted-foreground mb-0.5">Final Due</p>
                            <p className="font-semibold">{fmtDate(db_.finalDueDate)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agent / Sales info */}
                    {(db_.source === 'AGENT' && db_.agent || (db_.salespersonUser?.name ?? db_.salesperson) || db_.notes) && (
                      <div className="rounded-lg border overflow-hidden text-xs">
                        <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/40 border-b">
                          Booking Info
                        </p>
                        <div className="divide-y">
                          {(db_.salespersonUser?.name ?? db_.salesperson) && (
                            <div className="flex justify-between px-3 py-2">
                              <span className="text-muted-foreground">Sales</span>
                              <span className="font-medium">{db_.salespersonUser?.name ?? db_.salesperson}</span>
                            </div>
                          )}
                          {db_.source === 'AGENT' && db_.agent && (
                            <div className="flex justify-between px-3 py-2">
                              <span className="text-muted-foreground">Agent</span>
                              <span className="font-medium">{db_.agent.name}
                                {commPct > 0 && <span className="text-muted-foreground font-normal ml-1">({commPct}%)</span>}
                              </span>
                            </div>
                          )}
                          {db_.agentContact && (
                            <div className="px-3 py-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Contact Person</span>
                                <span className="font-medium">{db_.agentContact.name}</span>
                              </div>
                              {(db_.agentContact.whatsapp || db_.agentContact.email) && (
                                <div className="flex gap-3 mt-0.5 justify-end text-muted-foreground">
                                  {db_.agentContact.whatsapp && <span>{db_.agentContact.whatsapp}</span>}
                                  {db_.agentContact.email && <span>{db_.agentContact.email}</span>}
                                </div>
                              )}
                            </div>
                          )}
                          {db_.notes && (
                            <div className="px-3 py-2">
                              <p className="text-muted-foreground mb-0.5">Notes</p>
                              <p className="leading-relaxed">{db_.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Diving toggle — only if yacht supports diving */}
                    {db_.yacht?.canDiving && (
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Waves className="w-4 h-4 text-sky-500" />
                          <div>
                            <p className="text-sm font-medium leading-tight">Diving Trip</p>
                            <p className="text-[11px] text-muted-foreground">Guests will be diving</p>
                          </div>
                        </div>
                        <Switch
                          checked={db_.hasDiving ?? false}
                          onCheckedChange={async (val) => {
                            await fetch(`/api/bookings/${db_.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ hasDiving: val }),
                            })
                            await fetchBookings()
                            const updated = bookings.find(b => b.id === db_.id)
                            if (updated) setDetailBooking({ ...updated, hasDiving: val })
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Guests */}
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Guests ({db_.guests.length} pax)
                    </p>

                    {db_.guests.length === 0 && (
                      <p className="text-sm text-muted-foreground">No registered guests.</p>
                    )}

                    {db_.guests.map(g => {
                      const isOwnCabin = (c: any) => c.guests?.some((cg: any) => cg.id === g.customerId)
                      const currentCabinId = g.cabin?.id ?? ''

                      return (
                        <div key={g.id} className="rounded-xl border p-3 space-y-2.5">
                          {/* Guest header */}
                          <div className="flex items-center justify-between gap-2">
                            <button
                              className="group flex items-center gap-2 hover:bg-muted/50 rounded-lg px-1.5 py-1 -mx-1.5 -my-1 transition-colors text-left flex-1 min-w-0"
                              onClick={() => { setEditGuestId(g.customerId); setEditGuestBgId(g.id); setEditGuestHasDiving(db_.hasDiving ?? false) }}
                            >
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold leading-tight">{g.customer?.name ?? '—'}</p>
                                {g.isLead && <p className="text-[10px] text-amber-600">Group Leader</p>}
                              </div>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 shrink-0 transition-opacity mr-1" />
                            </button>

                            {/* Cabin selector */}
                            {detailCabinsLoading ? (
                              <Skeleton className="h-7 w-28" />
                            ) : detailCabins.length > 0 ? (
                              <Select
                                value={currentCabinId}
                                onValueChange={v => saveCabin(g.id, v)}
                                disabled={cabinSaving === g.id}
                              >
                                <SelectTrigger className="h-7 text-xs w-36">
                                  <BedDouble className="w-3 h-3 mr-1 shrink-0" />
                                  <SelectValue placeholder="Select cabin…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {detailCabins.map((c: any) => {
                                    const isMine = isOwnCabin(c)
                                    const isTaken = c.isFull && !isMine
                                    return (
                                      <SelectItem key={c.id} value={c.id} disabled={isTaken}>
                                        <span className={isTaken ? 'text-muted-foreground' : ''}>
                                          {c.name}{c.deck ? ` · ${c.deck}` : ''}
                                        </span>
                                        {isTaken && (
                                          <span className="ml-1.5 text-[10px] text-red-400 font-medium">• Full</span>
                                        )}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                            ) : g.cabin ? (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground border rounded px-2 py-1">
                                <BedDouble className="w-3 h-3" /> {g.cabin.name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No cabin</span>
                            )}
                          </div>

                          {/* Travel info */}
                          {(g.arrivalPickupTime || g.arrivalFlight || g.departurePickupTime || g.departureFlight) && (
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground border-t pt-2">
                              <div>
                                <p className="font-semibold text-foreground mb-0.5">Arrival</p>
                                {g.arrivalFlight && <p>✈ {g.arrivalFlight}</p>}
                                {g.arrivalPickupTime && <p>🕐 {g.arrivalPickupTime}</p>}
                                {g.arrivalHotel && <p>🏨 {g.arrivalHotel}</p>}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground mb-0.5">Departure</p>
                                {g.departureFlight && <p>✈ {g.departureFlight}</p>}
                                {g.departurePickupTime && <p>🕐 {g.departurePickupTime}</p>}
                                {g.departureHotel && <p>🏨 {g.departureHotel}</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* On Hold banner */}
                {db_.status === 'on_hold' && (
                  <div className="shrink-0 mx-5 mb-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-orange-700">Booking On Hold</p>
                      <p className="text-xs text-orange-600 mt-0.5">This booking has not been confirmed yet. Continue to fill in pricing & payment.</p>
                    </div>
                    <Button
                      size="sm"
                      style={{ backgroundColor: '#f59e0b', color: 'white' }}
                      className="hover:opacity-90 shrink-0"
                      onClick={async () => {
                        setDetailBooking(null)
                        // Re-open booking wizard in "complete" mode via a PATCH to change status to pending first
                        const res = await fetch(`/api/bookings/${db_.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'pending' }),
                        })
                        if (res.ok) fetchBookings()
                      }}
                    >
                      Complete Booking
                    </Button>
                  </div>
                )}

                {/* Footer */}
                <div className="shrink-0 border-t px-5 py-3 flex justify-between items-center">
                  {db_.status !== 'cancelled' ? (
                    <Button
                      variant="outline"
                      onClick={() => openCancelDialog(db_)}
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Cancel Booking
                    </Button>
                  ) : (
                    <div />
                  )}
                  <Button variant="outline" onClick={() => setDetailBooking(null)}>Close</Button>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ════ Cancel Booking Confirm Dialog ════ */}
      <Dialog open={!!cancelDialogBooking} onOpenChange={v => !v && setCancelDialogBooking(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="w-4 h-4" /> Cancel Booking
            </DialogTitle>
          </DialogHeader>
          {cancelDialogBooking && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel booking <span className="font-semibold text-foreground">{cancelDialogBooking.bookingCode}</span> for <span className="font-semibold text-foreground">{cancelDialogBooking.customer.name}</span>?
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">Cancellation reason <span className="text-red-500">*</span></Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Enter cancellation reason..."
                  value={cancelReasonText}
                  onChange={e => setCancelReasonText(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={cancelSaving} onClick={() => setCancelDialogBooking(null)}>
              Cancel
            </Button>
            <Button
              disabled={cancelSaving || !cancelReasonText.trim()}
              onClick={confirmCancelBooking}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Yes, Cancel Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ Guest Edit Sheet (from detail) ════ */}
      <GuestEditSheet
        open={!!editGuestId}
        guestId={editGuestId}
        bookingGuestId={editGuestBgId}
        hasDiving={editGuestHasDiving}
        onClose={() => { setEditGuestId(null); setEditGuestBgId(null); setEditGuestHasDiving(false) }}
        onSaved={() => { fetchBookings(); if (detailBooking) openDetail(detailBooking) }}
      />

      <BookingWizard
        open={wizardOpen}
        onOpenChange={v => { setWizardOpen(v); if (!v) setCompleteBookingId(undefined) }}
        onSuccess={fetchBookings}
        completeBookingId={completeBookingId}
      />
    </div>
  )
}
