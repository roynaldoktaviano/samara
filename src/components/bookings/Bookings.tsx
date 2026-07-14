'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getEffectiveBookingStatus } from '@/lib/booking-status'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Search, Edit, BedDouble, AlertCircle,
  CreditCard, Receipt, Upload, ImageIcon, Trash2, Loader2, Pencil, PlaneTakeoff, FileText, User, Building2,
  SlidersHorizontal, X, Calendar, Ship, Tag, Layers, RotateCw, Waves, ChevronRight, ChevronLeft, Clock, Users,
  Link2, Copy, Check, ExternalLink, Crown, FileCheck,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { BookingWizard } from './BookingWizard'
import GuestEditSheet from '@/components/customers/GuestEditSheet'
import WaitingListManager from './WaitingListManager'
import { toast } from 'sonner'
import { compressImage } from '@/lib/compressImage'

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
  depositDueDateInvoiceOverride?: string | null
  finalDueDateInvoiceOverride?: string | null
  holdUntil?: string | null
  destination?: string
  notes?: string
  cancelReason?: string | null
  refundStatus?: string | null
  refundDecision?: string | null
  refundReason?: string | null
  refundProof?: string | null
  refundConfirmedAt?: string | null
  refundConfirmedBy?: string | null
  salesperson?: string | null
  salespersonUser?: { name: string | null } | null
  currency?: string
  exchangeRate?: number | null
  createdAt?: string
  hasDiving?: boolean
  hasSurfing?: boolean
  hasPhotoPackage?: boolean
  yacht?: { id: string; name: string; model?: string; canDiving?: boolean; canSurfing?: boolean; capacity?: number }
  openTrip?: { id: string; title: string; destination?: string }
  customer: { id: string; name: string; email?: string; phone?: string }
  agent?:        { id: string; name: string; commissionOpenTrip?: number; commissionPrivateCharter?: number }
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
  hasDocument?: boolean
  parentPaymentId?: string | null
  parentPayment?: { invoiceNumber: string } | null
  booking: {
    bookingCode: string
    tripType: string
    totalPrice: number
    depositPaid: number
    startDate: string
    endDate: string
    destination?: string
    currency?: string
    exchangeRate?: number | null
    customer: { name: string; email?: string; phone?: string }
    yacht?: { name: string; model?: string }
    openTrip?: { title: string; destination?: string }
    agent?: { name: string; company?: string }
    services: Array<{ name: string; price: number }>
  }
}

const netBook = (b: BookingRecord) => {
  const svcTotal  = b.services?.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0) ?? 0
  // totalPrice is already net of discount (see BookingWizard: total = max(0, base - discountAmt) + services)
  const afterDisc = Math.max(0, b.totalPrice - svcTotal)
  const commPct   = b.source === 'AGENT'
    ? (b.tripType === 'OPEN_TRIP' ? (b.agent?.commissionOpenTrip ?? 0) : (b.agent?.commissionPrivateCharter ?? 0))
    : 0
  const commAmt   = afterDisc * commPct / 100
  return afterDisc + svcTotal - commAmt
}

/* ─── Constants ─────────────────────────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  on_hold:        'bg-green-100   text-green-700   border-green-200',
  pending:        'bg-yellow-100  text-yellow-700  border-yellow-200',
  partially_paid: 'bg-blue-100    text-blue-700    border-blue-200',
  fully_paid:     'bg-red-100     text-red-700     border-red-200',
  on_trip:        'bg-slate-100   text-slate-600   border-slate-200',
  completed:      'bg-slate-100   text-slate-600   border-slate-200',
  cancelled:      'bg-slate-100   text-slate-500   border-slate-200',
  confirmed:      'bg-red-100     text-red-700     border-red-200',
}
const STATUS_LABELS: Record<string, string> = {
  on_hold:        'On Hold',
  pending:        'Pending',
  partially_paid: 'Partially Paid',
  fully_paid:     'Fully Paid',
  on_trip:        'On Trip',
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

/* ─── Currency (mirrors BookingWizard) ───────────────────────────────────── */
type CurrencyCode = 'USD' | 'EUR' | 'IDR'
const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string; rateToUSD: number; step: number; decimals: number }> = {
  USD: { symbol: '$',  label: 'USD — US Dollar',          rateToUSD: 1,        step: 100,    decimals: 2 },
  EUR: { symbol: '€',  label: 'EUR — Euro',                rateToUSD: 1.09,     step: 100,    decimals: 2 },
  IDR: { symbol: 'Rp', label: 'IDR — Indonesian Rupiah',   rateToUSD: 0.000063, step: 100000, decimals: 0 },
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
const fmtDateInput = (d?: string | null) =>
  d ? new Date(d).toISOString().split('T')[0] : ''
const getDays = (s: string, e: string) =>
  Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000))
const fmtAmt = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function FilterDropdown({ value, onValueChange, placeholder, active, activeClass, children }: {
  value: string
  onValueChange: (v: string) => void
  placeholder: string
  active: boolean
  activeClass: string
  children: React.ReactNode
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`h-8 text-xs pr-2 border rounded-lg w-full truncate ${active ? activeClass : ''}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}

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
  const [yachtFilter,  setYachtFilter] = useState('all')
  const [yearFilter,   setYearFilter]  = useState('all')
  const [monthFilter,  setMonthFilter] = useState('all')
  const [salesFilter,  setSalesFilter] = useState('all')
  const [currentPage,  setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const [wizardOpen,        setWizardOpen]        = useState(false)
  const [completeBookingId, setCompleteBookingId] = useState<string | undefined>(undefined)
  const [editBooking,       setEditBooking]       = useState<BookingRecord | null>(null)
  const [editSaving,   setEditSaving]  = useState(false)
  const [editStatus,   setEditStatus]  = useState('')
  const [editTotal,    setEditTotal]   = useState('')
  const [editDeposit,  setEditDeposit] = useState('')
  const [editDiscount, setEditDiscount]= useState('')
  const [editCurrency,     setEditCurrency]     = useState<CurrencyCode>('USD')
  const [editExchangeRate, setEditExchangeRate] = useState(1)
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
  const [payShowNet,      setPayShowNet]      = useState(false)
  const [payShowNote,     setPayShowNote]     = useState(false)
  const [payMode,         setPayMode]         = useState<'new' | 'existing'>('new')
  const [payLinkedId,     setPayLinkedId]     = useState('')
  const [payProof,        setPayProof]        = useState<string | null>(null)

  /* proof / submit payment */
  const [proofPayment,   setProofPayment]   = useState<PaymentRecord | null>(null)
  const [proofPreview,   setProofPreview]   = useState<string | null>(null)
  const [proofMethod,    setProofMethod]    = useState('Transfer Bank')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofFetching,  setProofFetching]  = useState(false)
  const proofInputRef = useRef<HTMLInputElement>(null)
  const payProofInputRef = useRef<HTMLInputElement>(null)

  /* payments list (for payment column context) */
  const [payments,        setPayments]        = useState<PaymentRecord[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  /* guest travel dialog */
  const [travelBooking,    setTravelBooking]    = useState<BookingRecord | null>(null)
  const [travelSaving,     setTravelSaving]     = useState(false)
  const [travelCustomers,  setTravelCustomers]  = useState<Record<string, any>>({})

  /* booking detail sheet */
  const [detailBooking,       setDetailBooking]       = useState<BookingRecord | null>(null)
  const [detailShowIDR,       setDetailShowIDR]       = useState(false)
  const [detailCabins,        setDetailCabins]        = useState<any[]>([])
  const [detailCabinsLoading, setDetailCabinsLoading] = useState(false)
  const [cancelDialogBooking, setCancelDialogBooking] = useState<BookingRecord | null>(null)

  /* extend deposit/final due date */
  const [extendDateTarget, setExtendDateTarget] = useState<{ booking: BookingRecord; field: 'deposit' | 'final' } | null>(null)
  const [extendNewDate,    setExtendNewDate]    = useState('')
  const [extendSyncInvoice, setExtendSyncInvoice] = useState(true)
  const [extendSaving,     setExtendSaving]     = useState(false)

  const [cancelReasonText,    setCancelReasonText]    = useState('')
  const [cancelSaving,        setCancelSaving]        = useState(false)

  /* refund confirmations (sales) */
  interface RefundPendingBooking {
    id: string; bookingCode: string; refundStatus: string | null; refundReason: string | null
    refundProof: string | null; cancelReason: string | null
    payments: { id: string; invoiceNumber: string; amount: number; paymentType: string }[]
  }
  const [refundPending,       setRefundPending]       = useState<RefundPendingBooking[]>([])
  const [refundPendingLoading, setRefundPendingLoading] = useState(false)
  const [refundConfirmItem,   setRefundConfirmItem]   = useState<RefundPendingBooking | null>(null)
  const [refundConfirmSaving, setRefundConfirmSaving] = useState(false)

  // Diving toggle off confirmation (admin only)
  const [divingOffDialog,     setDivingOffDialog]     = useState(false)
  const [divingOffReason,     setDivingOffReason]     = useState('')
  const [divingOffSaving,     setDivingOffSaving]     = useState(false)

  // Surfing toggle off confirmation (admin only)
  const [surfingOffDialog,    setSurfingOffDialog]    = useState(false)
  const [surfingOffReason,    setSurfingOffReason]    = useState('')
  const [surfingOffSaving,    setSurfingOffSaving]    = useState(false)

  // Add guest dialog
  const [addGuestOpen,        setAddGuestOpen]        = useState(false)
  const [addGuestSearch,      setAddGuestSearch]      = useState('')
  const [addGuestAll,         setAddGuestAll]         = useState<Array<{ id: string; name: string; email?: string; phone?: string }>>([])
  const [addGuestSelected,    setAddGuestSelected]    = useState<Set<string>>(new Set())
  const [addGuestCabinId,     setAddGuestCabinId]     = useState('')
  const [addGuestSaving,      setAddGuestSaving]      = useState(false)
  const [addGuestLoading,     setAddGuestLoading]     = useState(false)
  const [addGuestNewMode,     setAddGuestNewMode]     = useState(false)
  const [addGuestNewName,     setAddGuestNewName]     = useState('')
  const [addGuestNewPhone,    setAddGuestNewPhone]    = useState('')
  const [addGuestNewEmail,    setAddGuestNewEmail]    = useState('')
  const [addGuestCreating,    setAddGuestCreating]    = useState(false)
  const [deletingGuestId,     setDeletingGuestId]     = useState<string | null>(null)
  const [settingLeadId,       setSettingLeadId]       = useState<string | null>(null)
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

  /* trip edit fields (pending + no invoice only) */
  const [editStartDate,  setEditStartDate]  = useState('')
  const [editEndDate,    setEditEndDate]    = useState('')
  const [editYachtId,    setEditYachtId]    = useState('')
  const [editYachts,     setEditYachts]     = useState<Array<{ id: string; name: string; dailyRate: number }>>([])
  const [editCabinId,    setEditCabinId]    = useState('')
  const [editCabinList,  setEditCabinList]  = useState<Array<{ id: string; name: string }>>([])

  /* services edit */
  const [editServices,  setEditServices]  = useState<Array<{ name: string; price: string; quantity: number }>>([])
  const [editBasePrice, setEditBasePrice] = useState(0)
  const [editGuestId,      setEditGuestId]      = useState<string | null>(null)
  const [editGuestBgId,       setEditGuestBgId]       = useState<string | null>(null)
  const [editGuestHasDiving,  setEditGuestHasDiving]  = useState(false)
  const [editGuestHasSurfing, setEditGuestHasSurfing] = useState(false)
  const [cabinSaving,         setCabinSaving]         = useState<string | null>(null) // bgId being saved
  const [guestLinks,          setGuestLinks]          = useState<Record<string, string>>({})
  const [generatingGuestLink, setGeneratingGuestLink] = useState<string | null>(null)
  const [copiedGuestLink,     setCopiedGuestLink]     = useState<string | null>(null)
  const [masterLinks,         setMasterLinks]         = useState<Record<string, string>>({})
  const [generatingMaster,    setGeneratingMaster]    = useState<string | null>(null)
  const [copiedMaster,        setCopiedMaster]        = useState<string | null>(null)
  const [masterDisabledIds,   setMasterDisabledIds]   = useState<Set<string>>(new Set())
  const [disablingMaster,     setDisablingMaster]     = useState<string | null>(null)

  /* waiting list */
  const [waitingListBooking, setWaitingListBooking] = useState<BookingRecord | null>(null)

  /* extend hold */
  const [extendHoldBooking,  setExtendHoldBooking]  = useState<BookingRecord | null>(null)
  const [extendHoldDate,     setExtendHoldDate]     = useState('')
  const [extendHoldTime,     setExtendHoldTime]     = useState('23:59')
  const [extendHoldSaving,   setExtendHoldSaving]   = useState(false)

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

  const fetchRefundPending = useCallback(async () => {
    setRefundPendingLoading(true)
    try {
      const res = await fetch('/api/bookings/pending-refund?view=sales')
      if (res.ok) setRefundPending(await res.json())
    } finally { setRefundPendingLoading(false) }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])
  useEffect(() => { if (canManageBookings) fetchPayments() }, [canManageBookings, fetchPayments])
  useEffect(() => { if (canManageBookings) fetchRefundPending() }, [canManageBookings, fetchRefundPending])

  useEffect(() => {
    const handler = () => { fetchPayments(); fetchBookings() }
    window.addEventListener('payment-updated', handler)
    return () => window.removeEventListener('payment-updated', handler)
  }, [fetchPayments, fetchBookings])

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
    setEditCurrency((b.currency as CurrencyCode) || 'USD')
    setEditExchangeRate(b.exchangeRate || 1)
    setRescheduleMode(false); setRescheduleStart(''); setRescheduleEnd(''); setRescheduleReason('')
    setRescheduleOTId(''); setRescheduleOpenTrips([]); setRescheduleNewCabinId('')
    setRescheduleYachtId(''); setRescheduleYachts([])
    setEditCancelMode(false); setEditCancelReason('')

    // Services & base price
    const currentSvcs = b.services ?? []
    const svcTotal = currentSvcs.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
    setEditBasePrice(b.totalPrice - svcTotal)
    setEditServices(currentSvcs.map(s => ({ name: s.name, price: String(s.price), quantity: s.quantity ?? 1 })))

    // Trip edit fields (pending + no invoice)
    const hasInvoice = payments.some(p => p.bookingId === b.id)
    const canEdit = b.status === 'pending' && !hasInvoice
    setEditStartDate(b.startDate ? b.startDate.split('T')[0] : '')
    setEditEndDate(b.endDate ? b.endDate.split('T')[0] : '')
    setEditYachtId(b.yacht?.id ?? '')
    setEditCabinId(b.guests?.[0]?.cabin?.id ?? '')
    setEditYachts([]); setEditCabinList([])

    if (canEdit) {
      if (b.tripType === 'PRIVATE_CHARTER') {
        fetch('/api/yachts').then(r => r.json()).then(data => setEditYachts(data)).catch(() => {})
      } else if (b.tripType === 'OPEN_TRIP' && b.yacht?.id) {
        fetch(`/api/cabins?yachtId=${b.yacht.id}`).then(r => r.json()).then(data => setEditCabinList(data?.cabins ?? data ?? [])).catch(() => {})
      }
    }
  }

  const saveEdit = async () => {
    if (!editBooking) return
    setEditSaving(true)
    const hasInvoice = payments.some(p => p.bookingId === editBooking.id)
    const canEditTrip = editBooking.status === 'pending' && !hasInvoice
    try {
      const svcTotal  = editServices.reduce((s, x) => s + (parseFloat(x.price) || 0) * x.quantity, 0)
      const autoTotal = editBasePrice + svcTotal

      const body: Record<string, unknown> = {
        status: editStatus, totalPrice: String(autoTotal), depositPaid: editDeposit,
        discount: editDiscount, depositDueDate: editDepDue || null,
        finalDueDate: editFinalDue || null, notes: editNotes,
        services: editServices.filter(s => s.name.trim()),
        currency: editCurrency,
        exchangeRate: editCurrency !== 'USD' ? editExchangeRate : undefined,
      }
      if (canEditTrip) {
        if (editStartDate) body.startDate = editStartDate
        if (editEndDate)   body.endDate   = editEndDate
        if (editBooking.tripType === 'PRIVATE_CHARTER' && editYachtId) body.yachtId = editYachtId
        if (editBooking.tripType === 'OPEN_TRIP' && editCabinId) body.newCabinId = editCabinId
      }
      const bookingRes = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (bookingRes.ok) { await fetchBookings(); setEditBooking(null) }
    } catch (e) { console.error(e) }
    finally { setEditSaving(false) }
  }

  /* extend deposit/final due date */
  const openExtendDate = (b: BookingRecord, field: 'deposit' | 'final') => {
    setExtendDateTarget({ booking: b, field })
    setExtendNewDate(fmtDateInput(field === 'deposit' ? b.depositDueDate : b.finalDueDate))
    setExtendSyncInvoice(true)
  }

  const saveExtendDate = async () => {
    if (!extendDateTarget || !extendNewDate) return
    setExtendSaving(true)
    try {
      const { booking, field } = extendDateTarget
      const body = field === 'deposit'
        ? { depositDueDate: extendNewDate, syncDepositDueToInvoice: extendSyncInvoice }
        : { finalDueDate: extendNewDate, syncFinalDueToInvoice: extendSyncInvoice }
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        await fetchBookings()
        setDetailBooking(prev => prev && prev.id === booking.id
          ? {
              ...prev,
              ...(field === 'deposit'
                ? { depositDueDate: extendNewDate, depositDueDateInvoiceOverride: extendSyncInvoice ? null : (prev.depositDueDateInvoiceOverride ?? prev.depositDueDate) }
                : { finalDueDate: extendNewDate, finalDueDateInvoiceOverride: extendSyncInvoice ? null : (prev.finalDueDateInvoiceOverride ?? prev.finalDueDate) }),
            }
          : prev)
        setExtendDateTarget(null)
      }
    } catch (e) { console.error(e) }
    finally { setExtendSaving(false) }
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
      const res = await fetch(`/api/bookings/${cancelDialogBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelReason: cancelReasonText.trim() || null }),
      })
      const data = await res.json()
      await fetchBookings()
      if (data.requiresRefundDecision) {
        await fetchRefundPending()
      }
      setCancelDialogBooking(null)
      setDetailBooking(null)
    } catch (e) { console.error(e) }
    finally { setCancelSaving(false) }
  }

  const handleConfirmRefund = async (bookingId: string) => {
    setRefundConfirmSaving(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/refund`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_refund' }),
      })
      if (!res.ok) throw new Error()
      setRefundConfirmItem(null)
      await fetchRefundPending()
      await fetchBookings()
    } catch { console.error('Failed to confirm refund') }
    finally { setRefundConfirmSaving(false) }
  }

  /* ── extend hold ── */
  const openExtendHold = (b: BookingRecord) => {
    const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    setExtendHoldDate(b.holdUntil ? new Date(b.holdUntil).toISOString().split('T')[0] : defaultDate)
    setExtendHoldTime(b.holdUntil ? new Date(b.holdUntil).toTimeString().slice(0, 5) : '23:59')
    setExtendHoldBooking(b)
  }

  const saveExtendHold = async () => {
    if (!extendHoldBooking || !extendHoldDate) return
    setExtendHoldSaving(true)
    try {
      const holdUntil = new Date(`${extendHoldDate}T${extendHoldTime || '23:59'}:00`).toISOString()
      const res = await fetch(`/api/bookings/${extendHoldBooking.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ holdUntil }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Hold extended')
      setExtendHoldBooking(null)
      await fetchBookings()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setExtendHoldSaving(false)
    }
  }

  /* ── request invoice ── */
  const eligibleParentInvoices = (bookingId: string) =>
    payments.filter(p => p.bookingId === bookingId && p.hasDocument !== false && ['invoice_ready', 'pending_confirmation', 'confirmed'].includes(p.status))

  const openPayment = (b: BookingRecord) => {
    setPaymentBooking(b)
    setPaymentNotes('')
    setPayAmtMode('amount')
    setPayAmtValue('')
    setPayPctValue('')
    setPayBillTo(b.source === 'AGENT' ? 'AGENT' : 'CUSTOMER')
    setPayMethod('Transfer Bank')
    setPayShowNet(false)
    setPayShowNote(false)
    setPayMode('new')
    setPayLinkedId('')
    setPayProof(null)
  }
  const handlePayProofFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG and PNG files are allowed')
      e.target.value = ''
      return
    }
    compressImage(file).then(setPayProof).catch(() => toast.error('Failed to process image'))
  }
  const submitPayment = async () => {
    if (!paymentBooking) return
    setPaymentSaving(true)
    const rate = paymentBooking.exchangeRate ?? 1
    const hasIDR = paymentBooking.currency === 'IDR' && rate > 1
    const remaining = Math.max(0, netBook(paymentBooking) - paymentBooking.depositPaid)
    let amount = 0
    if (payAmtMode === 'amount') {
      const raw = parseFloat(payAmtValue.replace(/,/g, '')) || 0
      amount = raw
    } else {
      const pct = Math.min(100, Math.max(0, parseFloat(payPctValue) || 0))
      amount = Math.round(remaining * pct / 100 * 100) / 100
    }
    if (amount <= 0 || amount > remaining) { setPaymentSaving(false); return }
    if (payMode === 'existing' && (!payLinkedId || !payProof)) { setPaymentSaving(false); return }
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payMode === 'existing'
          ? JSON.stringify({
              bookingId: paymentBooking.id,
              notes: paymentNotes,
              amount,
              linkedPaymentId: payLinkedId,
              proofOfTransfer: payProof,
              paymentMethod: payMethod || undefined,
            })
          : JSON.stringify({
              bookingId: paymentBooking.id,
              notes: paymentNotes,
              amount: amount > 0 ? amount : undefined,
              billToType: payBillTo,
              paymentMethod: payMethod || undefined,
              showNetAmount: paymentBooking.source === 'AGENT' ? payShowNet : undefined,
              showCommissionNote: paymentBooking.source === 'AGENT' ? (payShowNet && payShowNote) : undefined,
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

  const openTravel = async (b: BookingRecord) => {
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
    setTravelCustomers({})
    setTravelBooking(b)
    const customerData: Record<string, any> = {}
    await Promise.all(
      b.guests.map(async g => {
        if (g.customerId) {
          const data = await fetch(`/api/customers/${g.customerId}`).then(r => r.json())
          customerData[g.customerId] = data
        }
      })
    )
    setTravelCustomers(customerData)
  }

  const refreshTravelCustomer = async (customerId: string) => {
    const updated = await fetch(`/api/customers/${customerId}`).then(r => r.json())
    setTravelCustomers(prev => ({ ...prev, [customerId]: updated }))
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
    setDetailShowIDR(false)
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

  const handleGenerateGuestLink = async (customerId: string, bgId: string) => {
    setGeneratingGuestLink(bgId)
    try {
      const res = await fetch(`/api/customers/${customerId}/generate-link`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const { link } = await res.json()
      setGuestLinks(prev => ({ ...prev, [bgId]: `${link}?bg=${bgId}` }))
    } catch {
      toast.error('Failed to generate link')
    } finally {
      setGeneratingGuestLink(null)
    }
  }

  const copyGuestLink = (bgId: string) => {
    const link = guestLinks[bgId]
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopiedGuestLink(bgId)
    toast.success('Link copied!')
    setTimeout(() => setCopiedGuestLink(null), 2000)
  }

  const handleGenerateMasterLink = async (bookingId: string) => {
    setGeneratingMaster(bookingId)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/generate-master-link`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const { link } = await res.json()
      setMasterLinks(prev => ({ ...prev, [bookingId]: link }))
    } catch {
      toast.error('Failed to generate master link')
    } finally {
      setGeneratingMaster(null)
    }
  }

  const copyMasterLink = (bookingId: string) => {
    const link = masterLinks[bookingId]
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopiedMaster(bookingId)
    toast.success('Master link copied!')
    setTimeout(() => setCopiedMaster(null), 2000)
  }

  const handleDisableMasterLink = async (bookingId: string) => {
    setDisablingMaster(bookingId)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/generate-master-link`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setMasterLinks(prev => { const n = { ...prev }; delete n[bookingId]; return n })
      setMasterDisabledIds(prev => new Set([...prev, bookingId]))
      toast.success('Master form disabled')
    } catch {
      toast.error('Failed to disable master form')
    } finally {
      setDisablingMaster(null)
    }
  }

  /* ── submit payment proof ── */
  const openProofUpload = (p: PaymentRecord) => {
    setProofPayment(p)
    setProofPreview(null)
  }
  const handleDeleteGuest = async (bookingId: string, bookingGuestId: string) => {
    if (!confirm('Remove this guest from the booking?')) return
    setDeletingGuestId(bookingGuestId)
    const res = await fetch(`/api/bookings/${bookingId}/guests`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingGuestId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Failed to remove guest')
    } else {
      const fresh = await fetch(`/api/bookings/${bookingId}`).then(r => r.json()).catch(() => null)
      if (fresh) setDetailBooking(fresh)
      fetchBookings()
    }
    setDeletingGuestId(null)
  }

  const handleSetLead = async (bookingId: string, bookingGuestId: string) => {
    setSettingLeadId(bookingGuestId)
    const res = await fetch(`/api/guests/${bookingGuestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLead: true }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Failed to set lead')
    } else {
      const fresh = await fetch(`/api/bookings/${bookingId}`).then(r => r.json()).catch(() => null)
      if (fresh) setDetailBooking(fresh)
    }
    setSettingLeadId(null)
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
    compressImage(file).then(setProofPreview).catch(() => toast.error('Failed to process image'))
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
  const yachtOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    bookings.forEach(b => { if (b.yacht?.id) map.set(b.yacht.id, b.yacht.name) })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [bookings])

  const yearOptions = React.useMemo(() => {
    const years = new Set<string>()
    bookings.forEach(b => years.add(new Date(b.startDate).getFullYear().toString()))
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [bookings])

  const salesOptions = React.useMemo(() => {
    const names = new Set<string>()
    bookings.forEach(b => { const n = b.salespersonUser?.name ?? b.salesperson; if (n) names.add(n) })
    return Array.from(names).sort()
  }, [bookings])

  const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const activeFilterCount = [
    statusFilter !== 'all', sourceFilter !== 'all', typeFilter !== 'all', yachtFilter !== 'all',
    yearFilter !== 'all', monthFilter !== 'all', salesFilter !== 'all', !!dateFrom, !!dateTo, !!searchTerm,
  ].filter(Boolean).length
  const hasActiveFilter = activeFilterCount > 0
  const clearFilters = () => {
    setSearchTerm(''); setStatusFilter('all'); setSourceFilter('all'); setTypeFilter('all')
    setYachtFilter('all'); setYearFilter('all'); setMonthFilter('all'); setSalesFilter('all')
    setDateFrom(''); setDateTo('')
    setCurrentPage(1)
  }

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
    const matchYacht  = yachtFilter  === 'all' || b.yacht?.id === yachtFilter
    const start       = new Date(b.startDate)
    const matchYear   = yearFilter  === 'all' || start.getFullYear().toString() === yearFilter
    const matchMonth  = monthFilter === 'all' || (start.getMonth() + 1).toString() === monthFilter
    const matchSales  = salesFilter === 'all' || (b.salespersonUser?.name ?? b.salesperson) === salesFilter
    const matchDate   = (() => {
      if (!dateFrom && !dateTo) return true
      const s = b.startDate.split('T')[0]
      const e = b.endDate.split('T')[0]
      if (dateFrom && e < dateFrom) return false
      if (dateTo   && s > dateTo)   return false
      return true
    })()
    return matchSearch && matchStatus && matchSource && matchType && matchYacht && matchYear && matchMonth && matchSales && matchDate
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(currentPage, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const withPageReset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setCurrentPage(1) }

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

      {/* ── Pending Refund Confirmations (Sales) ── */}
      {canManageBookings && (refundPendingLoading || refundPending.length > 0) && (
        <Card className="border-violet-200 bg-violet-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-violet-700">
              <AlertCircle className="h-4 w-4" />
              Refund Confirmation Needed
              {refundPending.length > 0 && (
                <span className="ml-1 text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">{refundPending.length}</span>
              )}
            </CardTitle>
            <CardDescription>Finance has uploaded refund proof — please confirm with the guest and mark as received</CardDescription>
          </CardHeader>
          <CardContent>
            {refundPendingLoading ? (
              <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <div className="space-y-2">
                {refundPending.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded">{b.bookingCode}</span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                          Refund Proof Uploaded
                        </span>
                      </div>
                      {b.refundReason && <p className="text-xs text-muted-foreground mt-0.5">Refund reason: {b.refundReason}</p>}
                      <p className="text-xs text-muted-foreground">
                        Total refund: ${b.payments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setRefundConfirmItem(b)}>
                      View & Confirm
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 sm:w-96 p-4 space-y-3 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Filters</span>
                  {hasActiveFilter && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors text-[11px] font-semibold"
                    >
                      <X className="h-3 w-3" /> Clear all
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by code, customer, yacht, agent..."
                    value={searchTerm}
                    onChange={e => withPageReset(setSearchTerm)(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {searchTerm && (
                    <button className="absolute right-2.5 top-2.5" onClick={() => setSearchTerm('')}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                {/* Dropdown filters */}
                <div className="grid grid-cols-2 gap-2">
                  <FilterDropdown value={typeFilter} onValueChange={withPageReset(setTypeFilter)}
                    placeholder="Trip Type" active={typeFilter !== 'all'} activeClass="border-violet-400 bg-violet-50 text-violet-700 font-semibold">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="PRIVATE_CHARTER">Private Charter</SelectItem>
                    <SelectItem value="OPEN_TRIP">Open Trip</SelectItem>
                  </FilterDropdown>

                  <FilterDropdown value={statusFilter} onValueChange={withPageReset(setStatusFilter)}
                    placeholder="Status" active={statusFilter !== 'all'} activeClass="border-amber-400 bg-amber-50 text-amber-700 font-semibold">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partially_paid">Partially Paid</SelectItem>
                    <SelectItem value="fully_paid">Fully Paid</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </FilterDropdown>

                  <FilterDropdown value={sourceFilter} onValueChange={withPageReset(setSourceFilter)}
                    placeholder="Source" active={sourceFilter !== 'all'} activeClass="border-sky-400 bg-sky-50 text-sky-700 font-semibold">
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="DIRECT">Direct</SelectItem>
                    <SelectItem value="AGENT">Agent</SelectItem>
                  </FilterDropdown>

                  <FilterDropdown value={yachtFilter} onValueChange={withPageReset(setYachtFilter)}
                    placeholder="Yacht" active={yachtFilter !== 'all'} activeClass="border-cyan-400 bg-cyan-50 text-cyan-700 font-semibold">
                    <SelectItem value="all">All Yachts</SelectItem>
                    {yachtOptions.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </FilterDropdown>

                  <FilterDropdown value={yearFilter} onValueChange={withPageReset(setYearFilter)}
                    placeholder="Year" active={yearFilter !== 'all'} activeClass="border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold">
                    <SelectItem value="all">All Years</SelectItem>
                    {yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </FilterDropdown>

                  <FilterDropdown value={monthFilter} onValueChange={withPageReset(setMonthFilter)}
                    placeholder="Month" active={monthFilter !== 'all'} activeClass="border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold">
                    <SelectItem value="all">All Months</SelectItem>
                    {MONTH_LABELS.map((m, i) => <SelectItem key={m} value={(i + 1).toString()}>{m}</SelectItem>)}
                  </FilterDropdown>

                  {userRole === 'ADMIN' && (
                    <FilterDropdown value={salesFilter} onValueChange={withPageReset(setSalesFilter)}
                      placeholder="Salesperson" active={salesFilter !== 'all'} activeClass="border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 font-semibold">
                      <SelectItem value="all">All Salespeople</SelectItem>
                      {salesOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </FilterDropdown>
                  )}
                </div>

                {/* Trip date range */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Trip date</span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={e => withPageReset(setDateFrom)(e.target.value)}
                      className={`h-8 text-xs flex-1 ${dateFrom ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold' : ''}`}
                      title="From date"
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <Input
                      type="date"
                      value={dateTo}
                      min={dateFrom}
                      onChange={e => withPageReset(setDateTo)(e.target.value)}
                      className={`h-8 text-xs flex-1 ${dateTo ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold' : ''}`}
                      title="To date"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
                  <TableHead className="hidden md:table-cell">Destination</TableHead>
                  <TableHead className="hidden lg:table-cell">Due Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || (canManageBookings && paymentsLoading) ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {bookings.length === 0
                        ? 'No bookings yet — click "New Booking" to get started.'
                        : 'No bookings match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : paginated.map(b => (
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
                        {b.tripType === 'OPEN_TRIP' ? b.openTrip?.title : `Private Charter${b.yacht?.name ? ` - ${b.yacht.name}` : ''}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span>{fmtDate(b.startDate)}</span>
                        <span className="mx-1">–</span>
                        <span>{fmtDate(b.endDate)}</span>
                        <span className="ml-1">· {getDays(b.startDate, b.endDate)}d</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{b.customer.name}</div>
                      {b.agent && <div className="text-xs text-muted-foreground">via {b.agent.name}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-xs text-muted-foreground">
                        {b.tripType === 'OPEN_TRIP' ? (b.openTrip?.destination ?? '—') : (b.destination ?? b.yacht?.model ?? '—')}
                      </div>
                    </TableCell>
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
                      {(() => {
                        const effStatus = getEffectiveBookingStatus(b.status, b.startDate, b.endDate)
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[effStatus] ?? 'bg-muted text-muted-foreground'}`}>
                            {STATUS_LABELS[effStatus] ?? effStatus}
                          </span>
                        )
                      })()}
                      {b.status === 'on_hold' && b.holdUntil && (() => {
                        const exp = new Date(b.holdUntil)
                        const expired = exp < new Date()
                        const urgent  = !expired && (exp.getTime() - Date.now()) < 2 * 60 * 60 * 1000
                        return (
                          <div className={`text-[10px] font-medium mt-0.5 ${expired ? 'text-red-500' : urgent ? 'text-orange-500' : 'text-muted-foreground'}`}>
                            {expired ? '⚠ Expired' : `until ${exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${exp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                          </div>
                        )
                      })()}
                      {payments.some(p => p.bookingId === b.id && p.status === 'invoice_ready') && (
                        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                          <CreditCard className="w-2.5 h-2.5" /> Invoice Ready
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
              <span>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-7 px-2"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="font-medium text-foreground">{safePage} / {totalPages}</span>
                <Button
                  variant="outline" size="sm" className="h-7 px-2"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════ Request Invoice Dialog ════ */}
      <Dialog open={!!paymentBooking} onOpenChange={v => !v && setPaymentBooking(null)}>
        <DialogContent className="sm:max-w-md w-[calc(100vw-1rem)]">
          {paymentBooking && (() => {
            const rate      = paymentBooking.exchangeRate ?? 1
            const hasIDR    = paymentBooking.currency === 'IDR' && rate > 1
            const net       = netBook(paymentBooking)
            const remaining = Math.max(0, net - paymentBooking.depositPaid)
            const pct       = parseFloat(payPctValue) || 0
            const amtFromPct = Math.round(remaining * pct / 100 * 100) / 100
            const rawInput   = parseFloat(payAmtValue.replace(/,/g, '')) || 0
            const amtDirect  = rawInput
            const previewAmt = payAmtMode === 'percent' ? amtFromPct : amtDirect
            const fmtD  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            const fmtIDR = (n: number) => `Rp ${Math.round(n * rate).toLocaleString('id-ID')}`
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" style={{ color: ACCENT }} />
                    {payMode === 'existing' ? 'Add Payment (No New Invoice)' : 'Request Invoice'}
                  </DialogTitle>
                </DialogHeader>

                {/* New invoice vs. additional DP on an existing invoice */}
                {eligibleParentInvoices(paymentBooking.id).length > 0 && (
                  <div className="space-y-2">
                    <Label>Invoice</Label>
                    <div className="flex rounded-lg border overflow-hidden text-xs">
                      {([{ v: 'new', l: 'New Invoice' }, { v: 'existing', l: 'Add to Existing Invoice' }] as const).map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => { setPayMode(opt.v); setPayLinkedId(''); setPayProof(null) }}
                          className={`flex-1 py-2 px-3 font-medium transition-colors ${payMode === opt.v ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                          style={payMode === opt.v ? { backgroundColor: ACCENT } : {}}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                    {payMode === 'existing' && (
                      <>
                        <p className="text-[11px] text-muted-foreground">
                          No new invoice document is generated — attach proof of transfer now, Finance confirms it like any other payment.
                        </p>
                        <Select value={payLinkedId} onValueChange={setPayLinkedId}>
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Select invoice to add this DP to..." />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibleParentInvoices(paymentBooking.id).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.invoiceNumber} — {p.paymentType} (${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                )}

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
                    <div className="text-right">
                      <div className="font-medium">{fmtD(paymentBooking.totalPrice)}</div>
                      {hasIDR && <div className="text-muted-foreground">{fmtIDR(paymentBooking.totalPrice)}</div>}
                    </div>
                  </div>
                  {(paymentBooking.discount ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="text-emerald-600 font-medium">−{fmtD(paymentBooking.discount)}</span>
                    </div>
                  )}
                  {(paymentBooking.discount ?? 0) > 0 && (
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">Net Total</span>
                      <span className="font-semibold">{fmtD(net)}</span>
                    </div>
                  )}
                  {paymentBooking.depositPaid > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Already Paid</span>
                      <span className="text-emerald-600 font-medium">{fmtD(paymentBooking.depositPaid)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>Remaining</span>
                    <div className="text-right">
                      <div className="text-amber-600">{fmtD(remaining)}</div>
                      {hasIDR && <div className="text-amber-500 font-normal">{fmtIDR(remaining)}</div>}
                    </div>
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
                    <div className="space-y-1.5">
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
                      {hasIDR && rawInput > 0 && (
                        <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-1.5 text-xs flex items-center justify-between">
                          <span className="text-muted-foreground">Equivalent (IDR)</span>
                          <span className="font-semibold text-amber-700">{fmtIDR(rawInput)}</span>
                        </div>
                      )}
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
                    <div className="space-y-1">
                      {payAmtMode === 'percent' && pct > 0 && hasIDR && (
                        <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-1.5 text-xs flex items-center justify-between">
                          <span className="text-muted-foreground">= {fmtD(previewAmt)} equivalent IDR</span>
                          <span className="font-semibold text-amber-700">{fmtIDR(previewAmt)}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {payAmtMode === 'percent' && pct > 0 && !hasIDR && (
                          <span>= {fmtD(previewAmt)} · </span>
                        )}
                        Remaining after this: <span className={remaining - previewAmt <= 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{fmtD(Math.max(0, remaining - previewAmt))}{hasIDR ? ` (${fmtIDR(Math.max(0, remaining - previewAmt))})` : ''}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Bill To — AGENT bookings only, only relevant when an actual invoice doc is produced */}
                {payMode === 'new' && paymentBooking.source === 'AGENT' && paymentBooking.agent && (
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

                {/* Show Agent Commission — AGENT bookings only, only relevant when an actual invoice doc is produced */}
                {payMode === 'new' && paymentBooking.source === 'AGENT' && paymentBooking.agent && (
                  <div className="space-y-2">
                    <Label>Agent Commission on Invoice</Label>
                    <div className="flex rounded-lg border overflow-hidden text-xs">
                      {([{ v: false, l: 'Published' }, { v: true, l: 'Net (after commission)' }] as const).map(opt => (
                        <button
                          key={String(opt.v)}
                          type="button"
                          onClick={() => setPayShowNet(opt.v)}
                          className={`flex-1 py-2 px-3 font-medium transition-colors ${payShowNet === opt.v ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                          style={payShowNet === opt.v ? { backgroundColor: ACCENT } : {}}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {payShowNet ? 'Invoice will show the price net of agent commission.' : 'Invoice will show the published (full) price — commission not shown.'}
                    </p>

                    {payShowNet && (
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 mt-2">
                        <div>
                          <p className="text-xs font-medium">Show Commission on Invoice</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {payShowNote ? 'Invoice shows published price + a "less commission" line.' : 'Invoice shows only the final net amount, no breakdown.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPayShowNote(v => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${payShowNote ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
                        >
                          <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${payShowNote ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    )}
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

                {payMode === 'existing' && (
                  <div className="space-y-1.5">
                    <Label>Transfer Proof <span className="text-red-500">*</span></Label>
                    <div
                      className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors min-h-36 overflow-hidden cursor-pointer hover:border-primary/50"
                      onClick={() => payProofInputRef.current?.click()}
                    >
                      {payProof ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={payProof} alt="Transfer proof" className="w-full max-h-72 object-contain" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                          <ImageIcon className="h-10 w-10 opacity-30" />
                          <p className="text-sm">Click to select image</p>
                          <p className="text-xs opacity-60">JPG, JPEG or PNG · Auto-compressed</p>
                        </div>
                      )}
                    </div>
                    <input ref={payProofInputRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={handlePayProofFile} />
                    {payProof && (
                      <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => payProofInputRef.current?.click()}>
                        Change image
                      </Button>
                    )}
                  </div>
                )}

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
                    disabled={paymentSaving || previewAmt <= 0 || (payMode === 'existing' && (!payLinkedId || !payProof))}
                    onClick={submitPayment}
                    style={{ backgroundColor: ACCENT, color: 'white' }}
                    className="hover:opacity-90"
                  >
                    {paymentSaving ? 'Submitting…' : payMode === 'existing' ? 'Submit Payment' : 'Request Invoice'}
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

              {(() => {
                const pRate = proofPayment.booking.exchangeRate ?? 1
                const pHasIDR = proofPayment.booking.currency === 'IDR' && pRate > 1
                const pIDR = pHasIDR ? Math.round(proofPayment.amount * pRate) : 0
                return (
                  <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Invoice</span>
                      <span className="font-mono font-semibold">{proofPayment.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-muted-foreground">Amount</span>
                      <div className="text-right">
                        <div className="font-semibold">{fmtAmt(proofPayment.amount)}</div>
                        {pHasIDR && (
                          <div className="text-amber-600 font-medium">Rp {pIDR.toLocaleString('id-ID')}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span>{proofPayment.booking.customer.name}</span>
                    </div>
                  </div>
                )
              })()}

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
              {(() => {
                const hasInvoice  = payments.some(p => p.bookingId === editBooking.id)
                const canEditTrip = editBooking.status === 'pending' && !hasInvoice
                const isOT = editBooking.tripType === 'OPEN_TRIP'

                return canEditTrip ? (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Date range */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start Date</Label>
                      <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End Date</Label>
                      <Input type="date" value={editEndDate} min={editStartDate} onChange={e => setEditEndDate(e.target.value)} />
                    </div>

                    {/* Yacht selector (private charter only) */}
                    {!isOT && (
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Yacht</Label>
                        <Select value={editYachtId} onValueChange={yId => {
                          setEditYachtId(yId)
                          const yacht = editYachts.find(y => y.id === yId)
                          if (yacht && editStartDate && editEndDate) {
                            const nights = Math.max(1, Math.round(
                              (new Date(editEndDate).getTime() - new Date(editStartDate).getTime()) / 86_400_000
                            ))
                            setEditBasePrice(yacht.dailyRate * nights)
                          }
                        }}>
                          <SelectTrigger><SelectValue placeholder="Select yacht…" /></SelectTrigger>
                          <SelectContent>
                            {editYachts.map(y => (
                              <SelectItem key={y.id} value={y.id}>{y.name} <span className="text-muted-foreground text-xs">(${y.dailyRate.toLocaleString()}/night)</span></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Guests & Cabin (open trip: editable cabin) */}
                    <div className={`${!isOT ? 'col-span-2' : 'col-span-2'} rounded-lg bg-muted/40 p-3`}>
                      <p className="text-xs text-muted-foreground mb-2">Guests{isOT ? ' & Cabin' : ''}</p>
                      <div className="space-y-1.5">
                        {editBooking.guests.map(g => (
                          <div key={g.id} className="flex items-center gap-2">
                            {g.isLead
                              ? <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">LEAD</span>
                              : <span className="text-[9px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">GUEST</span>
                            }
                            <button type="button" onClick={() => setEditGuestId(g.customerId)}
                              className="font-medium text-xs truncate hover:opacity-70">{g.customer?.name ?? '—'}</button>
                            {isOT && (
                              <Select value={editCabinId} onValueChange={setEditCabinId}>
                                <SelectTrigger className="h-7 text-xs ml-auto w-36">
                                  <SelectValue placeholder="Cabin…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {editCabinList.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-muted-foreground mb-0.5">{isOT ? 'Trip' : 'Yacht'}</p>
                      <p className="font-semibold">{isOT ? editBooking.openTrip?.title : editBooking.yacht?.name}</p>
                      <p className="text-muted-foreground">{fmtDate(editBooking.startDate)} → {fmtDate(editBooking.endDate)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-muted-foreground mb-1">Guests & Cabins</p>
                      <div className="space-y-1">
                        {editBooking.guests.map(g => (
                          <button key={g.id} type="button" onClick={() => setEditGuestId(g.customerId)}
                            className="flex items-center gap-1.5 w-full text-left hover:opacity-70 transition-opacity">
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
                )
              })()}


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

              {(() => {
                const isFullyPaid    = editBooking.status === 'fully_paid'
                const isPartiallyPaid = editBooking.status === 'partially_paid'
                const svcTotal = editServices.reduce((s, x) => s + (parseFloat(x.price) || 0) * x.quantity, 0)
                const autoTotal = editBasePrice + svcTotal

                /* ── Read-only value display helper ── */
                const RoField = ({ label, value }: { label: string; value: string }) => (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium">{value || '—'}</p>
                  </div>
                )

                if (isFullyPaid) {
                  /* ════ FULLY PAID: display only ════ */
                  return (
                    <>
                      <Separator />
                      <div className="rounded-lg bg-muted/30 border p-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Summary</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <RoField label="Total Price" value={`$ ${autoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                          <RoField label="Amount Paid" value={`$ ${parseFloat(editDeposit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                          <RoField label="Discount" value={editDiscount ? `$ ${parseFloat(editDiscount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'} />
                          <RoField label="Payment Due" value={editDepDue || '—'} />
                          <RoField label="Final Balance Due" value={editFinalDue || '—'} />
                          <RoField label="Notes" value={editNotes} />
                        </div>
                        {editServices.length > 0 && (
                          <div className="pt-1 border-t space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Additional Services</p>
                            {editServices.map((s, i) => (
                              <div key={i} className="flex justify-between text-xs">
                                <span>{s.name}{s.quantity > 1 ? ` ×${s.quantity}` : ''}</span>
                                <span className="font-medium">$ {((parseFloat(s.price) || 0) * s.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </div>
                        )}
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
                        </div>
                      </DialogFooter>
                    </>
                  )
                }

                if (isPartiallyPaid) {
                  /* ════ PARTIALLY PAID: services + finalDueDate editable ════ */
                  return (
                    <>
                      <Separator />
                      {/* ── Additional Services (editable) ── */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Additional Services</Label>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                            onClick={() => setEditServices(prev => [...prev, { name: '', price: '0', quantity: 1 }])}>
                            + Add Service
                          </Button>
                        </div>
                        {editServices.length > 0 && (
                          <div className="space-y-2">
                            {editServices.map((svc, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <Input className="flex-1 h-8 text-xs" placeholder="Service name"
                                  value={svc.name} onChange={e => setEditServices(prev => prev.map((s, j) => j === i ? { ...s, name: e.target.value } : s))} />
                                <div className="relative w-24">
                                  <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">$</span>
                                  <Input className="h-8 text-xs pl-5" type="number" min="0" placeholder="0"
                                    value={svc.price} onChange={e => setEditServices(prev => prev.map((s, j) => j === i ? { ...s, price: e.target.value } : s))} />
                                </div>
                                <Input className="w-14 h-8 text-xs text-center" type="number" min="1" placeholder="Qty"
                                  value={svc.quantity} onChange={e => setEditServices(prev => prev.map((s, j) => j === i ? { ...s, quantity: parseInt(e.target.value) || 1 } : s))} />
                                <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                                  onClick={() => setEditServices(prev => prev.filter((_, j) => j !== i))}>
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Discount</p><p className="text-sm font-medium">$ {editDiscount ? parseFloat(editDiscount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</p></div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Total Price (auto)</Label>
                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
                            $ {autoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            {editServices.length > 0 && (
                              <span className="text-xs text-muted-foreground font-normal ml-1">(base ${editBasePrice.toLocaleString()} + services)</span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Amount Paid</p><p className="text-sm font-medium">$ {parseFloat(editDeposit).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
                        <div className="space-y-1"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Payment Due Date</p><p className="text-sm font-medium">{editDepDue || '—'}</p></div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Final Balance Due Date</Label>
                          <Input type="date" value={editFinalDue} min={new Date().toISOString().split('T')[0]} onChange={e => setEditFinalDue(e.target.value)} />
                        </div>
                        <div className="space-y-1"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Notes</p><p className="text-sm font-medium">{editNotes || '—'}</p></div>
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
                          <Button disabled={editSaving || editCancelMode} onClick={saveEdit}
                            style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                            {editSaving ? 'Saving…' : 'Save Changes'}
                          </Button>
                        </div>
                      </DialogFooter>
                    </>
                  )
                }

                /* ════ DEFAULT: full edit (pending / on_hold / confirmed) ════ */
                return (
                  <>
                    <Separator />

                    {/* ── Invoice Currency ── */}
                    <div className="rounded-xl border px-4 py-3 space-y-2" style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}06` }}>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="shrink-0 mr-1">
                          <span className="text-sm font-medium text-muted-foreground">Invoice Currency</span>
                          <p className="text-[10px] text-muted-foreground">All prices stored in USD</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(Object.keys(CURRENCIES) as CurrencyCode[]).map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                const newRateFromUSD = c === 'USD' ? 1 : parseFloat((1 / CURRENCIES[c].rateToUSD).toFixed(c === 'IDR' ? 0 : 4))
                                setEditExchangeRate(newRateFromUSD)
                                setEditCurrency(c)
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${editCurrency === c ? 'text-white' : 'border-border text-muted-foreground hover:bg-muted'}`}
                              style={editCurrency === c ? { backgroundColor: ACCENT, borderColor: ACCENT } : {}}
                            >
                              {CURRENCIES[c].symbol} {c}
                            </button>
                          ))}
                        </div>
                      </div>
                      {editCurrency !== 'USD' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">1 USD =</span>
                          <input
                            type="number"
                            min="0.000001"
                            step={editCurrency === 'IDR' ? 100 : 0.0001}
                            value={editExchangeRate}
                            onChange={e => {
                              const r = parseFloat(e.target.value)
                              if (r > 0) setEditExchangeRate(r)
                            }}
                            className="w-28 text-xs border rounded px-2 py-0.5 text-center font-mono bg-background focus:outline-none focus:ring-1"
                            style={{ borderColor: `${ACCENT}60` }}
                          />
                          <span className="text-xs text-muted-foreground font-medium">{editCurrency}</span>
                        </div>
                      )}
                    </div>

                    {/* ── Additional Services ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Additional Services</Label>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => setEditServices(prev => [...prev, { name: '', price: '0', quantity: 1 }])}>
                          + Add Service
                        </Button>
                      </div>
                      {editServices.length > 0 && (
                        <div className="space-y-2">
                          {editServices.map((svc, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <Input className="flex-1 h-8 text-xs" placeholder="Service name"
                                value={svc.name} onChange={e => setEditServices(prev => prev.map((s, j) => j === i ? { ...s, name: e.target.value } : s))} />
                              <div className="relative w-24">
                                <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">$</span>
                                <Input className="h-8 text-xs pl-5" type="number" min="0" placeholder="0"
                                  value={svc.price} onChange={e => setEditServices(prev => prev.map((s, j) => j === i ? { ...s, price: e.target.value } : s))} />
                              </div>
                              <Input className="w-14 h-8 text-xs text-center" type="number" min="1" placeholder="Qty"
                                value={svc.quantity} onChange={e => setEditServices(prev => prev.map((s, j) => j === i ? { ...s, quantity: parseInt(e.target.value) || 1 } : s))} />
                              <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => setEditServices(prev => prev.filter((_, j) => j !== i))}>
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Discount ($)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                          <Input type="number" min="0" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="pl-7" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Total Price (auto)</Label>
                        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
                          $ {autoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          {editServices.length > 0 && (
                            <span className="text-xs text-muted-foreground font-normal ml-1">
                              (base ${editBasePrice.toLocaleString()} + services)
                            </span>
                          )}
                        </div>
                        {editCurrency !== 'USD' && (
                          <p className="text-xs text-muted-foreground">
                            ≈ {CURRENCIES[editCurrency].symbol}{(autoTotal * editExchangeRate).toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[editCurrency].decimals })} {editCurrency}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Amount Paid (USD)</Label>
                        <Input type="number" min="0" value={editDeposit} onChange={e => setEditDeposit(e.target.value)} />
                        {editCurrency !== 'USD' && (
                          <p className="text-xs text-muted-foreground">
                            ≈ {CURRENCIES[editCurrency].symbol}{((parseFloat(editDeposit) || 0) * editExchangeRate).toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[editCurrency].decimals })} {editCurrency}
                          </p>
                        )}
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
                )
              })()}
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

                // ── Validation ──
                const travelMissing: string[] = []
                if (!t.arrivalPickupTime) travelMissing.push('Arrival pick-up time')
                if (!t.arrivalHotel)      travelMissing.push('Arrival hotel/airport')
                if (!t.departurePickupTime) travelMissing.push('Departure pick-up time')
                if (!t.departureHotel)    travelMissing.push('Departure hotel/airport')

                const guestMissing: Record<string, string[]> = {}
                const allLoaded = travelBooking.guests.every(g => travelCustomers[g.customerId])
                travelBooking.guests.forEach(g => {
                  const c = travelCustomers[g.customerId]
                  if (!c) return
                  const m: string[] = []
                  if (!c.nationality)    m.push('Nationality')
                  if (!c.dateOfBirth)    m.push('Date of birth')
                  if (!c.gender)         m.push('Gender')
                  if (!c.passport)       m.push('Passport no.')
                  if (!c.passportExpiry) m.push('Passport expiry')
                  if (m.length) guestMissing[g.id] = m
                })

                const travelOk = travelMissing.length === 0
                const canDownloadAll = allLoaded && travelOk && Object.keys(guestMissing).length === 0
                const canDownloadGuest = (gid: string) => travelOk && !guestMissing[gid]

                const reqStyle = (filled: boolean) =>
                  `h-8 text-xs bg-white${filled ? '' : ' border-red-300 focus-visible:ring-red-400'}`

                return (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-sky-50/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-sky-600 flex items-center gap-1.5">
                          <PlaneTakeoff className="h-3.5 w-3.5" />
                          Group Travel Details
                          <span className="text-muted-foreground font-normal">— applies to all guests</span>
                        </p>
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            variant="outline" size="sm"
                            disabled={!canDownloadAll}
                            className="h-7 px-3 text-xs gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => window.open(`/print/crew-sheet/booking/${travelBooking.id}`, '_blank')}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Download All Guest Sheets
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Arrival</p>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Pick-up Date & Time <span className="text-red-500">*</span></Label>
                            <Input type="datetime-local" value={t.arrivalPickupTime} onChange={setT('arrivalPickupTime')} className={reqStyle(!!t.arrivalPickupTime)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Hotel / Airport <span className="text-red-500">*</span></Label>
                            <Input value={t.arrivalHotel} onChange={setT('arrivalHotel')} placeholder="Hotel or airport name" className={reqStyle(!!t.arrivalHotel)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Flight Number</Label>
                            <Input value={t.arrivalFlight} onChange={setT('arrivalFlight')} placeholder="GA123" className="h-8 text-xs bg-white" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Departure</p>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Pick-up Date & Time <span className="text-red-500">*</span></Label>
                            <Input type="datetime-local" value={t.departurePickupTime} onChange={setT('departurePickupTime')} className={reqStyle(!!t.departurePickupTime)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Hotel / Airport <span className="text-red-500">*</span></Label>
                            <Input value={t.departureHotel} onChange={setT('departureHotel')} placeholder="Hotel or airport name" className={reqStyle(!!t.departureHotel)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Flight Number</Label>
                            <Input value={t.departureFlight} onChange={setT('departureFlight')} placeholder="GA456" className="h-8 text-xs bg-white" />
                          </div>
                        </div>
                      </div>
                      {/* Travel field warnings */}
                      {travelMissing.length > 0 && (
                        <p className="mt-2 text-[11px] text-red-500 flex items-start gap-1">
                          <span className="shrink-0 mt-px">⚠</span>
                          Required: {travelMissing.join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Guest list — sheet only */}
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-widest">
                        Guests ({travelBooking.guests.length} pax)
                      </p>
                      <div className="space-y-1.5">
                        {travelBooking.guests.map(g => {
                          const gOk     = canDownloadGuest(g.id)
                          const missing = guestMissing[g.id] ?? []
                          return (
                            <div key={g.id} className="border-b last:border-0">
                              <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${gOk ? 'bg-muted' : 'bg-red-50'}`}>
                                    <User className={`w-3.5 h-3.5 ${gOk ? 'text-muted-foreground' : 'text-red-400'}`} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium leading-tight">{g.customer?.name ?? '—'}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                      {g.isLead && <span className="text-amber-600 font-semibold">Group Leader</span>}
                                      {g.cabin && <span className="flex items-center gap-0.5"><BedDouble className="w-3 h-3" /> {g.cabin.name}</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {allLoaded && (
                                    <Button
                                      variant="ghost" size="sm"
                                      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                      onClick={() => { setEditGuestId(g.customerId); setEditGuestBgId(g.id) }}
                                    >
                                      <Pencil className="h-3 w-3" /> Edit
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost" size="sm"
                                    disabled={!gOk || !allLoaded}
                                    className="h-7 px-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                    onClick={() => window.open(`/print/guest-sheet/${g.id}`, '_blank')}
                                    title={!gOk ? 'Complete guest data first' : undefined}
                                  >
                                    <FileText className="h-3 w-3 mr-1" /> Guest Sheet
                                  </Button>
                                </div>
                              </div>
                              {missing.length > 0 && (
                                <p className="pb-1.5 ml-9 text-[10px] text-red-500">Missing: {missing.join(', ')}</p>
                              )}
                              {!allLoaded && !travelCustomers[g.customerId] && (
                                <p className="pb-1.5 ml-9 text-[10px] text-muted-foreground animate-pulse">Loading…</p>
                              )}
                            </div>
                          )
                        })}
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
            // totalPrice is already net of discount (see BookingWizard: total = max(0, base - discountAmt) + services)
            const afterDisc  = Math.max(0, db_.totalPrice - svcTotal)
            const basePrice  = afterDisc + db_.discount // reconstructed pre-discount price, for display only
            const commPct    = db_.source === 'AGENT'
              ? (db_.tripType === 'OPEN_TRIP' ? (db_.agent?.commissionOpenTrip ?? 0) : (db_.agent?.commissionPrivateCharter ?? 0))
              : 0
            const commAmt    = commPct > 0 ? afterDisc * commPct / 100 : 0
            const net        = afterDisc + svcTotal - commAmt
            const remaining  = Math.max(0, net - db_.depositPaid)
            const bdrRate    = (db_.currency === 'IDR' && db_.exchangeRate && db_.exchangeRate > 1) ? db_.exchangeRate : 0
            const hasDetailIDR = bdrRate > 0
            const showIDR    = hasDetailIDR && detailShowIDR
            const fmtAmt = (v: number) => showIDR
              ? `Rp ${Math.round(v * bdrRate).toLocaleString('id-ID')}`
              : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            const detailPmts      = payments.filter(p => p.bookingId === db_.id)
            const detailActivePmt = detailPmts.find(p => ['requested', 'invoice_ready', 'pending_confirmation'].includes(p.status))
            const detailConfirmed = detailPmts.filter(p => p.status === 'confirmed')
            const detailHasPmt    = detailConfirmed.length > 0
            const detailHasLunas  = detailPmts.some(p => p.paymentType === 'PELUNASAN')
            const detailBlocked   = detailPmts.length > 0 && !detailHasPmt
            const detailCanReq    = db_.status !== 'cancelled' && db_.status !== 'fully_paid' && db_.status !== 'completed' && db_.status !== 'on_hold' && !detailActivePmt && !detailHasLunas
            const detailHoldExp   = db_.holdUntil ? new Date(db_.holdUntil) : null
            const detailExpired   = detailHoldExp ? detailHoldExp < new Date() : false
            return (
              <>
                {/* Header */}
                <div style={{ backgroundColor: 'var(--brand-primary)' }} className="px-5 pt-5 pb-4 text-white shrink-0 rounded-t-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono tracking-widest text-white/50 mb-0.5">{db_.bookingCode}</p>
                      <p className="text-lg font-bold leading-tight truncate">{db_.customer.name}</p>
                      <p className="text-sm text-white/70 mt-0.5 truncate">
                        {db_.tripType === 'OPEN_TRIP' ? db_.openTrip?.title : db_.yacht?.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      {(() => {
                        const effStatus = getEffectiveBookingStatus(db_.status, db_.startDate, db_.endDate)
                        return (
                          <span className={`text-[11px] font-semibold rounded-full px-3 py-1 ${STATUS_STYLES[effStatus] ?? 'bg-muted text-muted-foreground'}`}>
                            {STATUS_LABELS[effStatus] ?? effStatus}
                          </span>
                        )
                      })()}
                      <button
                        onClick={() => setDetailBooking(null)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cancelled / pending_refund banner */}
                {(db_.status === 'cancelled' || db_.status === 'pending_refund') && (
                  <div className="px-5 py-3 bg-slate-50 border-b space-y-2">
                    <div className="flex items-start gap-2.5">
                      <X className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-600 mb-0.5">
                          {db_.status === 'pending_refund' ? 'Booking Pending Refund' : 'Booking Cancelled'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {db_.cancelReason ?? 'No cancellation reason provided.'}
                        </p>
                      </div>
                    </div>

                    {/* Refund decision detail */}
                    {db_.refundDecision && (() => {
                      const isRefund = db_.refundDecision === 'refund'
                      const statusLabel: Record<string, string> = {
                        no_refund:        'No Refund',
                        refund_pending:   'Awaiting Proof',
                        refund_uploaded:  'Proof Uploaded — Awaiting Confirmation',
                        refund_confirmed: 'Refund Confirmed',
                      }
                      const statusColor: Record<string, string> = {
                        no_refund:        'bg-red-50 text-red-700 border-red-200',
                        refund_pending:   'bg-blue-50 text-blue-700 border-blue-200',
                        refund_uploaded:  'bg-violet-50 text-violet-700 border-violet-200',
                        refund_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      }
                      return (
                        <div className="ml-6.5 pl-2 border-l-2 border-slate-200 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${isRefund ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                              {isRefund ? 'Refund' : 'No Refund'}
                            </span>
                            {db_.refundStatus && (
                              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColor[db_.refundStatus] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                {statusLabel[db_.refundStatus] ?? db_.refundStatus}
                              </span>
                            )}
                          </div>
                          {db_.refundReason && (
                            <p className="text-xs text-slate-500">Reason: {db_.refundReason}</p>
                          )}
                          {db_.refundConfirmedBy && (
                            <p className="text-xs text-slate-400">Confirmed by {db_.refundConfirmedBy}{db_.refundConfirmedAt ? ` · ${new Date(db_.refundConfirmedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                          )}
                          {db_.refundProof && (
                            <button
                              onClick={() => window.open(db_.refundProof!, '_blank')}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a5f6e] hover:underline"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              View Refund Proof
                            </button>
                          )}
                        </div>
                      )
                    })()}
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
                      <div className="px-3 py-2 flex items-center justify-between bg-muted/40 border-b">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Price Breakdown</p>
                        {hasDetailIDR && (
                          <div className="flex rounded-md border overflow-hidden text-[10px]">
                            {(['USD', 'IDR'] as const).map(c => (
                              <button key={c} type="button"
                                onClick={() => setDetailShowIDR(c === 'IDR')}
                                className={`px-2 py-0.5 font-semibold transition-colors ${(c === 'IDR') === detailShowIDR ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                                style={(c === 'IDR') === detailShowIDR ? { backgroundColor: '#bdac7e' } : {}}
                              >{c}</button>
                            ))}
                          </div>
                        )}
                      </div>
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
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="text-muted-foreground">Deposit Due</p>
                              {canManageBookings && (
                                <button
                                  onClick={() => openExtendDate(db_, 'deposit')}
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                                >
                                  Extend
                                </button>
                              )}
                            </div>
                            <p className="font-semibold">{fmtDate(db_.depositDueDate)}</p>
                            {db_.depositDueDateInvoiceOverride && (
                              <p className="text-[10px] text-amber-600 mt-0.5">Invoice shows {fmtDate(db_.depositDueDateInvoiceOverride)}</p>
                            )}
                          </div>
                        )}
                        {db_.finalDueDate && (
                          <div className="rounded-lg border p-2.5">
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="text-muted-foreground">Final Due</p>
                              {canManageBookings && (
                                <button
                                  onClick={() => openExtendDate(db_, 'final')}
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                                >
                                  Extend
                                </button>
                              )}
                            </div>
                            <p className="font-semibold">{fmtDate(db_.finalDueDate)}</p>
                            {db_.finalDueDateInvoiceOverride && (
                              <p className="text-[10px] text-amber-600 mt-0.5">Invoice shows {fmtDate(db_.finalDueDateInvoiceOverride)}</p>
                            )}
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
                          onCheckedChange={(val) => {
                            if (val) {
                              fetch(`/api/bookings/${db_.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ hasDiving: true }),
                              }).then(() => fetchBookings()).then(() => {
                                const updated = bookings.find(b => b.id === db_.id)
                                if (updated) setDetailBooking({ ...updated, hasDiving: true })
                              })
                            } else {
                              if (userRole !== 'ADMIN') { alert('Only Admin can deactivate a Diving Trip.'); return }
                              setDivingOffReason('')
                              setDivingOffDialog(true)
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Photo & Video Package toggle — hidden for now */}

                    {/* Surfing toggle — only if yacht supports surfing */}
                    {db_.yacht?.canSurfing && (
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c2-4 6-6 10-4s8 0 10-4"/><path d="M2 18c2-4 6-6 10-4s8 0 10-4"/></svg>
                          <div>
                            <p className="text-sm font-medium leading-tight">Surfing Trip</p>
                            <p className="text-[11px] text-muted-foreground">Guests will be surfing</p>
                          </div>
                        </div>
                        <Switch
                          checked={db_.hasSurfing ?? false}
                          onCheckedChange={(val) => {
                            if (val) {
                              fetch(`/api/bookings/${db_.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ hasSurfing: true }),
                              }).then(() => fetchBookings()).then(() => {
                                const updated = bookings.find(b => b.id === db_.id)
                                if (updated) setDetailBooking({ ...updated, hasSurfing: true })
                              })
                            } else {
                              if (userRole !== 'ADMIN') { alert('Only Admin can deactivate a Surfing Trip.'); return }
                              setSurfingOffReason('')
                              setSurfingOffDialog(true)
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Guests */}
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Guests ({db_.guests.length} pax)
                        </p>
                        {/* capacity badge */}
                        {db_.tripType === 'PRIVATE_CHARTER' && db_.yacht?.capacity && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${db_.guests.length >= db_.yacht.capacity ? 'bg-red-100 text-red-600' : 'bg-muted text-muted-foreground'}`}>
                            {db_.guests.length}/{db_.yacht.capacity}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {canManageBookings && db_.status !== 'cancelled' && (() => {
                          const atCapacity = db_.tripType === 'PRIVATE_CHARTER' && db_.yacht?.capacity != null && db_.guests.length >= db_.yacht.capacity
                          return !atCapacity ? (
                            <Button variant="outline" size="sm"
                              onClick={async () => {
                                setAddGuestSelected(new Set()); setAddGuestSearch(''); setAddGuestCabinId(''); setAddGuestOpen(true)
                                setAddGuestLoading(true)
                                const data = await fetch('/api/customers?limit=200').then(r => r.json()).catch(() => ({ customers: [] }))
                                setAddGuestAll(data.customers ?? data ?? [])
                                setAddGuestLoading(false)
                              }}
                              className="h-6 text-[10px] gap-1 px-2">
                              <Plus className="h-2.5 w-2.5" /> Add Guest
                            </Button>
                          ) : null
                        })()}
                      {canManageBookings && db_.status !== 'cancelled' && (db_.guests.length > 1 || db_.tripType === 'PRIVATE_CHARTER') && (
                        <div className="flex items-center gap-1.5">
                          {masterLinks[db_.id] ? (
                            <>
                              <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1 max-w-[160px]">
                                <Users className="h-3 w-3 text-violet-600 shrink-0" />
                                <span className="text-[10px] text-violet-700 truncate font-mono">{masterLinks[db_.id]}</span>
                              </div>
                              <button onClick={() => copyMasterLink(db_.id)} className="p-1 rounded text-violet-700 hover:bg-violet-50 border border-violet-200" title="Copy master link">
                                {copiedMaster === db_.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </button>
                              <a href={masterLinks[db_.id]} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-violet-700 hover:bg-violet-50 border border-violet-200" title="Open master form">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              <button onClick={() => handleDisableMasterLink(db_.id)} disabled={disablingMaster === db_.id} className="p-1 rounded text-red-400 hover:bg-red-50 border border-red-200" title="Disable master form">
                                {disablingMaster === db_.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                              </button>
                            </>
                          ) : masterDisabledIds.has(db_.id) ? (
                            <>
                              <span className="text-[10px] text-gray-400 italic">Form disabled</span>
                              <Button variant="outline" size="sm" onClick={() => { setMasterDisabledIds(prev => { const n = new Set(prev); n.delete(db_.id); return n }); handleGenerateMasterLink(db_.id) }} disabled={generatingMaster === db_.id} className="h-6 text-[10px] gap-1 px-2 border-violet-300 text-violet-700 hover:bg-violet-50">
                                {generatingMaster === db_.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Users className="h-2.5 w-2.5" />}
                                Re-enable
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleGenerateMasterLink(db_.id)} disabled={generatingMaster === db_.id} className="h-6 text-[10px] gap-1 border-dashed px-2 border-violet-300 text-violet-700 hover:bg-violet-50">
                              {generatingMaster === db_.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Users className="h-2.5 w-2.5" />}
                              Master Link
                            </Button>
                          )}
                        </div>
                      )}
                      </div>{/* end flex items-center gap-1.5 */}
                    </div>

                    {db_.guests.length === 0 && (
                      <p className="text-sm text-muted-foreground">No registered guests.</p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                    {db_.guests.map(g => {
                      const isOwnCabin = (c: any) => c.guests?.some((cg: any) => cg.id === g.customerId)
                      const currentCabinId = g.cabin?.id ?? ''

                      return (
                        <div key={g.id} className={`rounded-xl border p-3 space-y-2.5 ${g.isLead ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                          {/* Guest header */}
                          <div className="flex items-center justify-between gap-2">
                            <button
                              className="group flex items-center gap-2 hover:bg-muted/50 rounded-lg px-1.5 py-1 -mx-1.5 -my-1 transition-colors text-left flex-1 min-w-0"
                              onClick={() => { setEditGuestId(g.customerId); setEditGuestBgId(g.id); setEditGuestHasDiving(db_.hasDiving ?? false); setEditGuestHasSurfing(db_.hasSurfing ?? false) }}
                            >
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold leading-tight truncate">{g.customer?.name ?? '—'}</p>
                                {g.isLead && <p className="text-[10px] text-amber-600 font-medium">Group Leader</p>}
                              </div>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 shrink-0 transition-opacity mr-1" />
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {canManageBookings && !g.isLead && db_.status !== 'cancelled' && db_.guests.length > 1 && (
                                <button
                                  onClick={() => handleSetLead(db_.id, g.id)}
                                  disabled={settingLeadId === g.id}
                                  className="p-1 rounded text-amber-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-40"
                                  title="Make Group Leader"
                                >
                                  {settingLeadId === g.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Crown className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {canManageBookings && !g.isLead && db_.status !== 'cancelled' && db_.guests.length > 1 && (
                                <button
                                  onClick={() => handleDeleteGuest(db_.id, g.id)}
                                  disabled={deletingGuestId === g.id}
                                  className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                                  title="Remove guest"
                                >
                                  {deletingGuestId === g.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>

                            {/* Cabin selector */}
                            {(() => {
                              const cabinLocked = db_.tripType === 'OPEN_TRIP' &&
                                ['partially_paid', 'fully_paid'].includes(db_.status)
                              if (cabinLocked) {
                                return g.cabin ? (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground border rounded px-2 py-1">
                                    <BedDouble className="w-3 h-3" /> {g.cabin.name}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">No cabin</span>
                                )
                              }
                              return detailCabinsLoading ? (
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
                              )
                            })()}
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

                          {/* Guest form link */}
                          {canManageBookings && db_.status !== 'cancelled' && (
                            <div className="border-t pt-2">
                              {guestLinks[g.id] ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 min-w-0">
                                    <Link2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                    <span className="flex-1 text-[11px] text-emerald-700 truncate font-mono">{guestLinks[g.id]}</span>
                                  </div>
                                  <button onClick={() => copyGuestLink(g.id)} className="shrink-0 p-1 rounded text-emerald-700 hover:bg-emerald-50 border border-emerald-200" title="Copy link">
                                    {copiedGuestLink === g.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                  <a href={guestLinks[g.id]} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 rounded text-emerald-700 hover:bg-emerald-50 border border-emerald-200" title="Open in new tab">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              ) : (
                                <Button variant="outline" size="sm" onClick={() => handleGenerateGuestLink(g.customerId, g.id)} disabled={generatingGuestLink === g.id} className="h-7 text-xs gap-1.5 border-dashed w-full">
                                  {generatingGuestLink === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                  Generate Guest Form Link
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {canManageBookings && db_.status !== 'cancelled' && (
                  <div className="shrink-0 border-t px-5 py-3 space-y-2">
                    {/* Payment status banners */}
                    {detailActivePmt?.status === 'requested' && (
                      <p className="text-[11px] text-blue-600 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin shrink-0" /> Invoice sent — awaiting Finance team</p>
                    )}
                    {detailActivePmt?.status === 'pending_confirmation' && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin shrink-0" /> Proof submitted — awaiting confirmation</p>
                    )}
                    {/* Confirmed invoice badges */}
                    {detailConfirmed.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {detailConfirmed.map(p => {
                          const hasIDR = db_.currency === 'IDR' && !!db_.exchangeRate
                          const label = p.paymentType === 'PELUNASAN' ? 'Full Payment ✓' : 'Deposit ✓'
                          return hasIDR ? (
                            <React.Fragment key={p.id}>
                              <button onClick={() => window.open(`/print/invoice/${p.id}?currency=USD`, '_blank')} className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition-colors">
                                <Receipt className="h-3 w-3" /> {label} (USD)
                              </button>
                              <button onClick={() => window.open(`/print/invoice/${p.id}?currency=IDR`, '_blank')} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-colors">
                                <Receipt className="h-3 w-3" /> {label} (IDR)
                              </button>
                            </React.Fragment>
                          ) : (
                            <button key={p.id} onClick={() => window.open(`/print/invoice/${p.id}`, '_blank')} className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition-colors">
                              <Receipt className="h-3 w-3" /> {label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {/* Compact action chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {db_.status === 'on_hold' && (
                        <button
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5 hover:bg-orange-100 transition-colors"
                          onClick={() => { setDetailBooking(null); setCompleteBookingId(db_.id); setWizardOpen(true) }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" /> Complete Booking
                        </button>
                      )}
                      {db_.status === 'on_hold' && (
                        <button
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-100 transition-colors"
                          onClick={() => { setDetailBooking(null); openExtendHold(db_) }}
                          title={detailHoldExp && !detailExpired ? `Expires ${detailHoldExp.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : undefined}
                        >
                          <Clock className="h-3.5 w-3.5" /> Extend Hold
                        </button>
                      )}
                      {detailCanReq && (
                        <button
                          disabled={detailBlocked}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => { if (!detailBlocked) { setDetailBooking(null); openPayment(db_) } }}
                          title={detailBlocked ? 'Confirm deposit first' : undefined}
                        >
                          <CreditCard className="h-3.5 w-3.5" /> Request Invoice
                        </button>
                      )}
                      {detailActivePmt?.status === 'invoice_ready' && (() => {
                        const hasIDR = db_.currency === 'IDR' && !!db_.exchangeRate
                        return hasIDR ? (
                          <>
                            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-3 py-1.5 hover:bg-violet-100 transition-colors"
                              onClick={() => window.open(`/print/invoice/${detailActivePmt.id}?currency=USD`, '_blank')}>
                              <Receipt className="h-3.5 w-3.5" /> Invoice (USD)
                            </button>
                            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors"
                              onClick={() => window.open(`/print/invoice/${detailActivePmt.id}?currency=IDR`, '_blank')}>
                              <Receipt className="h-3.5 w-3.5" /> Invoice (IDR)
                            </button>
                          </>
                        ) : (
                          <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-3 py-1.5 hover:bg-violet-100 transition-colors"
                            onClick={() => window.open(`/print/invoice/${detailActivePmt.id}`, '_blank')}>
                            <Receipt className="h-3.5 w-3.5" /> Download Invoice
                          </button>
                        )
                      })()}
                      {detailActivePmt?.status === 'invoice_ready' && (
                        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 hover:bg-emerald-100 transition-colors" onClick={() => { setDetailBooking(null); openProofUpload(detailActivePmt) }}>
                          <Upload className="h-3.5 w-3.5" /> Submit Proof
                        </button>
                      )}
                      {db_.guests.length > 0 && (
                        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-3 py-1.5 hover:bg-sky-100 transition-colors" onClick={() => { setDetailBooking(null); openTravel(db_) }}>
                          <PlaneTakeoff className="h-3.5 w-3.5" /> Travel Details
                        </button>
                      )}
                      {db_.status !== 'cancelled' && (
                        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1.5 hover:bg-indigo-100 transition-colors" onClick={() => window.open(`/print/booking-confirmation/${db_.id}`, '_blank')}>
                          <FileCheck className="h-3.5 w-3.5" /> Confirmation Letter
                        </button>
                      )}
                      {(db_.status === 'on_hold' || db_.status === 'pending' || db_.status === 'partially_paid' || db_.status === 'fully_paid') && (
                        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors" onClick={() => { setDetailBooking(null); setWaitingListBooking(db_) }}>
                          <Users className="h-3.5 w-3.5" /> Waiting List
                        </button>
                      )}
                      <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/60 border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors" onClick={() => { setDetailBooking(null); openEdit(db_) }}>
                        <Edit className="h-3.5 w-3.5" /> Edit Booking
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="shrink-0 border-t px-5 py-3 flex justify-between items-center gap-2">
                  {db_.status !== 'cancelled' ? (
                    <button className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors" onClick={() => openCancelDialog(db_)}>
                      Cancel Booking
                    </button>
                  ) : <div />}
                  <div className="flex items-center gap-2">
                    {userRole === 'ADMIN' && db_.status === 'cancelled' && (
                      <Button variant="outline" size="sm" className="border-red-300 text-red-500 hover:bg-red-50 gap-1.5" onClick={() => { setDetailBooking(null); deleteBooking(db_) }}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setDetailBooking(null)}>Close</Button>
                  </div>
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
        hasSurfing={editGuestHasSurfing}
        onClose={() => { setEditGuestId(null); setEditGuestBgId(null); setEditGuestHasDiving(false); setEditGuestHasSurfing(false) }}
        onSaved={() => {
          fetchBookings()
          if (detailBooking) openDetail(detailBooking)
          if (editGuestId) refreshTravelCustomer(editGuestId)
        }}
      />

      <BookingWizard
        open={wizardOpen}
        onOpenChange={v => { setWizardOpen(v); if (!v) setCompleteBookingId(undefined) }}
        onSuccess={fetchBookings}
        completeBookingId={completeBookingId}
      />

      {/* ════ Waiting List Manager ════ */}
      {waitingListBooking && (
        <WaitingListManager
          open={!!waitingListBooking}
          onOpenChange={v => !v && setWaitingListBooking(null)}
          bookingId={waitingListBooking.id}
          bookingCode={waitingListBooking.bookingCode}
          startDate={waitingListBooking.startDate}
          endDate={waitingListBooking.endDate}
          yachtId={waitingListBooking.yacht?.id}
          openTripId={waitingListBooking.openTrip?.id}
          currentCustomerId={waitingListBooking.customer.id}
        />
      )}

      {/* ════ Extend Hold Dialog ════ */}
      <Dialog open={!!extendHoldBooking} onOpenChange={v => !v && setExtendHoldBooking(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" /> Extend Hold
            </DialogTitle>
          </DialogHeader>
          {extendHoldBooking && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Booking <span className="font-mono font-semibold text-foreground">{extendHoldBooking.bookingCode}</span> — {extendHoldBooking.customer.name}
              </p>
              <div className="space-y-1.5">
                <Label>Tanggal Hold Baru</Label>
                <Input
                  type="date"
                  value={extendHoldDate}
                  onChange={e => setExtendHoldDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  disabled={extendHoldSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Waktu</Label>
                <Input
                  type="time"
                  value={extendHoldTime}
                  onChange={e => setExtendHoldTime(e.target.value)}
                  disabled={extendHoldSaving}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendHoldBooking(null)} disabled={extendHoldSaving}>
              Cancel
            </Button>
            <Button onClick={saveExtendHold} disabled={extendHoldSaving || !extendHoldDate}>
              {extendHoldSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ Extend Deposit/Final Due Date Dialog ════ */}
      <Dialog open={!!extendDateTarget} onOpenChange={v => !v && setExtendDateTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Extend {extendDateTarget?.field === 'deposit' ? 'Deposit' : 'Final'} Due Date
            </DialogTitle>
          </DialogHeader>
          {extendDateTarget && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Booking <span className="font-mono font-semibold text-foreground">{extendDateTarget.booking.bookingCode}</span> — {extendDateTarget.booking.customer.name}
              </p>
              <div className="space-y-1.5">
                <Label>New Due Date</Label>
                <Input
                  type="date"
                  value={extendNewDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setExtendNewDate(e.target.value)}
                  disabled={extendSaving}
                />
                {extendNewDate && extendNewDate < new Date().toISOString().split('T')[0] && (
                  <p className="text-xs text-destructive">Due date cannot be in the past.</p>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-3">
                  <p className="text-sm font-medium">Change in Invoice</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {extendSyncInvoice
                      ? 'The invoice will show this new date.'
                      : 'Internal record only — the invoice keeps showing the original date, even if this is extended again later.'}
                  </p>
                </div>
                <Switch checked={extendSyncInvoice} onCheckedChange={setExtendSyncInvoice} disabled={extendSaving} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDateTarget(null)} disabled={extendSaving}>
              Cancel
            </Button>
            <Button onClick={saveExtendDate} disabled={extendSaving || !extendNewDate || extendNewDate < new Date().toISOString().split('T')[0]}>
              {extendSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ Add Guest Dialog ════ */}
      <Dialog open={addGuestOpen} onOpenChange={v => {
        if (!v) { setAddGuestOpen(false); setAddGuestNewMode(false); setAddGuestNewName(''); setAddGuestNewPhone(''); setAddGuestNewEmail('') }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Add Guest
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by name / phone / email…"
                value={addGuestSearch} onChange={e => setAddGuestSearch(e.target.value)} />
            </div>

            {/* Customer list */}
            <div className="border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
              {addGuestLoading ? (
                <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
              ) : (() => {
                const existingIds = new Set(detailBooking?.guests.map(g => g.customerId) ?? [])
                const q = addGuestSearch.toLowerCase()
                const filtered = addGuestAll.filter(c =>
                  !existingIds.has(c.id) &&
                  (!q || c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q))
                )
                if (filtered.length === 0) return (
                  <div className="py-6 text-center text-xs text-muted-foreground">No guests found</div>
                )
                return filtered.map(c => {
                  const checked = addGuestSelected.has(c.id)
                  return (
                    <button key={c.id} type="button"
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors border-b last:border-b-0 ${checked ? 'bg-muted/60' : ''}`}
                      onClick={() => setAddGuestSelected(prev => {
                        const next = new Set(prev)
                        next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                        return next
                      })}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'border-amber-600 bg-amber-600' : 'border-muted-foreground'}`}>
                        {checked && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {(c.phone || c.email) && <p className="text-xs text-muted-foreground truncate">{c.phone ?? c.email}</p>}
                      </div>
                    </button>
                  )
                })
              })()}
            </div>

            {addGuestSelected.size > 0 && (
              <p className="text-xs text-muted-foreground">{addGuestSelected.size} guest{addGuestSelected.size !== 1 ? 's' : ''} selected</p>
            )}

            {/* Inline create panel */}
            {!addGuestNewMode ? (
              <button
                type="button"
                onClick={() => { setAddGuestNewMode(true); setAddGuestNewName(addGuestSearch) }}
                className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <Plus className="h-3.5 w-3.5" /> Create new guest
              </button>
            ) : (
              <div className="border border-dashed rounded-lg p-3 space-y-2.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New guest</p>
                  <button type="button" onClick={() => { setAddGuestNewMode(false); setAddGuestNewName(''); setAddGuestNewPhone(''); setAddGuestNewEmail('') }} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
                    <Input placeholder="Full name" value={addGuestNewName} onChange={e => setAddGuestNewName(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone / WhatsApp</Label>
                    <Input placeholder="+62…" value={addGuestNewPhone} onChange={e => setAddGuestNewPhone(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input placeholder="email@example.com" value={addGuestNewEmail} onChange={e => setAddGuestNewEmail(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={addGuestCreating || !addGuestNewName.trim()}
                  onClick={async () => {
                    setAddGuestCreating(true)
                    const createRes = await fetch('/api/customers', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: addGuestNewName.trim(), phone: addGuestNewPhone.trim() || undefined, email: addGuestNewEmail.trim() || undefined }),
                    })
                    if (!createRes.ok) {
                      const d = await createRes.json().catch(() => ({}))
                      toast.error(d.error ?? 'Failed to create guest')
                      setAddGuestCreating(false)
                      return
                    }
                    const newCustomer = await createRes.json()
                    setAddGuestAll(prev => [newCustomer, ...prev])
                    setAddGuestSelected(prev => { const n = new Set(prev); n.add(newCustomer.id); return n })
                    setAddGuestNewMode(false)
                    setAddGuestNewName(''); setAddGuestNewPhone(''); setAddGuestNewEmail('')
                    setAddGuestCreating(false)
                  }}
                  className="h-7 text-xs gap-1.5 w-full"
                  style={{ backgroundColor: ACCENT, color: 'white' }}
                >
                  {addGuestCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  {addGuestCreating ? 'Creating…' : 'Add to list'}
                </Button>
              </div>
            )}

            {/* Cabin picker for Open Trip */}
            {detailBooking?.tripType === 'OPEN_TRIP' && detailCabins.length > 0 && (() => {
              const cabinLocked = ['partially_paid', 'fully_paid'].includes(detailBooking.status)
              const lockedCabin = detailBooking.guests?.find((g: any) => g.cabin)?.cabin
              if (cabinLocked && lockedCabin) {
                return (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <BedDouble className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">Cabin locked:</span>
                    <span className="text-xs font-medium">{lockedCabin.name}</span>
                  </div>
                )
              }
              return (
                <div className="space-y-1.5">
                  <Label className="text-xs">Cabin <span className="text-red-500">*</span></Label>
                  <Select value={addGuestCabinId} onValueChange={setAddGuestCabinId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select cabin…" />
                    </SelectTrigger>
                    <SelectContent>
                      {detailCabins.map((c: any) => (
                        <SelectItem key={c.id} value={c.id} disabled={c.isFull}>
                          {c.name}{c.deck ? ` · ${c.deck}` : ''}
                          {c.isFull && <span className="ml-1.5 text-[10px] text-red-400">• Full</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })()}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAddGuestOpen(false); setAddGuestNewMode(false); setAddGuestNewName(''); setAddGuestNewPhone(''); setAddGuestNewEmail('') }} disabled={addGuestSaving}>Cancel</Button>
            <Button
              disabled={addGuestSaving || addGuestSelected.size === 0 || (detailBooking?.tripType === 'OPEN_TRIP' && !addGuestCabinId && !['partially_paid', 'fully_paid'].includes(detailBooking?.status ?? '') && !detailBooking?.guests?.find((g: any) => g.cabin))}
              onClick={async () => {
                if (!detailBooking) return
                setAddGuestSaving(true)

                const cabinLocked = detailBooking.tripType === 'OPEN_TRIP' && ['partially_paid', 'fully_paid'].includes(detailBooking.status)
                const effectiveCabinId = cabinLocked
                  ? (detailBooking.guests?.find((g: any) => g.cabin)?.cabin?.id ?? addGuestCabinId)
                  : addGuestCabinId

                {
                  const ids = Array.from(addGuestSelected)
                  const errors: string[] = []
                  for (const customerId of ids) {
                    const res = await fetch(`/api/bookings/${detailBooking.id}/guests`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customerId, cabinId: effectiveCabinId || undefined }),
                    })
                    if (!res.ok) {
                      const d = await res.json().catch(() => ({}))
                      const name = addGuestAll.find(c => c.id === customerId)?.name ?? customerId
                      errors.push(`${name}: ${d.error ?? 'failed'}`)
                    }
                  }
                  if (errors.length) alert('Some guests could not be added:\n' + errors.join('\n'))
                }

                setAddGuestOpen(false)
                setAddGuestNewMode(false); setAddGuestNewName(''); setAddGuestNewPhone(''); setAddGuestNewEmail('')
                const fresh = await fetch(`/api/bookings/${detailBooking.id}`).then(r => r.json()).catch(() => null)
                if (fresh) {
                  setDetailBooking(fresh)
                  if (fresh.tripType === 'OPEN_TRIP' && fresh.openTrip?.id) {
                    const ot = await fetch(`/api/open-trips/${fresh.openTrip.id}`).then(r => r.json()).catch(() => null)
                    if (ot) setDetailCabins(ot.cabins ?? [])
                  }
                }
                fetchBookings()
                setAddGuestSaving(false)
              }}
              style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
              {addGuestSaving
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Adding…</>
                : `Add ${addGuestSelected.size > 0 ? addGuestSelected.size + ' ' : ''}Guest${addGuestSelected.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ Diving Off Confirmation Dialog (Admin only) ════ */}
      <Dialog open={divingOffDialog} onOpenChange={v => { if (!v) setDivingOffDialog(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Waves className="h-5 w-5" /> Disable Diving Trip?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Guests are already registered for a diving trip. Please provide a reason for disabling diving to keep on record.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                placeholder="e.g. Guest cancelled diving activity…"
                value={divingOffReason}
                onChange={e => setDivingOffReason(e.target.value)}
                disabled={divingOffSaving}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDivingOffDialog(false)} disabled={divingOffSaving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!divingOffReason.trim() || divingOffSaving}
              onClick={async () => {
                if (!detailBooking) return
                setDivingOffSaving(true)
                await fetch(`/api/bookings/${detailBooking.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ hasDiving: false, notes: detailBooking.notes ? `${detailBooking.notes}\n[Diving off: ${divingOffReason}]` : `[Diving off: ${divingOffReason}]` }),
                })
                await fetchBookings()
                const updated = bookings.find(b => b.id === detailBooking.id)
                if (updated) setDetailBooking({ ...updated, hasDiving: false })
                setDivingOffSaving(false)
                setDivingOffDialog(false)
              }}
            >
              {divingOffSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ya, Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ Surfing Off Confirmation Dialog (Admin only) ════ */}
      <Dialog open={surfingOffDialog} onOpenChange={v => { if (!v) setSurfingOffDialog(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              Disable Surfing Trip?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Guests are registered for a surfing trip. Please provide a reason for disabling surfing.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                placeholder="e.g. Guest cancelled surfing activity…"
                value={surfingOffReason}
                onChange={e => setSurfingOffReason(e.target.value)}
                disabled={surfingOffSaving}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSurfingOffDialog(false)} disabled={surfingOffSaving}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!surfingOffReason.trim() || surfingOffSaving}
              onClick={async () => {
                if (!detailBooking) return
                setSurfingOffSaving(true)
                await fetch(`/api/bookings/${detailBooking.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ hasSurfing: false, notes: detailBooking.notes ? `${detailBooking.notes}\n[Surfing off: ${surfingOffReason}]` : `[Surfing off: ${surfingOffReason}]` }),
                })
                await fetchBookings()
                const updated = bookings.find(b => b.id === detailBooking.id)
                if (updated) setDetailBooking({ ...updated, hasSurfing: false })
                setSurfingOffSaving(false)
                setSurfingOffDialog(false)
              }}
            >
              {surfingOffSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ya, Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Refund Confirm Dialog (Sales) ── */}
      {refundConfirmItem && (
        <Dialog open onOpenChange={v => { if (!v) setRefundConfirmItem(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Confirm Refund — {refundConfirmItem.bookingCode}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Refund Amount</p>
                {refundConfirmItem.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{p.invoiceNumber} ({p.paymentType})</span>
                    <span className="font-semibold">${p.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
                  <span>Total</span>
                  <span>${refundConfirmItem.payments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</span>
                </div>
              </div>
              {refundConfirmItem.refundReason && (
                <div className="rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <strong>Refund reason:</strong> {refundConfirmItem.refundReason}
                </div>
              )}
              {refundConfirmItem.refundProof && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refund Proof (from Finance)</Label>
                  <img src={refundConfirmItem.refundProof} alt="Refund proof" className="rounded border w-full max-h-60 object-contain" />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                After confirming with the guest that they received the refund, click <strong>Confirm Received</strong> to complete the cancellation.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefundConfirmItem(null)}>Close</Button>
              <Button
                disabled={refundConfirmSaving}
                onClick={() => handleConfirmRefund(refundConfirmItem!.id)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {refundConfirmSaving ? <><span className="mr-1">⏳</span>Confirming…</> : '✓ Confirm Received'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  )
}
