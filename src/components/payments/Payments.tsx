'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogFooter } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  FileText, Search, X, Loader2, CheckCircle2, XCircle, Clock,
  TrendingUp, AlertCircle, Check, Ban,
  Receipt, Building2, User, Ship, Calendar, Download, UserCheck, RotateCw,
  FilePlus, Eye, CreditCard, ArrowLeftRight, Banknote,
} from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/compressImage'
import { useFileDrop } from '@/hooks/useFileDrop'
import TripSheet from './TripSheet'

interface Bank {
  id: string
  name: string
  bankAddress: string | null
  swiftCode: string | null
  beneficiaryName: string | null
  idrAccount: string | null
  usdAccount: string | null
  address: string | null
  isActive: boolean
}

interface Payment {
  id: string
  invoiceNumber: string
  bookingId: string
  paymentType: string
  paymentMethod: string | null
  amount: number
  previouslyPaid: number
  currency: string
  exchangeRate: number | null
  status: string
  notes: string | null
  proofOfTransfer: string | null
  hasProof?: boolean
  billToType: string | null
  showNetAmount: boolean
  showCommissionNote: boolean
  bankId: string | null
  paymentLink: string | null
  submittedByName: string | null
  confirmedBy: string | null
  confirmedAt: string | null
  createdAt: string
  paymentDate?: string | null
  hasDocument?: boolean
  parentPaymentId?: string | null
  parentPayment?: { invoiceNumber: string } | null
  history?: Array<{ id: string; amount: number; paymentDate: string | null; createdAt: string; status: string; currency: string; exchangeRate: number | null }>
  booking: {
    bookingCode: string
    totalPrice: number
    discount: number
    depositPaid: number
    services: { price: number; quantity: number }[]
    startDate: string
    endDate: string
    destination: string | null
    tripType: string
    source: string | null
    salesperson: string | null
    depositDueDate: string | null
    finalDueDate: string | null
    currency: string
    exchangeRate: number | null
    customer: { name: string; email: string | null; phone: string | null }
    yacht: { name: string; model: string | null } | null
    openTrip: { title: string; destination: string } | null
    agent: { name: string; commissionOpenTrip: number | null; commissionPrivateCharter: number | null } | null
    clawbackEntries: { amount: number }[]
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  requested:            { label: 'Needs Invoice',    color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: FilePlus },
  invoice_ready:        { label: 'Invoice Ready',    color: 'bg-violet-100 text-violet-700 border-violet-200', icon: FileText },
  pending_confirmation: { label: 'Proof Submitted',  color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  confirmed:            { label: 'Confirmed',        color: 'bg-green-100 text-green-700 border-green-200',   icon: CheckCircle2 },
  rejected:             { label: 'Rejected',         color: 'bg-red-100 text-red-700 border-red-200',         icon: XCircle },
  cancelled:            { label: 'Cancelled',        color: 'bg-slate-100 text-slate-600 border-slate-200',    icon: XCircle },
  refunded:             { label: 'Refunded',         color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: XCircle },
}


const CONVERT_CURRENCIES = ['EUR', 'IDR', 'SGD', 'AUD', 'GBP'] as const

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Total price net of agent commission. Commission applies only to the TRIP portion (price excl. additional services). */
function netOfCommission(booking: {
  totalPrice: number; discount: number; tripType: string
  services: { price: number; quantity: number }[]
  agent: { commissionOpenTrip: number | null; commissionPrivateCharter: number | null } | null
}, commPct: number) {
  const svcTotal = booking.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
  // totalPrice is already net of discount (see BookingWizard: total = max(0, base - discountAmt) + services)
  const trip = Math.max(0, booking.totalPrice - svcTotal)
  return (trip - trip * commPct / 100) + svcTotal
}

export default function Payments({ deepLinkId, onDeepLinkHandled }: { deepLinkId?: string | null; onDeepLinkHandled?: () => void } = {}) {
  const { data: session } = useSession()
  const userRole = session?.user?.role ?? ''
  const isFinance = userRole === 'FINANCE' || userRole === 'ADMIN'

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<'all' | 'requested' | 'invoice_ready' | 'pending_confirmation' | 'confirmed' | 'rejected' | 'cancelled' | 'refunded'>('all')
  const [vesselFilter, setVesselFilter] = useState<string>('all')
  const [dateFrom,     setDateFrom]     = useState<string>('')
  const [dateTo,       setDateTo]       = useState<string>('')
  const [selected, setSelected] = useState<Payment | null>(null)
  const [acting, setActing]     = useState(false)
  const [rejectNotes, setRejectNotes]   = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [proofLoading, setProofLoading] = useState(false)
  const [tableView,    setTableView]    = useState<'payments' | 'refunds' | 'trip-sheet'>('payments')

  /* generate invoice */
  const [genInvSaving,       setGenInvSaving]      = useState(false)
  const [genInvAmount,       setGenInvAmount]      = useState('')
  const [genInvType,         setGenInvType]        = useState('DP')
  const [genInvMethod,       setGenInvMethod]      = useState('Transfer Bank')
  const [genInvNotes,        setGenInvNotes]       = useState('')
  const [genInvBillTo,       setGenInvBillTo]      = useState<'AGENT' | 'CUSTOMER'>('CUSTOMER')
  const [genInvEditing,      setGenInvEditing]     = useState(false)
  const [genInvConfirmEdit,  setGenInvConfirmEdit] = useState(false)
  const [genInvBankId,       setGenInvBankId]      = useState<string | null>(null)
  const [genInvUsePayLink,   setGenInvUsePayLink]  = useState(false)
  const [genInvPayLink,      setGenInvPayLink]     = useState('')
  const [genInvShowNet,      setGenInvShowNet]     = useState(false)
  const [genInvShowNote,     setGenInvShowNote]    = useState(false)
  const [banks,              setBanks]             = useState<Bank[]>([])

  // ── Convert a foreign-currency amount received into the USD figure for Amount (USD) ──
  const [amtConvertOpen,     setAmtConvertOpen]     = useState(false)
  const [amtConvertCurrency, setAmtConvertCurrency] = useState<string>('EUR')
  const [amtConvertForeign,  setAmtConvertForeign]  = useState('')
  const [amtConvertRate,     setAmtConvertRate]     = useState('')

  // ── Ad-hoc currency conversion for invoice download ──
  const [convertOpen,     setConvertOpen]     = useState(false)
  const [convertCurrency, setConvertCurrency] = useState<string>('EUR')
  const [convertRate,     setConvertRate]     = useState('')
  const [convertSaving,   setConvertSaving]   = useState(false)

  /* refund decisions */
  interface RefundBooking {
    id: string; bookingCode: string; status: string; cancelReason: string | null
    refundStatus: string | null; refundDecision: string | null; refundReason: string | null
    refundProof: string | null; refundConfirmedAt: string | null; refundConfirmedBy: string | null
    payments: { id: string; invoiceNumber: string; amount: number; paymentType: string }[]
  }
  const [refundBookings,  setRefundBookings]  = useState<RefundBooking[]>([])
  const [refundLoading,   setRefundLoading]   = useState(false)
  const [refundSelected,  setRefundSelected]  = useState<RefundBooking | null>(null)
  const [refundDecision,  setRefundDecision]  = useState<'no_refund' | 'refund' | null>(null)
  const [refundReason,    setRefundReason]    = useState('')
  const [refundProof,     setRefundProof]     = useState('')
  const [refundSaving,    setRefundSaving]    = useState(false)
  const refundProofInputRef = useRef<HTMLInputElement>(null)
  const processRefundProofFile = (file: File) => { compressImage(file).then(setRefundProof).catch(() => {}) }
  const { isDragging: isDraggingRefundProof, dropProps: refundProofDropProps } = useFileDrop(files => { if (files[0]) processRefundProofFile(files[0]) })

  interface RefundHistoryItem {
    id: string; bookingCode: string; status: string; cancelReason: string | null; updatedAt: string
    refundStatus: string | null; refundDecision: string | null; refundReason: string | null
    refundProof: string | null
    refundConfirmedAt: string | null; refundConfirmedBy: string | null
    customer: { name: string }
    salespersonUser: { name: string | null } | null
    payments: { id: string; invoiceNumber: string; amount: number; paymentType: string }[]
  }
  const [refundHistory,        setRefundHistory]        = useState<RefundHistoryItem[]>([])
  const [refundHistoryLoading, setRefundHistoryLoading] = useState(false)
  const [refundHistorySelected,setRefundHistorySelected]= useState<RefundHistoryItem | null>(null)

  const fetchRefundBookings = useCallback(async () => {
    setRefundLoading(true)
    try {
      const res = await fetch('/api/bookings/pending-refund?view=finance')
      if (res.ok) setRefundBookings(await res.json())
    } finally { setRefundLoading(false) }
  }, [])

  const fetchRefundHistory = useCallback(async () => {
    setRefundHistoryLoading(true)
    try {
      const res = await fetch('/api/bookings/refund-history')
      if (res.ok) setRefundHistory(await res.json())
    } finally { setRefundHistoryLoading(false) }
  }, [])

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments')
      if (res.ok) setPayments(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPayments() }, [fetchPayments])
  useEffect(() => { if (isFinance) { fetchRefundBookings(); fetchRefundHistory() } }, [fetchRefundBookings, fetchRefundHistory, isFinance])

  useEffect(() => {
    fetch('/api/banks').then(r => r.json()).then(d => setBanks(Array.isArray(d) ? d.filter((b: Bank) => b.isActive) : [])).catch(() => {})
  }, [])

  const vessels = Array.from(new Set(
    payments.map(p => p.booking.yacht?.name).filter(Boolean) as string[]
  )).sort()

  const filtered = payments.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
    if (vesselFilter !== 'all') {
      const v = p.booking.yacht?.name ?? null
      if (v !== vesselFilter) return false
    }
    if (dateFrom && p.createdAt < dateFrom) return false
    if (dateTo   && p.createdAt > dateTo + 'T23:59:59') return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.invoiceNumber.toLowerCase().includes(q) ||
        p.booking.bookingCode.toLowerCase().includes(q) ||
        p.booking.customer.name.toLowerCase().includes(q) ||
        (p.submittedByName ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const counts = {
    all:                  payments.length,
    requested:            payments.filter(p => p.status === 'requested').length,
    invoice_ready:        payments.filter(p => p.status === 'invoice_ready').length,
    pending_confirmation: payments.filter(p => p.status === 'pending_confirmation').length,
    confirmed:            payments.filter(p => p.status === 'confirmed').length,
    rejected:             payments.filter(p => p.status === 'rejected').length,
    cancelled:            payments.filter(p => p.status === 'cancelled').length,
    refunded:             payments.filter(p => p.status === 'refunded').length,
  }

  const totalConfirmed = payments
    .filter(p => p.status === 'confirmed')
    .reduce((s, p) => s + p.amount, 0)

  const genInvPaymentDestMissing = !genInvBankId && !(genInvUsePayLink && genInvPayLink.trim())

  const handleGenerateInvoice = async (silent = false) => {
    if (!selected) return
    const amount = parseFloat(genInvAmount.replace(/,/g, '')) || 0
    if (amount <= 0) return
    if (genInvPaymentDestMissing) {
      toast.error('Select a bank account or provide a payment link before generating the invoice')
      return
    }
    const isFirstGeneration = selected.status === 'requested'
    setGenInvSaving(true)
    try {
      const res = await fetch(`/api/payments/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_invoice',
          amount,
          paymentType: genInvType,
          paymentMethod: genInvMethod || null,
          notes: genInvNotes || null,
          billToType: genInvBillTo,
          showNetAmount: genInvShowNet,
          showCommissionNote: genInvShowNet && genInvShowNote,
          bankId: genInvBankId || null,
          paymentLink: genInvUsePayLink ? (genInvPayLink || null) : null,
          silent: silent && !isFirstGeneration,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(isFirstGeneration ? 'Invoice generated successfully' : silent ? 'Invoice saved' : 'Invoice updated — Sales has been notified')
      setSelected(null)
      setGenInvAmount(''); setGenInvType('DP'); setGenInvMethod('Transfer Bank'); setGenInvNotes(''); setGenInvBillTo('CUSTOMER'); setGenInvBankId(null); setGenInvUsePayLink(false); setGenInvPayLink(''); setGenInvEditing(false); setGenInvConfirmEdit(false)
      fetchPayments()
      window.dispatchEvent(new CustomEvent('payment-updated'))
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate invoice')
    } finally {
      setGenInvSaving(false)
    }
  }

  const handleSetCurrency = async (currency: string, rate: number | null) => {
    if (!selected) return false
    setConvertSaving(true)
    try {
      const res = await fetch(`/api/payments/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_currency', currency, exchangeRate: rate }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSelected(prev => prev ? { ...prev, currency, exchangeRate: rate } : prev)
      setPayments(prev => prev.map(p => p.id === selected.id ? { ...p, currency, exchangeRate: rate } : p))
      return true
    } catch (err) {
      console.error(err)
      toast.error('Failed to save currency')
      return false
    } finally {
      setConvertSaving(false)
    }
  }

  const handleAction = async (action: 'confirm' | 'reject') => {
    if (!selected) return
    setActing(true)
    try {
      const res = await fetch(`/api/payments/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: action === 'reject' ? rejectNotes : undefined }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'confirm' ? 'Payment confirmed' : 'Payment rejected')
      setSelected(null)
      setShowRejectInput(false)
      setRejectNotes('')
      fetchPayments()
      window.dispatchEvent(new CustomEvent('payment-updated'))
    } catch {
      toast.error('Failed to process payment')
    } finally {
      setActing(false)
    }
  }

  const handleRefundDecision = async () => {
    if (!refundSelected || !refundDecision || !refundReason.trim()) return
    setRefundSaving(true)
    try {
      const res = await fetch(`/api/bookings/${refundSelected.id}/refund`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: refundDecision, reason: refundReason }),
      })
      if (!res.ok) throw new Error()
      toast.success(refundDecision === 'no_refund' ? 'No refund decision saved' : 'Refund approved — please upload proof')
      if (refundDecision === 'no_refund') {
        setRefundSelected(null)
      } else {
        setRefundBookings(prev => prev.map(b => b.id === refundSelected.id ? { ...b, refundStatus: 'refund_pending', refundDecision, refundReason } : b))
        setRefundSelected(prev => prev ? { ...prev, refundStatus: 'refund_pending', refundDecision, refundReason } : null)
      }
      setRefundDecision(null)
      setRefundReason('')
      fetchRefundBookings()
      fetchRefundHistory()
    } catch { toast.error('Failed to save decision') }
    finally { setRefundSaving(false) }
  }

  const handleUploadRefundProof = async () => {
    if (!refundSelected || !refundProof) return
    setRefundSaving(true)
    try {
      const res = await fetch(`/api/bookings/${refundSelected.id}/refund`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload_proof', proofFile: refundProof }),
      })
      if (!res.ok) throw new Error()
      toast.success('Refund proof uploaded — waiting for sales confirmation')
      setRefundSelected(null)
      setRefundProof('')
      fetchRefundBookings()
      fetchRefundHistory()
    } catch { toast.error('Failed to upload proof') }
    finally { setRefundSaving(false) }
  }

  const openDetail = async (p: Payment) => {
    setSelected(p)
    setShowRejectInput(false)
    setRejectNotes('')
    setProofPreview(null)
    const commPct = p.booking.source === 'AGENT'
      ? (p.booking.tripType === 'OPEN_TRIP' ? (p.booking.agent?.commissionOpenTrip ?? 0) : (p.booking.agent?.commissionPrivateCharter ?? 0))
      : 0
    const net = netOfCommission(p.booking, commPct)
    const remaining = Math.max(0, net - p.previouslyPaid)
    const isFullPayment = p.amount > 0 && Math.abs(p.amount - remaining) < 0.01
    setGenInvAmount(p.amount > 0 ? p.amount.toFixed(2) : '')
    setGenInvType(isFullPayment ? 'PELUNASAN' : 'DP')
    setGenInvMethod(p.paymentMethod ?? 'Transfer Bank')
    setGenInvNotes(p.notes ?? '')
    setGenInvBillTo((p.billToType as 'AGENT' | 'CUSTOMER') ?? (p.booking.source === 'AGENT' ? 'AGENT' : 'CUSTOMER'))
    setGenInvBankId(p.bankId ?? null)
    setGenInvUsePayLink(!!p.paymentLink)
    setGenInvPayLink(p.paymentLink ?? '')
    setGenInvShowNet(p.showNetAmount ?? false)
    setGenInvShowNote(p.showCommissionNote ?? false)
    setGenInvEditing(false)
    setGenInvConfirmEdit(false)
    setConvertOpen(false)
    const savedCurrency = p.currency !== 'USD' ? p.currency : (p.booking.currency !== 'USD' ? p.booking.currency : 'EUR')
    setConvertCurrency(savedCurrency)
    setConvertRate(p.currency !== 'USD' && p.exchangeRate ? String(p.exchangeRate) : '')
    setAmtConvertOpen(false)
    setAmtConvertCurrency(savedCurrency)
    setAmtConvertForeign('')
    setAmtConvertRate(p.currency !== 'USD' && p.exchangeRate ? String(p.exchangeRate) : '')
    if (p.status === 'pending_confirmation' || p.status === 'invoice_ready' || p.status === 'confirmed') {
      setProofLoading(true)
      try {
        const res = await fetch(`/api/payments/${p.id}`)
        if (res.ok) {
          const full = await res.json()
          setSelected(prev => prev?.id === full.id ? ({ ...prev, proofOfTransfer: full.proofOfTransfer ?? null, paymentDate: full.paymentDate ?? null, history: full.history ?? [] }) as Payment : prev)
        }
      } catch { /* non-critical */ } finally {
        setProofLoading(false)
      }
    }
  }

  // Deep-link from a notification click — openDetail reads straight off the full row
  // (p.booking.source, p.amount, ...), so find the real row in the already-loaded list
  // rather than opening a bare {id} stub.
  useEffect(() => {
    if (!deepLinkId || payments.length === 0) return
    const found = payments.find(p => p.id === deepLinkId)
    if (found) openDetail(found)
    onDeepLinkHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, payments])

  const tripLabel = (p: Payment) =>
    p.booking.openTrip?.title ?? p.booking.destination ?? p.booking.yacht?.name ?? '—'

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-2xl font-bold tracking-tight">Payment Management</h3>
          <button onClick={() => fetchPayments()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-muted-foreground">Manage and confirm payments from the sales team</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending Action', value: counts.requested + counts.invoice_ready + counts.pending_confirmation, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Confirmed',      value: counts.confirmed,            icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Rejected',       value: counts.rejected,             icon: XCircle,       color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Total Paid',     value: `$${fmt(totalConfirmed)}`,   icon: TrendingUp,    color: 'text-blue-600',   bg: 'bg-blue-50' },
        ].map(s => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                <div className={`${s.bg} p-1.5 rounded-md`}>
                  <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Pending Refund Decisions (Finance only) ── */}
      {isFinance && (refundLoading || refundBookings.length > 0) && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertCircle className="h-4 w-4" />
              Pending Refund Decisions
              {refundBookings.length > 0 && (
                <span className="ml-1 text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5">{refundBookings.length}</span>
              )}
            </CardTitle>
            <CardDescription>Cancelled bookings with confirmed payments awaiting refund decision</CardDescription>
          </CardHeader>
          <CardContent>
            {refundLoading ? (
              <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <div className="space-y-2">
                {refundBookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded">{b.bookingCode}</span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          b.refundStatus === 'pending_decision'  ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          b.refundStatus === 'refund_pending'    ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          b.refundStatus === 'refund_uploaded'   ? 'bg-violet-50 text-violet-700 border-violet-200' :
                          'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {b.refundStatus === 'pending_decision' ? 'Decision Needed' :
                           b.refundStatus === 'refund_pending'   ? 'Refund Approved — Awaiting Proof' :
                           b.refundStatus === 'refund_uploaded'  ? 'Proof Uploaded — Awaiting Sales Confirm' :
                           b.refundStatus}
                        </span>
                      </div>
                      {b.cancelReason && <p className="text-xs text-muted-foreground mt-0.5">Cancel reason: {b.cancelReason}</p>}
                      <p className="text-xs text-muted-foreground">
                        Confirmed payments: {b.payments.map(p => `${p.invoiceNumber} ($${p.amount.toLocaleString()})`).join(', ')}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { setRefundSelected(b); setRefundDecision(b.refundDecision as 'no_refund' | 'refund' | null ?? null); setRefundReason(b.refundReason ?? ''); setRefundProof('') }}>
                      {b.refundStatus === 'pending_decision' ? 'Decide' : b.refundStatus === 'refund_pending' ? 'Upload Proof' : 'View'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 space-y-3">
          {/* Row 1: title + view toggle + search */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>{tableView === 'payments' ? 'All Payments' : tableView === 'refunds' ? 'Refund Records' : 'Trip Sheet'}</CardTitle>
                <CardDescription>
                  {tableView === 'payments' ? `${filtered.length} record(s) found` : tableView === 'refunds' ? `${refundHistory.length} record(s)` : 'Trip-by-trip guest & payment breakdown'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-0.5 rounded-lg border p-0.5 bg-muted/40 shrink-0">
                <button
                  onClick={() => setTableView('payments')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${tableView === 'payments' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Payments
                </button>
                <button
                  onClick={() => setTableView('trip-sheet')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${tableView === 'trip-sheet' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Trip Sheet
                </button>
                {isFinance && (
                  <button
                    onClick={() => setTableView('refunds')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${tableView === 'refunds' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Refunds
                  </button>
                )}
              </div>
            </div>
            {tableView !== 'trip-sheet' && (
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search invoice, booking, name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 w-full h-8 text-sm"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Row 2: status + date filters — payments view only */}
          {tableView === 'payments' && (
            <div className="flex flex-col gap-2">

              {/* Status: dropdown on mobile, chips on sm+ */}
              <div className="sm:hidden">
                <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['all', 'requested', 'invoice_ready', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'refunded'] as const).map(f => (
                      <SelectItem key={f} value={f}>
                        {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label} ({counts[f]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden sm:flex gap-1 flex-wrap">
                {(['all', 'requested', 'invoice_ready', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'refunded'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={[
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                      filter === f
                        ? 'bg-[#1a5f6e] text-white border-[#1a5f6e]'
                        : 'text-muted-foreground border-border hover:bg-muted',
                    ].join(' ')}
                  >
                    {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label}
                    {' '}<span className="opacity-70">({counts[f]})</span>
                  </button>
                ))}
              </div>

              {/* Date range + vessel */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1 min-w-0"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">–</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={e => setDateTo(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1 min-w-0"
                  />
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {vessels.length > 0 && (
                  <Select value={vesselFilter} onValueChange={setVesselFilter}>
                    <SelectTrigger className="h-8 text-xs w-full sm:w-36">
                      <SelectValue placeholder="All Vessels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Vessels</SelectItem>
                      {vessels.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {tableView === 'trip-sheet' ? (
            <div className="p-3">
              <TripSheet />
            </div>
          ) : tableView === 'refunds' ? (
            /* ── Refund Records Table ── */
            refundHistoryLoading ? (
              <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
            ) : refundHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No refund records yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-b-md border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Booking</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="hidden sm:table-cell">Amount</TableHead>
                      <TableHead className="hidden md:table-cell">Cancel Reason</TableHead>
                      <TableHead className="hidden sm:table-cell">Decision</TableHead>
                      <TableHead className="hidden md:table-cell">Refund Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Confirmed By</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refundHistory.map(r => {
                      const totalAmount = r.payments.reduce((s, p) => s + p.amount, 0)
                      const statusCfg: Record<string, string> = {
                        no_refund:        'bg-red-50 text-red-600 border-red-200',
                        refund_pending:   'bg-blue-50 text-blue-700 border-blue-200',
                        refund_uploaded:  'bg-violet-50 text-violet-700 border-violet-200',
                        refund_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      }
                      const statusLabel: Record<string, string> = {
                        no_refund:        'No Refund',
                        refund_pending:   'Pending',
                        refund_uploaded:  'Awaiting',
                        refund_confirmed: 'Confirmed',
                      }
                      return (
                        <TableRow key={r.id} className="text-sm cursor-pointer hover:bg-muted/50" onClick={() => setRefundHistorySelected(r)}>
                          <TableCell>
                            <div className="font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded inline-block">{r.bookingCode}</div>
                            <div className="sm:hidden text-xs font-semibold mt-0.5">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </TableCell>
                          <TableCell className="font-medium">{r.customer.name}</TableCell>
                          <TableCell className="hidden sm:table-cell font-semibold whitespace-nowrap">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[140px] truncate" title={r.cancelReason ?? ''}>{r.cancelReason ?? '—'}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${r.refundDecision === 'refund' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.refundDecision === 'no_refund' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                              {r.refundDecision === 'refund' ? 'Refund' : r.refundDecision === 'no_refund' ? 'No Refund' : '—'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[160px] truncate" title={r.refundReason ?? ''}>{r.refundReason ?? '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCfg[r.refundStatus ?? ''] ?? 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                              {statusLabel[r.refundStatus ?? ''] ?? r.refundStatus ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{r.refundConfirmedBy ?? '—'}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(r.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
          <div className="rounded-b-md border-t overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Booking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="hidden sm:table-cell">Vessel / Trip</TableHead>
                  <TableHead className="hidden lg:table-cell">Submitted By</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Confirmed By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-3.5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-muted-foreground text-sm">
                      No payments found
                    </TableCell>
                  </TableRow>
                ) : filtered.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  const StatusIcon = sc?.icon ?? Clock
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50 text-sm"
                      onClick={() => openDetail(p)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <span className="font-mono text-xs font-medium">{p.invoiceNumber}</span>
                            <div className="sm:hidden font-mono text-[10px] text-muted-foreground mt-0.5">{p.booking.bookingCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{p.booking.bookingCode}</span>
                      </TableCell>
                      <TableCell className="font-medium">{p.booking.customer.name}</TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">
                        ${fmt(p.amount)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {p.paymentMethod ?? '—'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        <div className="font-medium leading-tight">
                          {p.booking.tripType === 'OPEN_TRIP'
                            ? (p.booking.openTrip?.title ?? p.booking.destination ?? '—')
                            : (p.booking.yacht?.name ?? '—')}
                        </div>
                        {p.booking.tripType !== 'OPEN_TRIP' && p.booking.yacht?.model && (
                          <div className="text-xs text-muted-foreground">{p.booking.yacht.model}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                        {p.submittedByName ?? p.booking.salesperson ?? '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{fmtDate(p.createdAt)}</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${sc?.color ?? ''}`}>
                          <StatusIcon className="h-3 w-3" />
                          <span className="hidden xs:inline">{sc?.label ?? p.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {p.confirmedBy ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          {p.status === 'requested' && isFinance && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                              onClick={() => openDetail(p)}
                            >
                              <FilePlus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Generate</span>
                            </Button>
                          )}
                          {p.status === 'pending_confirmation' && isFinance && (
                            <>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openDetail(p)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openDetail(p)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Dialog ── */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null) }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                {selected.invoiceNumber}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Status badge + Download Invoice */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {(() => {
                  const sc = STATUS_CONFIG[selected.status]
                  const Icon = sc?.icon ?? Clock
                  return (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${sc?.color}`}>
                      <Icon className="h-3.5 w-3.5" /> {sc?.label}
                    </div>
                  )
                })()}
                {selected.hasDocument === false ? (
                  <p className="text-xs text-muted-foreground italic">
                    No invoice document — additional DP linked to {selected.parentPayment?.invoiceNumber ?? 'a previous invoice'}
                  </p>
                ) : (() => {
                  const netParam = selected.booking.source === 'AGENT' ? `showNet=${genInvShowNet}` : null
                  const noteParam = selected.booking.source === 'AGENT' ? `showNote=${genInvShowNet && genInvShowNote}` : null
                  const invoiceUrl = (currency?: string) => {
                    const params = [currency && `currency=${currency}`, netParam, noteParam].filter(Boolean)
                    return `/print/invoice/${selected.id}${params.length ? `?${params.join('&')}` : ''}`
                  }
                  const hasConverted = selected.currency !== 'USD' && !!selected.exchangeRate
                  const rateNum = parseFloat(convertRate) || 0
                  return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        onClick={() => window.open(invoiceUrl(hasConverted ? 'USD' : undefined), '_blank')}>
                        <Download className="h-3.5 w-3.5" /> {hasConverted ? 'USD' : 'Download Invoice'}
                      </Button>
                      {hasConverted && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => window.open(invoiceUrl(selected.currency), '_blank')}>
                          <Download className="h-3.5 w-3.5" /> {selected.currency}
                        </Button>
                      )}
                      <Popover open={convertOpen} onOpenChange={setConvertOpen}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                            <ArrowLeftRight className="h-3.5 w-3.5" /> Convert Currency
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 space-y-3" align="end">
                          <p className="text-xs text-muted-foreground">
                            Customer paying in a different currency? Save the conversion rate here — it's stored on this invoice, so it stays the currency going forward.
                          </p>
                          {hasConverted && (
                            <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5 text-[11px]">
                              <span className="text-amber-700 font-medium">Saved: {selected.currency} @ {selected.exchangeRate!.toLocaleString('en-US')}</span>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground underline"
                                disabled={convertSaving}
                                onClick={async () => { await handleSetCurrency('USD', null); setConvertRate('') }}
                              >
                                Reset to USD
                              </button>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Currency</Label>
                              <Select value={convertCurrency} onValueChange={setConvertCurrency}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {CONVERT_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">1 USD =</Label>
                              <Input
                                type="text" inputMode="decimal" className="h-8 text-xs"
                                placeholder="rate"
                                value={convertRate}
                                onChange={e => setConvertRate(e.target.value.replace(/[^0-9.]/g, ''))}
                              />
                            </div>
                          </div>
                          {rateNum > 0 && selected.amount > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              ≈ {(selected.amount * rateNum).toLocaleString('en-US', { maximumFractionDigits: convertCurrency === 'IDR' ? 0 : 2 })} {convertCurrency}
                            </p>
                          )}
                          <Button
                            size="sm" className="w-full h-8 text-xs"
                            disabled={rateNum <= 0 || convertSaving}
                            onClick={async () => {
                              const ok = await handleSetCurrency(convertCurrency, rateNum)
                              if (ok) {
                                window.open(invoiceUrl(convertCurrency), '_blank')
                                setConvertOpen(false)
                              }
                            }}
                          >
                            {convertSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                            Save &amp; Generate {convertCurrency} Invoice
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )
                })()}
              </div>

              {/* Amount summary */}
              <Card className="bg-muted/40">
                <CardContent className="pt-4 pb-3 px-4 grid grid-cols-3 gap-2 sm:gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Previously Paid</p>
                    <p className="font-semibold text-sm">${fmt(selected.previouslyPaid)}</p>
                  </div>
                  <div className="border-x">
                    <p className="text-xs text-muted-foreground mb-0.5">Invoice Amount</p>
                    <p className="font-bold text-lg text-[#1a5f6e]">
                      {selected.amount > 0 ? `$${fmt(selected.amount)}` : <span className="text-muted-foreground text-sm">—</span>}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <p className="text-xs text-muted-foreground">Total Booking</p>
                      {selected.booking.source === 'AGENT' && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${selected.showNetAmount ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                          {selected.showNetAmount ? 'Net' : 'Published'}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm">${fmt(
                      (() => {
                        const isNet = selected.booking.source === 'AGENT' && selected.showNetAmount
                        const commPct = isNet
                          ? (selected.booking.tripType === 'OPEN_TRIP' ? (selected.booking.agent?.commissionOpenTrip ?? 0) : (selected.booking.agent?.commissionPrivateCharter ?? 0))
                          : 0
                        return netOfCommission(selected.booking, commPct)
                      })()
                    )}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Payment history — every confirmed payment on this booking, chronological,
                  so Finance sees the full deposit picture (not just this one invoice) when reviewing. */}
              {!!selected.history?.length && (() => {
                const ORDINALS = ['Deposit', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
                const ordinalPayment = (n: number) => `${ORDINALS[n - 1] ?? `${n}th`} Payment`
                type HistoryEntry = NonNullable<Payment['history']>[number] & { ordinal: number; cumAfter: number }
                const historyRows = selected.history!.reduce<HistoryEntry[]>((acc, h, i) => {
                  const cumAfter = (acc[i - 1]?.cumAfter ?? 0) + h.amount
                  acc.push({ ...h, ordinal: i + 1, cumAfter })
                  return acc
                }, [])
                const currentRow = historyRows.find(h => h.id === selected.id)
                const isNet = selected.booking.source === 'AGENT' && selected.showNetAmount
                const commPct = isNet
                  ? (selected.booking.tripType === 'OPEN_TRIP' ? (selected.booking.agent?.commissionOpenTrip ?? 0) : (selected.booking.agent?.commissionPrivateCharter ?? 0))
                  : 0
                const packageTotal = netOfCommission(selected.booking, commPct)
                const isClosingPayment = !!currentRow && currentRow.cumAfter >= packageTotal - 0.01
                const grandTotal = historyRows.length ? historyRows[historyRows.length - 1].cumAfter : selected.amount
                const balanceAfterAll = Math.max(0, packageTotal - grandTotal)

                return (
                  <Card className="bg-muted/40">
                    <CardContent className="pt-4 pb-3 px-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment History</p>
                      {historyRows.map(h => (
                        <div key={h.id} className="flex justify-between items-center text-xs gap-2">
                          <span className={h.id === selected.id ? 'font-semibold text-[#1a5f6e]' : 'text-muted-foreground italic'}>
                            {ordinalPayment(h.ordinal)} on {fmtDate(h.paymentDate ?? h.createdAt)}{h.id === selected.id ? ' (this payment)' : ''}
                          </span>
                          <span className={h.id === selected.id ? 'font-semibold text-[#1a5f6e] shrink-0' : 'font-medium text-emerald-700 shrink-0'}>${fmt(h.amount)}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold uppercase tracking-wide">{isClosingPayment ? 'Balance Due' : selected.status === 'confirmed' ? 'Total Deposit Paid' : 'Total Deposit Due'}</span>
                        <span className="font-bold text-sm">${fmt(isClosingPayment ? selected.amount : grandTotal)}</span>
                      </div>
                      {!isClosingPayment && (
                        <div className="flex justify-between items-center text-xs">
                          <span className={balanceAfterAll > 0 ? 'text-amber-600' : 'text-emerald-600'}>{balanceAfterAll > 0 ? 'Balance Due' : 'Remaining'}</span>
                          <span className={`font-medium ${balanceAfterAll > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>${fmt(balanceAfterAll)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Payment method chip */}
              {selected.paymentMethod && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted text-foreground border">
                    {selected.paymentMethod}
                  </span>
                </div>
              )}

              {/* Booking info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Booking Code</p>
                    <p className="font-mono font-semibold">{selected.booking.bookingCode}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{selected.booking.customer.name}</p>
                    {selected.booking.customer.email && <p className="text-xs text-muted-foreground">{selected.booking.customer.email}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Ship className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Vessel / Trip</p>
                    <p className="font-medium">
                      {selected.booking.tripType === 'OPEN_TRIP'
                        ? (selected.booking.openTrip?.title ?? selected.booking.destination ?? '—')
                        : (selected.booking.yacht?.name ?? '—')}
                    </p>
                    {selected.booking.tripType !== 'OPEN_TRIP' && selected.booking.yacht?.model && (
                      <p className="text-xs text-muted-foreground">{selected.booking.yacht.model}</p>
                    )}
                    {selected.booking.tripType === 'OPEN_TRIP' && selected.booking.openTrip?.destination && (
                      <p className="text-xs text-muted-foreground">{selected.booking.openTrip.destination}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Trip Date</p>
                    <p className="font-medium">{fmtDate(selected.booking.startDate)} – {fmtDate(selected.booking.endDate)}</p>
                  </div>
                </div>
                {selected.booking.depositDueDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Deposit Due</p>
                      <p className="font-medium text-amber-700">{fmtDate(selected.booking.depositDueDate)}</p>
                    </div>
                  </div>
                )}
                {selected.booking.finalDueDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Final Balance Due</p>
                      <p className="font-medium text-amber-700">{fmtDate(selected.booking.finalDueDate)}</p>
                    </div>
                  </div>
                )}
                {selected.booking.agent && (
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Agent</p>
                      <p className="font-medium">{selected.booking.agent.name}</p>
                    </div>
                  </div>
                )}
                {/* Internal-only (never shown on the invoice/nota) — how much of this agent's
                    clawback debt got auto-deducted when this booking was created. */}
                {selected.booking.agent && selected.booking.clawbackEntries.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Clawback Deducted</p>
                      <p className="font-medium text-red-600">
                        -${fmt(Math.abs(selected.booking.clawbackEntries.reduce((s, e) => s + e.amount, 0)))}
                      </p>
                    </div>
                  </div>
                )}
                {selected.booking.salesperson && (
                  <div className="flex items-start gap-2">
                    <UserCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Salesperson</p>
                      <p className="font-medium">{selected.booking.salesperson}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted By</p>
                    <p className="font-medium">{selected.submittedByName ?? selected.booking.salesperson ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(selected.createdAt)}</p>
                  </div>
                </div>
              </div>

              {selected.notes && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Notes</p>
                  <p>{selected.notes}</p>
                </div>
              )}

              {/* Generate / Edit Invoice (Finance only) — editable while requested, invoice_ready, or pending_confirmation.
                  Not applicable to hasDocument:false records — those are additional DPs with no invoice of their own. */}
              {isFinance && selected.hasDocument !== false && ['requested', 'invoice_ready', 'pending_confirmation'].includes(selected.status) && (() => {
                const isFirstGeneration = selected.status === 'requested'
                return (
                <>
                  <Separator />
                  <div className="space-y-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                        <FilePlus className="h-4 w-4" /> {isFirstGeneration ? 'Generate Invoice' : 'Edit Invoice'}
                      </p>
                      {!genInvEditing && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => setGenInvConfirmEdit(true)}
                        >
                          <Receipt className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      {genInvEditing && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 text-xs text-muted-foreground"
                          onClick={() => setGenInvEditing(false)}
                        >
                          Cancel Edit
                        </Button>
                      )}
                    </div>

                    {/* Edit confirmation prompt */}
                    {genInvConfirmEdit && !genInvEditing && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <p className="text-xs font-medium text-amber-800">Are you sure you want to edit these details?</p>
                        <p className="text-xs text-amber-700">Changes will differ from the original sales request. Make sure any adjustments have been agreed upon.</p>
                        <div className="flex gap-2 pt-0.5">
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => { setGenInvEditing(true); setGenInvConfirmEdit(false) }}
                          >
                            Yes, Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs"
                            onClick={() => setGenInvConfirmEdit(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {(() => {
                      const bRate  = selected.booking.exchangeRate ?? 1
                      const hasIDR = selected.booking.currency === 'IDR' && bRate > 1
                      const rawNum = parseFloat(genInvAmount.replace(/,/g, '')) || 0
                      return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Amount (USD) <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">$</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="pl-6 h-9 text-sm"
                              placeholder="0.00"
                              value={genInvAmount}
                              disabled={!genInvEditing}
                              onChange={e => setGenInvAmount(e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Type</Label>
                          <Select value={genInvType} onValueChange={setGenInvType} disabled={!genInvEditing}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DP">DP</SelectItem>
                              <SelectItem value="PELUNASAN">Pelunasan</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {hasIDR && rawNum > 0 && (
                        <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-xs flex items-center justify-between">
                          <span className="text-muted-foreground">Equivalent (IDR @ {bRate.toLocaleString('id-ID')})</span>
                          <span className="font-semibold text-amber-700">Rp {Math.round(rawNum * bRate).toLocaleString('id-ID')}</span>
                        </div>
                      )}

                      {genInvEditing && (
                        <div className="rounded-md border border-dashed p-2.5 space-y-2">
                          <button
                            type="button"
                            className="text-[11px] font-medium text-blue-700 hover:underline"
                            onClick={() => setAmtConvertOpen(v => !v)}
                          >
                            {amtConvertOpen ? 'Hide' : 'Customer paid in a different currency? Convert to USD'}
                          </button>
                          {amtConvertOpen && (() => {
                            const foreignNum = parseFloat(amtConvertForeign) || 0
                            const rateNum2 = parseFloat(amtConvertRate) || 0
                            const computedUsd = rateNum2 > 0 ? foreignNum / rateNum2 : 0
                            return (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <Select value={amtConvertCurrency} onValueChange={setAmtConvertCurrency}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {CONVERT_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="text" inputMode="decimal" className="h-8 text-xs"
                                    placeholder="Amount received"
                                    value={amtConvertForeign}
                                    onChange={e => setAmtConvertForeign(e.target.value.replace(/[^0-9.]/g, ''))}
                                  />
                                  <Input
                                    type="text" inputMode="decimal" className="h-8 text-xs"
                                    placeholder="1 USD ="
                                    value={amtConvertRate}
                                    onChange={e => setAmtConvertRate(e.target.value.replace(/[^0-9.]/g, ''))}
                                  />
                                </div>
                                <Button
                                  type="button" size="sm" variant="outline" className="w-full h-7 text-xs"
                                  disabled={computedUsd <= 0}
                                  onClick={() => { setGenInvAmount(computedUsd.toFixed(2)); setAmtConvertOpen(false) }}
                                >
                                  {computedUsd > 0
                                    ? `Use $${computedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${foreignNum.toLocaleString('en-US')} ${amtConvertCurrency} ÷ ${rateNum2})`
                                    : 'Enter amount & rate'}
                                </Button>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                      )
                    })()}

                    {/* Bill To — only for AGENT bookings */}
                    {selected.booking.source === 'AGENT' && selected.booking.agent && (
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" /> Bill To
                        </Label>
                        <div className={`flex rounded-lg border overflow-hidden text-xs ${!genInvEditing ? 'opacity-60 pointer-events-none' : ''}`}>
                          {(['AGENT', 'CUSTOMER'] as const).map(opt => (
                            <button
                              key={opt}
                              type="button"
                              disabled={!genInvEditing}
                              onClick={() => setGenInvBillTo(opt)}
                              className={`flex-1 py-2 px-3 font-medium transition-colors flex items-center justify-center gap-1.5 ${genInvBillTo === opt ? 'text-white' : 'text-muted-foreground hover:bg-muted'}`}
                              style={genInvBillTo === opt ? { backgroundColor: 'var(--brand-primary)' } : {}}
                            >
                              {opt === 'AGENT'
                                ? <><Building2 className="h-3.5 w-3.5" />{selected.booking.agent!.name}</>
                                : <><User className="h-3.5 w-3.5" />{selected.booking.customer.name}</>
                              }
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Published / Net toggle — always interactive, AGENT bookings only */}
                    {selected.booking.source === 'AGENT' && (() => {
                      const commPct   = selected.booking.tripType === 'OPEN_TRIP'
                        ? (selected.booking.agent?.commissionOpenTrip ?? 0)
                        : (selected.booking.agent?.commissionPrivateCharter ?? 0)
                      const grossAmt  = selected.booking.totalPrice // already net of discount
                      const netAmt    = netOfCommission(selected.booking, commPct)
                      const fmtN = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      return (
                        <div className="rounded-lg border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <p className="text-xs font-medium">Nominal Invoice</p>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${!genInvShowNet ? 'text-foreground' : 'text-muted-foreground'}`}>Published</span>
                              <button
                                type="button"
                                onClick={() => setGenInvShowNet(v => !v)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${genInvShowNet ? 'bg-amber-500' : 'bg-[#1a5f6e]'}`}
                              >
                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${genInvShowNet ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                              <span className={`text-xs font-medium ${genInvShowNet ? 'text-amber-600' : 'text-muted-foreground'}`}>Net</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 border-t text-xs">
                            <div className={`px-3 py-2 border-r ${!genInvShowNet ? 'bg-muted/40' : ''}`}>
                              <p className="text-muted-foreground mb-0.5">Published</p>
                              <p className={`font-semibold ${!genInvShowNet ? 'text-foreground' : 'text-muted-foreground'}`}>{fmtN(grossAmt)}</p>
                            </div>
                            <div className={`px-3 py-2 ${genInvShowNet ? 'bg-amber-50' : ''}`}>
                              <p className="text-muted-foreground mb-0.5">Net ({commPct}% off)</p>
                              <p className={`font-semibold ${genInvShowNet ? 'text-amber-600' : 'text-muted-foreground'}`}>{fmtN(netAmt)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Commission breakdown disclosure — only meaningful when Net is selected */}
                    {selected.booking.source === 'AGENT' && genInvShowNet && (
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                        <div>
                          <p className="text-xs font-medium">Show Commission on Invoice</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {genInvShowNote ? 'Invoice shows published price + a "less commission" line.' : 'Invoice shows only the final net amount, no breakdown.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGenInvShowNote(v => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${genInvShowNote ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
                        >
                          <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${genInvShowNote ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">Payment Method</Label>
                      <Select value={genInvMethod} onValueChange={v => { setGenInvMethod(v); if (!v.toLowerCase().includes('transfer bank') && !v.toLowerCase().includes('wire')) setGenInvBankId(null) }} disabled={!genInvEditing}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        rows={2} className="text-sm resize-none"
                        placeholder="Additional notes..."
                        disabled={!genInvEditing}
                        value={genInvNotes}
                        onChange={e => setGenInvNotes(e.target.value)}
                      />
                    </div>

                    {/* Payment link / bank selector — always editable by finance */}
                    {(
                      <>
                        <Separator />

                        {banks.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" /> Bank Account for Invoice
                            </Label>
                            <Select value={genInvBankId ?? ''} onValueChange={v => setGenInvBankId(v || null)}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select bank account…" /></SelectTrigger>
                              <SelectContent>
                                {banks.map(b => (
                                  <SelectItem key={b.id} value={b.id}>{b.name}{b.beneficiaryName ? ` — ${b.beneficiaryName}` : ''}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {genInvBankId && (() => {
                              const bk = banks.find(b => b.id === genInvBankId)
                              if (!bk) return null
                              return (
                                <div className="rounded-md bg-muted/40 border px-3 py-2 text-[11px] space-y-0.5 text-muted-foreground">
                                  {bk.swiftCode  && <div><span className="font-medium text-foreground">Swift:</span> {bk.swiftCode}</div>}
                                  {bk.idrAccount && <div><span className="font-medium text-foreground">IDR:</span> {bk.idrAccount}</div>}
                                  {bk.usdAccount && <div><span className="font-medium text-foreground">USD:</span> {bk.usdAccount}</div>}
                                </div>
                              )
                            })()}
                          </div>
                        )}

                        {/* Pay link toggle */}
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="usePayLink"
                            checked={genInvUsePayLink}
                            onCheckedChange={v => { setGenInvUsePayLink(!!v); if (!v) setGenInvPayLink('') }}
                          />
                          <Label htmlFor="usePayLink" className="text-xs cursor-pointer">Also include a Payment Link</Label>
                        </div>

                        {genInvUsePayLink && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Payment Link URL</Label>
                            <Input
                              type="url"
                              placeholder="https://pay.example.com/..."
                              value={genInvPayLink}
                              onChange={e => setGenInvPayLink(e.target.value)}
                              className="text-sm"
                            />
                            {genInvPayLink && (
                              <p className="text-[11px] text-muted-foreground">This link will appear on the invoice for the client to pay directly.</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {genInvPaymentDestMissing && (
                      <p className="text-[11px] text-red-600">
                        Select a bank account or add a payment link before generating the invoice.
                      </p>
                    )}

                    <DialogFooter className="flex-col gap-2 sm:flex-col">
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                        disabled={genInvSaving || !genInvAmount || (parseFloat(genInvAmount) || 0) <= 0 || genInvPaymentDestMissing}
                        onClick={() => handleGenerateInvoice(false)}
                      >
                        {genInvSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FilePlus className="h-4 w-4 mr-1.5" />}
                        {isFirstGeneration ? 'Generate & Notify Sales' : 'Save Changes & Notify Sales'}
                      </Button>
                      {!isFirstGeneration && (
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={genInvSaving || !genInvAmount || (parseFloat(genInvAmount) || 0) <= 0 || genInvPaymentDestMissing}
                          onClick={() => handleGenerateInvoice(true)}
                        >
                          {genInvSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FilePlus className="h-4 w-4 mr-1.5" />}
                          Save Only (No Notification)
                        </Button>
                      )}
                    </DialogFooter>
                  </div>
                </>
                )
              })()}

              {/* Proof of transfer */}
              {(selected.status === 'pending_confirmation' || selected.status === 'invoice_ready' || selected.status === 'confirmed') && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Transfer Proof
                    </Label>
                    {proofLoading ? (
                      <div className="mt-2 flex items-center gap-2.5 border-2 border-dashed rounded-md p-3 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        <span className="text-sm">Checking transfer proof...</span>
                      </div>
                    ) : selected.proofOfTransfer ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          <span className="text-sm text-green-700 font-medium">Proof submitted by Sales</span>
                          <div className="ml-auto flex items-center gap-1.5">
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setProofPreview(proofPreview ? null : selected.proofOfTransfer)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {proofPreview ? 'Hide' : 'View'}
                            </Button>
                            <a
                              href={selected.proofOfTransfer}
                              download={`bukti-${selected.invoiceNumber}.jpg`}
                              className="inline-flex items-center gap-1 h-7 px-2.5 text-xs border rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Download className="h-3 w-3" /> Download
                            </a>
                          </div>
                        </div>
                        {proofPreview && (
                          <img
                            src={proofPreview}
                            alt="Transfer Proof"
                            className="max-h-64 rounded-md border object-contain w-full"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        Transfer proof not yet submitted by Sales
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Confirmed info */}
              {selected.confirmedBy && (
                <>
                  <Separator />
                  {(() => {
                    const s = selected.status
                    const isGood = s === 'confirmed' || s === 'refunded'
                    const label = s === 'confirmed' ? '✓ Confirmed'
                               : s === 'refunded'  ? '↩ Refunded'
                               : s === 'cancelled' ? '✕ Cancelled'
                               : '✕ Rejected'
                    const bg    = isGood ? 'bg-green-50'  : s === 'cancelled' ? 'bg-slate-50' : 'bg-red-50'
                    const text  = isGood ? 'text-green-700' : s === 'cancelled' ? 'text-slate-600' : 'text-red-700'
                    const sub   = isGood ? 'text-green-600' : s === 'cancelled' ? 'text-slate-400' : 'text-red-600'
                    return (
                      <div className={`rounded-md p-3 text-sm ${bg}`}>
                        <p className={`font-medium ${text}`}>{label} by {selected.confirmedBy}</p>
                        {selected.confirmedAt && (
                          <p className={`text-xs mt-0.5 ${sub}`}>{fmtDateTime(selected.confirmedAt)}</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}

              {/* Finance: confirm/reject (pending_confirmation) */}
              {isFinance && selected.status === 'pending_confirmation' && (
                <>
                  <Separator />
                  {!showRejectInput ? (
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setShowRejectInput(true)}
                        disabled={acting}
                      >
                        <Ban className="h-4 w-4 mr-1.5" /> Reject
                      </Button>
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleAction('confirm')}
                        disabled={acting}
                      >
                        {acting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                        Confirm Payment
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm">Rejection reason (optional)</Label>
                      <Textarea
                        rows={2}
                        value={rejectNotes}
                        onChange={e => setRejectNotes(e.target.value)}
                        placeholder="e.g. Transfer proof is invalid..."
                        className="text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowRejectInput(false)} disabled={acting}>
                          Cancel
                        </Button>
                        <Button
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleAction('reject')}
                          disabled={acting}
                        >
                          {acting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Ban className="h-4 w-4 mr-1.5" />}
                          Reject Payment
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Proof preview modal */}
      {proofPreview && !selected && (
        <Dialog open onOpenChange={() => setProofPreview(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Transfer Proof</DialogTitle>
            </DialogHeader>
            <img src={proofPreview} alt="Transfer Proof" className="rounded-md border w-full object-contain" />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Refund Decision Dialog (Finance) ── */}
      {refundSelected && (
        <Dialog open onOpenChange={v => { if (!v) { setRefundSelected(null); setRefundDecision(null); setRefundReason(''); setRefundProof('') } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Refund Decision — {refundSelected.bookingCode}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Confirmed payments summary */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Confirmed Payments</p>
                {refundSelected.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{p.invoiceNumber} ({p.paymentType})</span>
                    <span className="font-semibold">${p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Phase 1: Choose decision */}
              {refundSelected.refundStatus === 'pending_decision' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['no_refund', 'refund'] as const).map(d => (
                        <button key={d} type="button" onClick={() => setRefundDecision(d)}
                          className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${refundDecision === d ? d === 'no_refund' ? 'bg-red-600 text-white border-red-600' : 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-muted'}`}>
                          {d === 'no_refund' ? '✕ No Refund' : '✓ Refund'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Reason <span className="text-red-500">*</span>
                    </Label>
                    <Textarea rows={3} placeholder={refundDecision === 'no_refund' ? 'Reason for no refund...' : 'Reason for refund...'} value={refundReason} onChange={e => setRefundReason(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setRefundSelected(null)}>Cancel</Button>
                    <Button disabled={!refundDecision || !refundReason.trim() || refundSaving} onClick={handleRefundDecision}>
                      {refundSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Confirm Decision
                    </Button>
                  </DialogFooter>
                </>
              )}

              {/* Phase 2: Upload refund proof */}
              {(refundSelected.refundStatus === 'refund_pending' || refundSelected.refundStatus === 'refund_uploaded') && (
                <>
                  <div className="rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <strong>Refund approved.</strong> Reason: {refundSelected.refundReason}
                  </div>
                  {refundSelected.refundStatus === 'refund_uploaded' ? (
                    <div className="rounded-md border bg-violet-50 px-3 py-2 text-sm text-violet-700">
                      Proof uploaded. Waiting for sales team to confirm with guest.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload Refund Proof</Label>
                        <div
                          {...refundProofDropProps}
                          onClick={() => refundProofInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors min-h-28 overflow-hidden cursor-pointer ${
                            isDraggingRefundProof ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                          }`}
                        >
                          {refundProof ? (
                            <img src={refundProof} alt="Refund proof preview" className="w-full max-h-40 object-contain" />
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 py-6 text-muted-foreground">
                              <FilePlus className="h-6 w-6 opacity-40" />
                              <p className="text-sm">{isDraggingRefundProof ? 'Drop to upload' : 'Click or drag image to upload'}</p>
                            </div>
                          )}
                        </div>
                        <input ref={refundProofInputRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const file = e.target.files?.[0]; if (file) processRefundProofFile(file) }}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRefundSelected(null)}>Close</Button>
                        <Button disabled={!refundProof || refundSaving} onClick={handleUploadRefundProof}>
                          {refundSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Upload Proof
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Refund History Detail Dialog ── */}
      {refundHistorySelected && (() => {
        const r = refundHistorySelected
        const total = r.payments.reduce((s, p) => s + p.amount, 0)
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
          <Dialog open onOpenChange={v => { if (!v) setRefundHistorySelected(null) }}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Refund Detail
                  <span className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">{r.bookingCode}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex gap-4 py-1">
                {/* Left: info */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="rounded-lg border divide-y text-sm">
                    {[
                      { label: 'Customer',      value: <span className="font-medium">{r.customer.name}</span> },
                      { label: 'Sales',         value: r.salespersonUser?.name ?? '—' },
                      { label: 'Total Paid',    value: <span className="font-semibold">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> },
                      { label: 'Cancel Reason', value: r.cancelReason ?? '—' },
                      { label: 'Decision',      value: (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${r.refundDecision === 'refund' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.refundDecision === 'no_refund' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                          {r.refundDecision === 'refund' ? 'Refund' : r.refundDecision === 'no_refund' ? 'No Refund' : '—'}
                        </span>
                      )},
                      { label: 'Refund Reason', value: r.refundReason ?? '—' },
                      { label: 'Status',        value: (
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColor[r.refundStatus ?? ''] ?? 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                          {statusLabel[r.refundStatus ?? ''] ?? r.refundStatus ?? '—'}
                        </span>
                      )},
                      ...(r.refundConfirmedBy ? [{ label: 'Confirmed By', value: `${r.refundConfirmedBy}${r.refundConfirmedAt ? ` · ${new Date(r.refundConfirmedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}` }] : []),
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center px-3 py-2">
                        <span className="text-muted-foreground text-xs shrink-0">{row.label}</span>
                        <span className="text-right text-xs ml-2">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  {r.payments.length > 0 && (
                    <div className="rounded-lg border divide-y text-xs">
                      {r.payments.map(p => (
                        <div key={p.id} className="flex justify-between px-3 py-2">
                          <span className="font-mono text-muted-foreground">{p.invoiceNumber}</span>
                          <span className="font-semibold">${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: proof image */}
                {r.refundProof ? (
                  <div className="w-48 shrink-0 flex flex-col gap-1">
                    <p className="text-xs font-semibold text-muted-foreground">Refund Proof</p>
                    <img
                      src={r.refundProof}
                      alt="Refund proof"
                      className="rounded-lg border w-full object-cover bg-muted"
                      style={{ aspectRatio: '3/4', maxHeight: '260px' }}
                    />
                    <a
                      href={r.refundProof}
                      download="refund-proof"
                      className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-medium text-[#1a5f6e] border border-[#1a5f6e]/30 rounded-md py-1.5 hover:bg-[#1a5f6e]/5 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Download
                    </a>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRefundHistorySelected(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

    </div>
  )
}
