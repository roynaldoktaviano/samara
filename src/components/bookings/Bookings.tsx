'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Plus, Search, Edit, BedDouble } from 'lucide-react'
import { BookingWizard } from './BookingWizard'

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
  destination?: string
  notes?: string
  yacht?: { id: string; name: string; model?: string }
  openTrip?: { id: string; title: string; destination?: string }
  customer: { id: string; name: string; email?: string; phone?: string }
  agent?: { id: string; name: string; company?: string }
  guests: Array<{ id: string; isLead: boolean; customerId: string; customer?: { name: string }; cabin?: { name: string } }>
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending:   'bg-amber-100   text-amber-700   border-amber-200',
  completed: 'bg-blue-100    text-blue-700    border-blue-200',
  cancelled: 'bg-red-100     text-red-700     border-red-200',
}

const ACCENT = '#bdac7e'

export default function Bookings() {
  const [bookings,      setBookings]      = useState<BookingRecord[]>([])
  const [loading,       setLoading]       = useState(true)
  const [searchTerm,    setSearchTerm]    = useState('')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [sourceFilter,  setSourceFilter]  = useState('all')
  const [wizardOpen,    setWizardOpen]    = useState(false)
  const [editBooking,   setEditBooking]   = useState<BookingRecord | null>(null)
  const [editSaving,    setEditSaving]    = useState(false)

  /* edit form state */
  const [editStatus,    setEditStatus]    = useState('')
  const [editTotal,     setEditTotal]     = useState('')
  const [editDeposit,   setEditDeposit]   = useState('')
  const [editDiscount,  setEditDiscount]  = useState('')
  const [editNotes,     setEditNotes]     = useState('')

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      if (res.ok) setBookings(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const openEdit = (b: BookingRecord) => {
    setEditBooking(b)
    setEditStatus(b.status)
    setEditTotal(b.totalPrice.toString())
    setEditDeposit(b.depositPaid.toString())
    setEditDiscount(b.discount.toString())
    setEditNotes(b.notes ?? '')
  }

  const saveEdit = async () => {
    if (!editBooking) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:      editStatus,
          totalPrice:  editTotal,
          depositPaid: editDeposit,
          discount:    editDiscount,
          notes:       editNotes,
        }),
      })
      if (res.ok) {
        await fetchBookings()
        setEditBooking(null)
      }
    } catch (e) { console.error(e) }
    finally { setEditSaving(false) }
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
    return matchSearch && matchStatus && matchSource
  })

  const getDays = (s: string, e: string) => Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000))
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Bookings</h3>
          <p className="text-muted-foreground text-sm">Manage all yacht reservations</p>
        </div>
        <Button onClick={() => setWizardOpen(true)} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
          <Plus className="mr-2 h-4 w-4" /> New Booking
        </Button>
      </div>

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
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="DIRECT">Direct</SelectItem>
                  <SelectItem value="AGENT">Via Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search by code, customer, yacht, agent…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

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
                  <TableHead>Deposit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      {bookings.length === 0 ? 'No bookings yet — click "New Booking" to get started.' : 'No bookings match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(b => (
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
                          <div>{fmt(b.startDate)}</div>
                          <div className="text-muted-foreground">{fmt(b.endDate)}</div>
                          <div className="text-muted-foreground">{getDays(b.startDate, b.endDate)}d</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{b.guestCount}</TableCell>
                      <TableCell className="text-sm font-medium">
                        ${b.totalPrice.toLocaleString()}
                        {b.discount > 0 && <div className="text-xs text-emerald-600">{b.discount}% off</div>}
                      </TableCell>
                      <TableCell className="text-sm">${b.depositPaid.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[b.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => openEdit(b)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Edit Booking Dialog ── */}
      <Dialog open={!!editBooking} onOpenChange={v => !v && setEditBooking(null)}>
        <DialogContent className="w-240 max-w-[100vw]">
          {editBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-base">{editBooking.bookingCode}</span>
                  <span className="text-sm font-normal text-muted-foreground">— Edit Booking</span>
                </DialogTitle>
              </DialogHeader>

              {/* Read-only summary */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-0.5">Customer</p>
                  <p className="font-semibold">{editBooking.customer.name}</p>
                  {editBooking.agent && <p className="text-muted-foreground">via {editBooking.agent.name}</p>}
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-0.5">
                    {editBooking.tripType === 'OPEN_TRIP' ? 'Trip' : 'Yacht'}
                  </p>
                  <p className="font-semibold">
                    {editBooking.tripType === 'OPEN_TRIP' ? editBooking.openTrip?.title : editBooking.yacht?.name}
                  </p>
                  <p className="text-muted-foreground">{fmt(editBooking.startDate)} → {fmt(editBooking.endDate)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground mb-0.5">Guests & Cabins</p>
                  {editBooking.guests.map(g => (
                    <div key={g.id} className="flex items-center gap-1">
                      <span className="font-medium">{g.customer?.name ?? '—'}</span>
                      {g.cabin && (
                        <span className="text-muted-foreground flex items-center gap-0.5">
                          <BedDouble className="w-2.5 h-2.5" /> {g.cabin.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label>Deposit Paid (USD)</Label>
                  <Input type="number" min="0" value={editDeposit} onChange={e => setEditDeposit(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Input placeholder="Internal notes…" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditBooking(null)}>Cancel</Button>
                <Button
                  disabled={editSaving}
                  onClick={saveEdit}
                  style={{ backgroundColor: ACCENT, color: 'white' }}
                  className="hover:opacity-90"
                >
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
