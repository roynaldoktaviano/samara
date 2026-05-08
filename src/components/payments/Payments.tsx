'use client'

import { useState, useEffect, useCallback } from 'react'
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
import {
  FileText, Search, X, Loader2, CheckCircle2, XCircle, Clock,
  Upload, Eye, DollarSign, TrendingUp, AlertCircle, Check, Ban,
  Receipt, Building2, User, Ship, Calendar, Download, UserCheck
} from 'lucide-react'
import { toast } from 'sonner'

interface Payment {
  id: string
  invoiceNumber: string
  bookingId: string
  paymentType: string
  amount: number
  previouslyPaid: number
  currency: string
  status: string
  notes: string | null
  proofOfTransfer: string | null
  submittedByName: string | null
  confirmedBy: string | null
  confirmedAt: string | null
  createdAt: string
  booking: {
    bookingCode: string
    totalPrice: number
    depositPaid: number
    startDate: string
    endDate: string
    destination: string | null
    tripType: string
    source: string | null
    salesperson: string | null
    customer: { name: string; email: string | null; phone: string | null }
    yacht: { name: string; model: string | null } | null
    openTrip: { title: string; destination: string } | null
    agent: { name: string; company: string | null; commission: number | null } | null
    services: { name: string; price: number }[]
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending_confirmation: { label: 'Menunggu Konfirmasi', color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Clock },
  confirmed:            { label: 'Dikonfirmasi',         color: 'bg-green-100 text-green-700 border-green-200',  icon: CheckCircle2 },
  rejected:             { label: 'Ditolak',              color: 'bg-red-100 text-red-700 border-red-200',        icon: XCircle },
}


const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Payments() {
  const { data: session } = useSession()
  const userRole = session?.user?.role ?? ''
  const isFinance = userRole === 'FINANCE' || userRole === 'ADMIN'

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<'all' | 'pending_confirmation' | 'confirmed' | 'rejected'>('all')
  const [selected, setSelected] = useState<Payment | null>(null)
  const [acting, setActing]     = useState(false)
  const [rejectNotes, setRejectNotes]   = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [proofPreview, setProofPreview] = useState<string | null>(null)

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

  const filtered = payments.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
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
    pending_confirmation: payments.filter(p => p.status === 'pending_confirmation').length,
    confirmed:            payments.filter(p => p.status === 'confirmed').length,
    rejected:             payments.filter(p => p.status === 'rejected').length,
  }

  const totalConfirmed = payments
    .filter(p => p.status === 'confirmed')
    .reduce((s, p) => s + p.amount, 0)

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
      toast.success(action === 'confirm' ? 'Payment dikonfirmasi' : 'Payment ditolak')
      setSelected(null)
      setShowRejectInput(false)
      setRejectNotes('')
      fetchPayments()
      window.dispatchEvent(new CustomEvent('payment-updated'))
    } catch {
      toast.error('Gagal memproses payment')
    } finally {
      setActing(false)
    }
  }

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      try {
        const res = await fetch(`/api/payments/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proofOfTransfer: base64 }),
        })
        if (!res.ok) throw new Error()
        toast.success('Bukti transfer berhasil diupload')
        setSelected(prev => prev ? { ...prev, proofOfTransfer: base64 } : prev)
        fetchPayments()
      } catch {
        toast.error('Gagal upload bukti transfer')
      }
    }
    reader.readAsDataURL(file)
  }

  const openDetail = (p: Payment) => {
    setSelected(p)
    setShowRejectInput(false)
    setRejectNotes('')
    setProofPreview(null)
  }

  const tripLabel = (p: Payment) =>
    p.booking.openTrip?.title ?? p.booking.destination ?? p.booking.yacht?.name ?? '—'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Payment Management</h3>
        <p className="text-muted-foreground">Kelola dan konfirmasi pembayaran dari tim sales</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Menunggu Konfirmasi', value: counts.pending_confirmation, icon: Clock,         color: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'Dikonfirmasi',        value: counts.confirmed,            icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Ditolak',             value: counts.rejected,             icon: XCircle,       color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Total Dikonfirmasi',  value: `$${fmt(totalConfirmed)}`, icon: TrendingUp,   color: 'text-blue-600',   bg: 'bg-blue-50' },
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

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Semua Payment</CardTitle>
              <CardDescription>{filtered.length} record ditemukan</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari invoice, booking, nama..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />
              {search && <button onClick={() => setSearch('')}><X className="h-4 w-4 text-muted-foreground" /></button>}
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 pt-1 flex-wrap">
            {(['all', 'pending_confirmation', 'confirmed', 'rejected'] as const).map(f => (
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
                {f === 'all' ? 'Semua' : STATUS_CONFIG[f]?.label}
                {' '}
                <span className="opacity-70">({counts[f]})</span>
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="rounded-b-md border-t">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Invoice</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Kapal / Trip</TableHead>
                  <TableHead>Dikirim Oleh</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dikonfirmasi Oleh</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(10)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-3.5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground text-sm">
                      Tidak ada payment ditemukan
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
                          <span className="font-mono text-xs font-medium">{p.invoiceNumber}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{p.booking.bookingCode}</span>
                      </TableCell>
                      <TableCell className="font-medium">{p.booking.customer.name}</TableCell>
                      <TableCell className="font-semibold">
                        ${fmt(p.amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium leading-tight">
                          {p.booking.tripType === 'OPEN_TRIP'
                            ? (p.booking.openTrip?.title ?? p.booking.destination ?? '—')
                            : (p.booking.yacht?.name ?? '—')}
                        </div>
                        {p.booking.tripType !== 'OPEN_TRIP' && p.booking.yacht?.model && (
                          <div className="text-xs text-muted-foreground">{p.booking.yacht.model}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {p.submittedByName ?? p.booking.salesperson ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{fmtDate(p.createdAt)}</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${sc?.color ?? ''}`}>
                          <StatusIcon className="h-3 w-3" />
                          {sc?.label ?? p.status}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.confirmedBy ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.status === 'pending_confirmation' && (
                          <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                            {isFinance ? (
                              <>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => { openDetail(p) }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => { openDetail(p) }}
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              !p.proofOfTransfer && (
                                <span className="text-[10px] text-amber-600 font-medium">Upload bukti</span>
                              )
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
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
                <Button
                  size="sm" variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => window.open(`/print/invoice/${selected.id}`, '_blank')}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Invoice
                </Button>
              </div>

              {/* Amount summary */}
              <Card className="bg-muted/40">
                <CardContent className="pt-4 pb-3 px-4 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Sebelumnya Dibayar</p>
                    <p className="font-semibold text-sm">${fmt(selected.previouslyPaid)}</p>
                  </div>
                  <div className="border-x">
                    <p className="text-xs text-muted-foreground mb-0.5">Jumlah Invoice Ini</p>
                    <p className="font-bold text-lg text-[#1a5f6e]">${fmt(selected.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Total Booking</p>
                    <p className="font-semibold text-sm">${fmt(
                      selected.booking.source === 'AGENT' && selected.booking.agent?.commission
                        ? selected.booking.totalPrice * (1 - selected.booking.agent.commission / 100)
                        : selected.booking.totalPrice
                    )}</p>
                  </div>
                </CardContent>
              </Card>

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
                    <p className="text-xs text-muted-foreground">Kapal / Trip</p>
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
                    <p className="text-xs text-muted-foreground">Tanggal Trip</p>
                    <p className="font-medium">{fmtDate(selected.booking.startDate)} – {fmtDate(selected.booking.endDate)}</p>
                  </div>
                </div>
                {selected.booking.agent && (
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Agent</p>
                      <p className="font-medium">{selected.booking.agent.name}</p>
                      {selected.booking.agent.company && <p className="text-xs text-muted-foreground">{selected.booking.agent.company}</p>}
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
                    <p className="text-xs text-muted-foreground">Dikirim Oleh</p>
                    <p className="font-medium">{selected.submittedByName ?? selected.booking.salesperson ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(selected.createdAt)}</p>
                  </div>
                </div>
              </div>

              {selected.notes && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Catatan</p>
                  <p>{selected.notes}</p>
                </div>
              )}

              <Separator />

              {/* Proof of transfer */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bukti Transfer
                </Label>
                {selected.proofOfTransfer ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm text-green-700 font-medium">Bukti sudah diupload</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setProofPreview(proofPreview ? null : selected.proofOfTransfer)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          {proofPreview ? 'Sembunyikan' : 'Lihat'}
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
                        alt="Bukti Transfer"
                        className="max-h-64 rounded-md border object-contain w-full"
                      />
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    {!isFinance && selected.status === 'pending_confirmation' ? (
                      <label className="flex items-center gap-2 border-2 border-dashed rounded-md p-3 cursor-pointer hover:border-[#1a5f6e] transition-colors">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Klik untuk upload bukti transfer</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} />
                      </label>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        Bukti transfer belum diupload
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Confirmed info */}
              {selected.confirmedBy && (
                <>
                  <Separator />
                  <div className={`rounded-md p-3 text-sm ${selected.status === 'confirmed' ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className={`font-medium ${selected.status === 'confirmed' ? 'text-green-700' : 'text-red-700'}`}>
                      {selected.status === 'confirmed' ? '✓ Dikonfirmasi' : '✗ Ditolak'} oleh {selected.confirmedBy}
                    </p>
                    {selected.confirmedAt && (
                      <p className={`text-xs mt-0.5 ${selected.status === 'confirmed' ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtDateTime(selected.confirmedAt)}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Finance action buttons */}
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
                        <Ban className="h-4 w-4 mr-1.5" /> Tolak
                      </Button>
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleAction('confirm')}
                        disabled={acting}
                      >
                        {acting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                        Konfirmasi
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm">Alasan penolakan (opsional)</Label>
                      <Textarea
                        rows={2}
                        value={rejectNotes}
                        onChange={e => setRejectNotes(e.target.value)}
                        placeholder="Misal: Bukti transfer tidak valid..."
                        className="text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowRejectInput(false)} disabled={acting}>
                          Batal
                        </Button>
                        <Button
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleAction('reject')}
                          disabled={acting}
                        >
                          {acting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Ban className="h-4 w-4 mr-1.5" />}
                          Tolak Payment
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
              <DialogTitle>Bukti Transfer</DialogTitle>
            </DialogHeader>
            <img src={proofPreview} alt="Bukti Transfer" className="rounded-md border w-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
