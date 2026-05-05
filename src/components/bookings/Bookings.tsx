'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Eye, Edit } from 'lucide-react'
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
  yacht: { id: string; name: string; model?: string }
  customer: { id: string; name: string; email?: string; phone?: string }
  agent?: { id: string; name: string; company?: string }
  guests: Array<{ id: string; isLead: boolean; guest: { name: string } }>
}

const TRIP_LABELS: Record<string, string> = {
  DAY_TRIP: 'Day Trip',
  OVERNIGHT: 'Overnight',
  MULTI_DAY: 'Multi-Day',
  PRIVATE_CHARTER: 'Private Charter',
  CORPORATE: 'Corporate',
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [wizardOpen, setWizardOpen] = useState(false)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      if (res.ok) {
        const data = await res.json()
        setBookings(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const filtered = bookings.filter((b) => {
    const q = searchTerm.toLowerCase()
    const matchSearch =
      b.bookingCode.toLowerCase().includes(q) ||
      b.customer.name.toLowerCase().includes(q) ||
      b.yacht.name.toLowerCase().includes(q) ||
      (b.agent?.name ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || b.status === statusFilter
    const matchSource = sourceFilter === 'all' || b.source === sourceFilter
    return matchSearch && matchStatus && matchSource
  })

  const getDays = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime()
    return Math.max(1, Math.ceil(diff / 86400000))
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Bookings</h3>
          <p className="text-muted-foreground text-sm">Manage all yacht reservations</p>
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          style={{ backgroundColor: '#bdac7e', color: 'white' }}
          className="hover:opacity-90"
        >
          <Plus className="mr-2 h-4 w-4" /> New Booking
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All Bookings</CardTitle>
              <CardDescription>
                {loading ? 'Loading...' : `${filtered.length} booking${filtered.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
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
              placeholder="Search by code, customer, yacht, agent..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Source / Type</TableHead>
                  <TableHead>Yacht</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Deposit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      {bookings.length === 0
                        ? 'No bookings yet — click "New Booking" to get started.'
                        : 'No bookings match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs font-medium">{b.bookingCode}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={b.source === 'AGENT' ? { borderColor: '#bdac7e', color: '#bdac7e' } : {}}
                          >
                            {b.source === 'AGENT' ? 'Agent' : 'Direct'}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {TRIP_LABELS[b.tripType] ?? b.tripType}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{b.yacht.name}</div>
                        {b.yacht.model && (
                          <div className="text-xs text-muted-foreground">{b.yacht.model}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{b.customer.name}</div>
                        {b.agent && (
                          <div className="text-xs text-muted-foreground">via {b.agent.name}</div>
                        )}
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
                        {b.discount > 0 && (
                          <div className="text-xs text-emerald-600">{b.discount}% off</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">${b.depositPaid.toLocaleString()}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[b.status] ?? 'bg-muted text-muted-foreground'}`}
                        >
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <BookingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={fetchBookings}
      />
    </div>
  )
}
