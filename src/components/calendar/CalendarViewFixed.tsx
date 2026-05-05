'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Anchor, Clock, Users, Plus, TrendingUp, DollarSign, Filter, X } from 'lucide-react'

interface BookingEvent {
  id: string
  yachtName: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
  customerName?: string
  bookingCode?: string
  totalPrice?: number
  eventColor?: string
  departurePort?: string
  arrivalPort?: string
  price?: number
  depositAmount?: number
  depositDueDate?: string
  balanceDueDate?: string
  notes?: string
  tripType?: 'open-trip' | 'private-charter'
}

const YACHT_COLOR_KEYS = ['green', 'blue', 'purple', 'pink', 'yellow', 'teal'] as const

function assignYachtColor(yachtName: string): string {
  let hash = 0
  for (let i = 0; i < yachtName.length; i++) hash += yachtName.charCodeAt(i)
  return YACHT_COLOR_KEYS[hash % YACHT_COLOR_KEYS.length]
}

const colorPalette = {
  green: { bg: '#d1fae5', text: '#065f46', hover: '#a7f3d0', light: '#ecfdf5' },
  blue: { bg: '#dbeafe', text: '#1e40af', hover: '#bfdbfe', light: '#eff6ff' },
  purple: { bg: '#ede9fe', text: '#5b21b6', hover: '#ddd6fe', light: '#f5f3ff' },
  pink: { bg: '#fce7f3', text: '#9d174d', hover: '#fbcfe8', light: '#fdf2f8' },
  yellow: { bg: '#fef3c7', text: '#92400e', hover: '#fde68a', light: '#fffbeb' },
  teal: { bg: '#ccfbf1', text: '#115e59', hover: '#99f6e4', light: '#f0fdfa' },
}

const statusColors = {
  confirmed: { bg: '#0d9488', text: 'white', light: '#ccfbf1' },
  pending: { bg: '#d97706', text: 'white', light: '#fef3c7' },
  completed: { bg: '#9ca3af', text: 'white', light: '#f3f4f6' },
  cancelled: { bg: '#dc2626', text: 'white', light: '#fee2e2' },
}

type DbYacht = { id: string; name: string; dailyRate: number }
type DbCustomer = { id: string; name: string }

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedBooking, setSelectedBooking] = useState<BookingEvent | null>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)

  // Filters
  const [selectedYachtFilter, setSelectedYachtFilter] = useState<string>('all')
  const [selectedTripTypeFilter, setSelectedTripTypeFilter] = useState<string>('all')

  // DB data
  const [bookings, setBookings] = useState<BookingEvent[]>([])
  const [yachts, setYachts] = useState<DbYacht[]>([])
  const [customers, setCustomers] = useState<DbCustomer[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings')
      const data = await res.json()
      const mapped: BookingEvent[] = data.map((b: any) => ({
        id: b.id,
        yachtName: b.yacht.name,
        startDate: b.startDate.split('T')[0],
        endDate: b.endDate.split('T')[0],
        status: b.status as BookingEvent['status'],
        customerName: b.customer.name,
        bookingCode: b.bookingCode,
        totalPrice: b.totalPrice,
        depositAmount: b.depositPaid,
        notes: b.notes ?? undefined,
        eventColor: assignYachtColor(b.yacht.name),
      }))
      setBookings(mapped)
    } catch (e) {
      console.error('Failed to fetch bookings', e)
    }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchBookings(),
        fetch('/api/yachts').then(r => r.json()).then((data: any[]) =>
          setYachts(data.map(y => ({ id: y.id, name: y.name, dailyRate: y.dailyRate })))
        ),
        fetch('/api/customers').then(r => r.json()).then((data: any[]) =>
          setCustomers(data.map(c => ({ id: c.id, name: c.name })))
        ),
      ])
      setLoading(false)
    }
    loadData()
  }, [fetchBookings])

  const [bookingForm, setBookingForm] = useState({
    yachtId: '',
    customerId: '',
    checkInDate: '',
    checkOutDate: '',
    status: 'pending',
    tripType: 'open-trip' as 'open-trip' | 'private-charter',
    price: '',
    depositAmount: '',
    depositDueDate: '',
    balanceDueDate: '',
    notes: '',
  })

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()
    
    return { firstDay, daysInMonth, daysInPrevMonth, month, year }
  }

  const handleDateClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDate(dateStr)
    setBookingForm({
      ...bookingForm,
      checkInDate: dateStr,
      checkOutDate: '',
    })
    setIsBookingDialogOpen(true)
  }

  const handleBookingClick = (booking: BookingEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedBooking(booking)
    setIsDetailDialogOpen(true)
  }

  const handleCreateBooking = async () => {
    const yacht = yachts.find(y => y.id === bookingForm.yachtId)
    const customer = customers.find(c => c.id === bookingForm.customerId)

    if (!yacht || !customer || !bookingForm.checkInDate || !bookingForm.checkOutDate) {
      alert('Please fill in all required fields')
      return
    }

    const newStartDate = new Date(bookingForm.checkInDate)
    const newEndDate = new Date(bookingForm.checkOutDate)
    const days = Math.ceil((newEndDate.getTime() - newStartDate.getTime()) / (1000 * 60 * 60 * 24))
    const price = bookingForm.price ? parseFloat(bookingForm.price) : Math.max(1, days) * yacht.dailyRate

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: yacht.id,
          customerId: customer.id,
          startDate: bookingForm.checkInDate,
          endDate: bookingForm.checkOutDate,
          totalPrice: price,
          depositPaid: bookingForm.depositAmount ? parseFloat(bookingForm.depositAmount) : 0,
          notes: bookingForm.notes || null,
          status: bookingForm.status,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? 'Failed to create booking')
        return
      }

      await fetchBookings()
      setIsBookingDialogOpen(false)
      setBookingForm({
        yachtId: '',
        customerId: '',
        checkInDate: '',
        checkOutDate: '',
        status: 'pending',
        tripType: 'open-trip' as 'open-trip' | 'private-charter',
        price: '',
        depositAmount: '',
        depositDueDate: '',
        balanceDueDate: '',
        notes: '',
      })
    } catch (e) {
      alert('Network error. Please try again.')
    }
  }

  const { firstDay, daysInMonth, month, year } = getDaysInMonth(currentDate)
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  // Filter bookings based on selected filters
  const filteredBookings = useMemo(() => {
    return bookings.filter(booking => {
      const yachtMatch = selectedYachtFilter === 'all' || booking.yachtName === selectedYachtFilter
      const tripTypeMatch = selectedTripTypeFilter === 'all' || booking.tripType === selectedTripTypeFilter
      return yachtMatch && tripTypeMatch
    })
  }, [bookings, selectedYachtFilter, selectedTripTypeFilter])

  // Generate booking bars
  const bookingBars = useMemo(() => {
    const bars: any[] = []

    filteredBookings.forEach((event) => {
      const start = new Date(event.startDate)
      const end = new Date(event.endDate)

      const bookingStartMonth = start.getMonth()
      const bookingStartYear = start.getFullYear()
      const bookingEndMonth = end.getMonth()
      const bookingEndYear = end.getFullYear()

      // Check if booking overlaps with current month
      const monthStart = new Date(year, month, 1)
      const monthEnd = new Date(year, month + 1, 0)

      // Skip if booking doesn't overlap with current month
      if (end < monthStart || start > monthEnd) {
        return
      }

      // Calculate the visible start and end days in current month
      let visibleStartDay = 1
      let visibleEndDay = daysInMonth

      if (start >= monthStart && start <= monthEnd) {
        visibleStartDay = start.getDate()
      }

      if (end >= monthStart && end <= monthEnd) {
        visibleEndDay = end.getDate()
      }

      // Calculate grid positions
      const gridStart = firstDay + visibleStartDay - 1
      const gridEnd = firstDay + visibleEndDay - 1
      const span = visibleEndDay - visibleStartDay + 1

      bars.push({
        ...event,
        startDay: visibleStartDay,
        endDay: visibleEndDay,
        span,
        gridStart,
        gridEnd,
      })
    })

    // Assign rows to avoid overlaps
    const rows: any[] = []
    bars.sort((a, b) => a.gridStart - b.gridStart)

    bars.forEach(bar => {
      let placed = false
      for (let i = 0; i < rows.length; i++) {
        const canPlace = rows[i].every((existingBar: any) =>
          bar.gridStart > existingBar.gridEnd ||
          bar.gridEnd < existingBar.gridStart
        )
        if (canPlace) {
          rows[i].push(bar)
          bar.row = i
          placed = true
          break
        }
      }
      if (!placed) {
        rows.push([bar])
        bar.row = rows.length - 1
      }
    })

    return bars
  }, [month, year, firstDay, daysInMonth, filteredBookings])

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1))
      return newDate
    })
  }

  // Build calendar grid
  const calendarDays: { day: number; isCurrentMonth: boolean }[] = []
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({ day: 0, isCurrentMonth: false })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ day: i, isCurrentMonth: true })
  }
  const remainingDays = 42 - calendarDays.length
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push({ day: 0, isCurrentMonth: false })
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const isCurrentMonthToday = today.getMonth() === month && today.getFullYear() === year
  const todayDate = today.getDate()

  const todayBookings = bookings.filter(event => {
    const start = new Date(event.startDate)
    const end = new Date(event.endDate)
    const current = new Date(todayStr)
    return current >= start && current <= end
  })

  const getDaysBetweenDates = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  const getEventStyle = (color: string) => {
    const style = colorPalette[color as keyof typeof colorPalette] || colorPalette.green
    return {
      backgroundColor: style.bg,
      color: style.text,
      hover: style.hover,
    }
  }

  const quickStats = {
    totalYachts: yachts.length,
    activeBookings: bookings.filter(e => e.status === 'confirmed' || e.status === 'pending').length,
    availableYachts: yachts.length,
    monthlyRevenue: bookings
      .filter(e => {
        const eventDate = new Date(e.startDate)
        return eventDate.getMonth() === month && eventDate.getFullYear() === year && e.totalPrice
      })
      .reduce((sum, e) => sum + (e.totalPrice || 0), 0),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading calendar...</div>
      </div>
    )
  }

  const getEstimatedPrice = () => {
    if (!bookingForm.yachtId || !bookingForm.checkInDate || !bookingForm.checkOutDate) return 0
    if (bookingForm.price) return parseFloat(bookingForm.price) || 0
    const yacht = yachts.find(y => y.id === bookingForm.yachtId)
    if (!yacht) return 0
    const startDate = new Date(bookingForm.checkInDate)
    const endDate = new Date(bookingForm.checkOutDate)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, days) * yacht.dailyRate
  }

  const getRemainingBalance = () => {
    const total = getEstimatedPrice()
    const deposit = bookingForm.depositAmount ? parseFloat(bookingForm.depositAmount) : 0
    return total - deposit
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-muted-foreground">Manage your yacht bookings and schedule</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setSelectedDate('')
              setBookingForm({ yachtId: '', customerId: '', checkInDate: '', checkOutDate: '', status: 'pending', tripType: 'open-trip', price: '', depositAmount: '', depositDueDate: '', balanceDueDate: '', notes: '' })
              setIsBookingDialogOpen(true)
            }}
            className="bg-[#bdac7e] from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

    

      {/* Booking Dialog */}
      <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl bg-[#bdac7e] from-purple-600 to-pink-600 bg-clip-text text-transparent">
              New Booking
            </DialogTitle>
            <DialogDescription>
              {selectedDate ? `Starting date: ${new Date(selectedDate).toLocaleDateString()}` : 'Create a new yacht booking'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Customer & Yacht Section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <Select
                  value={bookingForm.customerId}
                  onValueChange={(value) => setBookingForm({ ...bookingForm, customerId: value })}
                >
                  <SelectTrigger className="border-2">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="yacht">Yacht *</Label>
                <Select
                  value={bookingForm.yachtId}
                  onValueChange={(value) => setBookingForm({ ...bookingForm, yachtId: value })}
                >
                  <SelectTrigger className="border-2">
                    <SelectValue placeholder="Select a yacht" />
                  </SelectTrigger>
                  <SelectContent>
                    {yachts.map(yacht => {
                      const colorKey = assignYachtColor(yacht.name)
                      const colorStyle = colorPalette[colorKey as keyof typeof colorPalette] || colorPalette.green
                      return (
                        <SelectItem key={yacht.id} value={yacht.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: colorStyle.bg }} />
                            <span className="font-medium">{yacht.name}</span>
                            <span className="text-xs bg-[#bdac7e] from-purple-100 to-pink-100 text-purple-700 px-2 py-0.5 rounded-full font-bold ml-auto">
                              ${yacht.dailyRate}/day
                            </span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status Section */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={bookingForm.status}
                onValueChange={(value) => setBookingForm({ ...bookingForm, status: value as any })}
              >
                <SelectTrigger className="border-2">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trip Type Section */}
            <div className="space-y-2">
              <Label htmlFor="tripType">Trip Type</Label>
              <Select
                value={bookingForm.tripType}
                onValueChange={(value) => setBookingForm({ ...bookingForm, tripType: value as any })}
              >
                <SelectTrigger className="border-2">
                  <SelectValue placeholder="Select trip type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open-trip">Open Trip</SelectItem>
                  <SelectItem value="private-charter">Private Charter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dates Section */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkIn">Check-in Date *</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="checkIn"
                    type="date"
                    value={bookingForm.checkInDate}
                    onChange={(e) => setBookingForm({ ...bookingForm, checkInDate: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border-2 rounded-lg text-sm border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkOut">Check-out Date *</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="checkOut"
                    type="date"
                    value={bookingForm.checkOutDate}
                    onChange={(e) => setBookingForm({ ...bookingForm, checkOutDate: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border-2 rounded-lg text-sm border-pink-200 focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (Days)</Label>
                <input
                  id="duration"
                  type="text"
                  value={
                    bookingForm.checkInDate && bookingForm.checkOutDate
                      ? Math.ceil((new Date(bookingForm.checkOutDate).getTime() - new Date(bookingForm.checkInDate).getTime()) / (1000 * 60 * 60 * 24))
                      : ''
                  }
                  readOnly
                  className="w-full px-3 py-2 border-2 rounded-lg text-sm bg-gray-50 border-gray-200 text-gray-600"
                />
              </div>
            </div>

            {/* Pricing Section */}
            <div className="grid grid-cols-3 gap-4 p-4 rounded-xl border-2 bg-gray-50">
              <div className="space-y-2">
                <Label htmlFor="price">Price (USD)</Label>
                <input
                  id="price"
                  type="number"
                  placeholder="Auto-calculated"
                  value={bookingForm.price}
                  onChange={(e) => setBookingForm({ ...bookingForm, price: e.target.value })}
                  className="w-full px-3 py-2 border-2 rounded-lg text-sm border-gold-200 focus:border-gold-500 focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit">Deposit Amount</Label>
                <input
                  id="deposit"
                  type="number"
                  placeholder="0.00"
                  value={bookingForm.depositAmount}
                  onChange={(e) => setBookingForm({ ...bookingForm, depositAmount: e.target.value })}
                  className="w-full px-3 py-2 border-2 rounded-lg text-sm border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="balance">Remaining Balance</Label>
                <input
                  id="balance"
                  type="text"
                  value={`$${getRemainingBalance().toLocaleString()}`}
                  readOnly
                  className="w-full px-3 py-2 border-2 rounded-lg text-sm bg-gray-100 border-gray-300 text-gray-600 font-semibold"
                />
              </div>
            </div>

            {/* Deposit & Balance Due Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="depositDueDate">Deposit Due Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="depositDueDate"
                    type="date"
                    value={bookingForm.depositDueDate}
                    onChange={(e) => setBookingForm({ ...bookingForm, depositDueDate: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border-2 rounded-lg text-sm border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="balanceDueDate">Balance Due Date</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="balanceDueDate"
                    type="date"
                    value={bookingForm.balanceDueDate}
                    onChange={(e) => setBookingForm({ ...bookingForm, balanceDueDate: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 border-2 rounded-lg text-sm border-gray-200 focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
                  />
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                placeholder="Add any additional notes or special requests..."
                value={bookingForm.notes}
                onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                className="w-full px-3 py-2 border-2 rounded-lg text-sm border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 min-h-[100px] resize-none"
              />
            </div>

            {/* Price Summary Card */}
            {getEstimatedPrice() > 0 && (
              <div
                className="p-6 rounded-xl shadow-lg border-2"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                  color: 'white',
                  borderColor: '#a78bfa',
                }}
              >
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm font-medium opacity-90">Total Price</div>
                    <div className="text-3xl font-bold">${getEstimatedPrice().toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium opacity-90">Deposit</div>
                    <div className="text-2xl font-bold">
                      ${bookingForm.depositAmount ? parseFloat(bookingForm.depositAmount).toLocaleString() : '0'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium opacity-90">Balance Due</div>
                    <div className="text-2xl font-bold">${getRemainingBalance().toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setIsBookingDialogOpen(false)}
              className="border-gray-300 hover:bg-gray-100 flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBooking}
              className="bg-[#bdac7e] from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg flex-1"
            >
              Create Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          {selectedBooking && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-2xl">
                      {selectedBooking.yachtName}
                    </DialogTitle>
                    <DialogDescription>
                      Booking {selectedBooking.bookingCode} • {selectedBooking.customerName}
                    </DialogDescription>
                  </div>
                  <div
                    className="px-4 py-2 rounded-full text-sm font-semibold uppercase"
                    style={{
                      backgroundColor: statusColors[selectedBooking.status]?.light,
                      color: statusColors[selectedBooking.status]?.bg,
                    }}
                  >
                    {selectedBooking.status}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Dates Section */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[#bdac7e] from-purple-50 to-pink-50 border-2 border-purple-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500">
                      <CalendarIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Check-in</div>
                      <div className="font-semibold text-gray-900">
                        {new Date(selectedBooking.startDate).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-500">
                      <CalendarIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Check-out</div>
                      <div className="font-semibold text-gray-900">
                        {new Date(selectedBooking.endDate).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Booking Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border-2 border-gray-200">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">Duration</span>
                    </div>
                    <div className="text-xl font-bold text-gray-900">
                      {getDaysBetweenDates(selectedBooking.startDate, selectedBooking.endDate)} days
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border-2 border-gray-200">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm font-medium">Total Price</span>
                    </div>
                    <div className="text-xl font-bold text-gray-900">
                      ${selectedBooking.totalPrice?.toLocaleString() || '0'}
                    </div>
                  </div>
                </div>

                {/* Payment Information */}
                {(selectedBooking.depositAmount || selectedBooking.depositDueDate || selectedBooking.balanceDueDate) && (
                  <div className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
                    <div className="font-semibold text-gray-900 mb-3">Payment Information</div>
                    <div className="space-y-2">
                      {selectedBooking.depositAmount && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Deposit Amount</span>
                          <span className="font-semibold">${selectedBooking.depositAmount.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedBooking.depositDueDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Deposit Due</span>
                          <span className="font-semibold">{new Date(selectedBooking.depositDueDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {selectedBooking.balanceDueDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Balance Due</span>
                          <span className="font-semibold">{new Date(selectedBooking.balanceDueDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {selectedBooking.price && selectedBooking.depositAmount && (
                        <div className="pt-2 mt-2 border-t border-gray-300">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 font-medium">Remaining Balance</span>
                            <span className="font-bold text-gray-900">
                              ${(selectedBooking.price - selectedBooking.depositAmount).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedBooking.notes && (
                  <div className="p-4 rounded-lg border-2 border-gray-200">
                    <div className="font-semibold text-gray-900 mb-2">Notes</div>
                    <p className="text-sm text-gray-600 leading-relaxed">{selectedBooking.notes}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailDialogOpen(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  className="bg-[#bdac7e] from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg flex-1"
                >
                  Edit Booking
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Active Bookings</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colorPalette.green.bg }}>
              <CalendarIcon className="h-5 w-5" style={{ color: colorPalette.green.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{quickStats.activeBookings}</div>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Available Yachts</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colorPalette.blue.bg }}>
              <Anchor className="h-5 w-5" style={{ color: colorPalette.blue.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{quickStats.availableYachts}</div>
            <p className="text-xs text-muted-foreground">Ready to book</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Today's Activity</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colorPalette.pink.bg }}>
              <Clock className="h-5 w-5" style={{ color: colorPalette.pink.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{todayBookings.length}</div>
            <p className="text-xs text-muted-foreground">Bookings today</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Monthly Revenue</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colorPalette.yellow.bg }}>
              <TrendingUp className="h-5 w-5" style={{ color: colorPalette.yellow.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">${quickStats.monthlyRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Projected</p>
          </CardContent>
        </Card>
      </div>

        {/* Filters */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="yachtFilter" className="text-sm">Yacht:</Label>
              <Select
                value={selectedYachtFilter}
                onValueChange={setSelectedYachtFilter}
              >
                <SelectTrigger className="w-[180px] h-9 border-gray-300">
                  <SelectValue placeholder="All Yachts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Yachts</SelectItem>
                  {yachts.map(yacht => {
                    const colorKey = assignYachtColor(yacht.name)
                    return (
                      <SelectItem key={yacht.id} value={yacht.name}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: colorPalette[colorKey as keyof typeof colorPalette]?.bg }}
                          />
                          <span>{yacht.name}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="tripTypeFilter" className="text-sm">Trip Type:</Label>
              <Select
                value={selectedTripTypeFilter}
                onValueChange={setSelectedTripTypeFilter}
              >
                <SelectTrigger className="w-[180px] h-9 border-gray-300">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="open-trip">Open Trip</SelectItem>
                  <SelectItem value="private-charter">Private Charter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(selectedYachtFilter !== 'all' || selectedTripTypeFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedYachtFilter('all')
                  setSelectedTripTypeFilter('all')
                }}
                className="h-9 px-3 text-gray-500 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar - Main Section */}
        <Card className="lg:col-span-2 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">{monthNames[month]} {year}</CardTitle>
                <CardDescription>Calendar view of all bookings</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => navigateMonth('prev')}
                  className="border-purple-300 hover:bg-purple-50 hover:border-purple-400"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentDate(new Date())}
                  className="border-pink-300 hover:bg-pink-50 hover:border-pink-400"
                >
                  Today
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => navigateMonth('next')}
                  className="border-purple-300 hover:bg-purple-50 hover:border-purple-400"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 relative">
              {/* Day names header */}
              {dayNames.map((day) => (
                <div key={day} className="p-3 text-center text-xs font-semibold text-gray-600 bg-white">
                  {day}
                </div>
              ))}
              
              {/* Calendar days */}
              {calendarDays.map((dateInfo, index) => {
                const isToday = isCurrentMonthToday && 
                  dateInfo.day === todayDate &&
                  dateInfo.isCurrentMonth

                // Find bookings for this day (any booking that covers this day)
                const dayBookings = bookingBars.filter(bar => {
                  if (!dateInfo.isCurrentMonth) return false
                  if (dateInfo.day < bar.startDay || dateInfo.day > bar.endDay) return false
                  return true
                })

                return (
                  <div
                    key={index}
                    onClick={() => handleDateClick(dateInfo.day, dateInfo.isCurrentMonth)}
                    className={`
                      min-h-[120px] p-2 cursor-pointer transition-all duration-200 bg-white relative
                      ${!dateInfo.isCurrentMonth ? 'bg-gray-50 text-gray-300 opacity-50' : 'hover:bg-gray-50'}
                      ${isToday ? 'bg-purple-50/50' : ''}
                    `}
                  >
                    <div className={`
                      text-sm font-semibold mb-2 flex items-center justify-between
                      ${isToday ? 'text-purple-600' : 'text-gray-700'}
                    `}>
                      <span>{dateInfo.day > 0 ? dateInfo.day : ''}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    </div>

                    <div className="space-y-1">
                      {dayBookings.map((bar) => {
                        const eventStyle = getEventStyle(bar.eventColor || 'green')
                        const days = getDaysBetweenDates(bar.startDate, bar.endDate)

                        return (
                          <div
                            key={bar.id}
                            onClick={(e) => handleBookingClick(bar, e)}
                            className="h-8 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer border flex items-center px-2.5 gap-2 overflow-hidden"
                            style={{
                              backgroundColor: eventStyle.backgroundColor,
                              borderColor: eventStyle.backgroundColor,
                            }}
                            title={`${bar.yachtName} (${days} days) - ${bar.status}`}
                          >
                            <div className="flex items-center justify-between w-full min-w-0">
                              <div className="font-semibold text-[10px] truncate flex-1">
                                {bar.yachtName}
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] text-gray-600 flex-shrink-0">
                                <Clock className="h-3 w-3" />
                                <span>{days}d</span>
                              </div>
                              <div
                                className="px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase flex-shrink-0"
                                style={{
                                  backgroundColor: statusColors[bar.status]?.light,
                                  color: statusColors[bar.status]?.bg,
                                }}
                              >
                                {bar.status}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {dateInfo.isCurrentMonth && dateInfo.day > 0 && dayBookings.length === 0 && (
                      <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <Plus className="h-4 w-4 text-purple-400" />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Bars render inside day cells, showing for each day in booking range */}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Today's Bookings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: colorPalette.pink.bg }}>
                  <Clock className="h-4 w-4" style={{ color: colorPalette.pink.text }} />
                </div>
                Today's Schedule
              </CardTitle>
              <CardDescription>
                {today.toDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {todayBookings.length > 0 ? (
                  todayBookings.map((booking) => {
                    const eventStyle = getEventStyle(booking.eventColor || 'green')
                    const days = getDaysBetweenDates(booking.startDate, booking.endDate)
                    return (
                      <div 
                        key={booking.id} 
                        className="p-3 rounded-lg border shadow-sm hover:shadow-md transition-all cursor-pointer"
                        style={{ 
                          backgroundColor: eventStyle.backgroundColor,
                          borderColor: 'rgba(0,0,0,0.08)',
                          color: eventStyle.color
                        }}
                      >
                        <div className="font-semibold text-xs mb-1 truncate">
                          {booking.yachtName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] mb-1.5 opacity-90">
                          <Clock className="h-3 w-3" />
                          <span>{days} {days === 1 ? 'day' : 'days'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div 
                            className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase"
                            style={{
                              backgroundColor: statusColors[booking.status]?.bg,
                              color: statusColors[booking.status]?.text,
                            }}
                          >
                            {booking.status}
                          </div>
                          {booking.bookingCode && (
                            <span className="text-[10px] opacity-75">
                              {booking.bookingCode}
                            </span>
                          )}
                        </div>
                        {booking.totalPrice && (
                          <div className="mt-1.5 text-[10px] font-bold opacity-90">
                            ${booking.totalPrice.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 opacity-50" style={{ backgroundColor: colorPalette.pink.bg }}>
                      <Clock className="h-6 w-6" style={{ color: colorPalette.pink.text }} />
                    </div>
                    <p className="text-muted-foreground text-xs mb-3">No bookings scheduled for today</p>
                    <button
                      onClick={() => {
                        setSelectedDate('')
                        setBookingForm({ yachtId: '', customerId: '', checkInDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`, checkOutDate: '', status: 'pending', tripType: 'open-trip', price: '', depositAmount: '', depositDueDate: '', balanceDueDate: '', notes: '' })
                        setIsBookingDialogOpen(true)
                      }}
                      className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      Book a yacht for today
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Status Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { status: 'confirmed', color: '#0d9488' },
                  { status: 'pending', color: '#d97706' },
                  { status: 'completed', color: '#9ca3af' },
                  { status: 'cancelled', color: '#dc2626' },
                ].map((item) => (
                  <div key={item.status} className="flex items-center gap-2">
                    <div 
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs font-medium capitalize text-gray-700">{item.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  setSelectedDate('')
                  setBookingForm({ yachtId: '', customerId: '', checkInDate: '', checkOutDate: '', status: 'pending', tripType: 'open-trip', price: '', depositAmount: '', depositDueDate: '', balanceDueDate: '', notes: '' })
                  setIsBookingDialogOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Booking
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start border-gray-200 hover:bg-gray-50"
              >
                <Users className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start border-gray-200 hover:bg-gray-50"
              >
                <Anchor className="mr-2 h-4 w-4" />
                Manage Yachts
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
