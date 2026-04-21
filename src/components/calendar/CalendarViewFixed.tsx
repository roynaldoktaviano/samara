'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Anchor, Clock, Users, Plus, TrendingUp } from 'lucide-react'

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
}

const mockEvents: BookingEvent[] = [
  // January 2025 bookings
  { id: '1', yachtName: 'Sea Breeze', startDate: '2025-01-15', endDate: '2025-01-18', status: 'completed', customerName: 'John Smith', bookingCode: 'BK001', totalPrice: 10500, eventColor: 'green' },
  { id: '2', yachtName: 'Ocean Pearl', startDate: '2025-01-20', endDate: '2025-01-25', status: 'completed', customerName: 'Sarah Johnson', bookingCode: 'BK002', totalPrice: 27500, eventColor: 'blue' },
  { id: '3', yachtName: 'Blue Horizon', startDate: '2025-01-28', endDate: '2025-01-30', status: 'completed', customerName: 'Mike Wilson', bookingCode: 'BK003', totalPrice: 7500, eventColor: 'purple' },
  
  // February 2025 bookings
  { id: '4', yachtName: 'Sea Breeze', startDate: '2025-02-05', endDate: '2025-02-08', status: 'completed', customerName: 'Robert Brown', bookingCode: 'BK004', totalPrice: 10500, eventColor: 'pink' },
  { id: '5', yachtName: 'Ocean Pearl', startDate: '2025-02-10', endDate: '2025-02-14', status: 'confirmed', customerName: 'Emma Davis', bookingCode: 'BK005', totalPrice: 22000, eventColor: 'yellow' },
  { id: '6', yachtName: 'Starlight', startDate: '2025-02-12', endDate: '2025-02-17', status: 'confirmed', customerName: 'Alice Chen', bookingCode: 'BK006', totalPrice: 32500, eventColor: 'teal' },
  { id: '7', yachtName: 'Blue Horizon', startDate: '2025-02-15', endDate: '2025-02-18', status: 'pending', customerName: 'James Wilson', bookingCode: 'BK007', totalPrice: 7500, eventColor: 'green' },
  { id: '8', yachtName: 'Sunset Voyager', startDate: '2025-02-20', endDate: '2025-02-26', status: 'confirmed', customerName: 'Lisa Park', bookingCode: 'BK008', totalPrice: 25200, eventColor: 'blue' },
  { id: '9', yachtName: 'Sea Breeze', startDate: '2025-02-22', endDate: '2025-02-24', status: 'pending', customerName: 'Tom Harris', bookingCode: 'BK009', totalPrice: 10500, eventColor: 'purple' },
  { id: '10', yachtName: 'Ocean Pearl', startDate: '2025-02-27', endDate: '2025-03-03', status: 'confirmed', customerName: 'Karen White', bookingCode: 'BK010', totalPrice: 38500, eventColor: 'pink' },
  
  // March 2025 bookings
  { id: '11', yachtName: 'Starlight', startDate: '2025-03-05', endDate: '2025-03-10', status: 'pending', customerName: 'David Lee', bookingCode: 'BK011', totalPrice: 32500, eventColor: 'teal' },
  { id: '12', yachtName: 'Blue Horizon', startDate: '2025-03-12', endDate: '2025-03-15', status: 'pending', customerName: 'Nina Martinez', bookingCode: 'BK012', totalPrice: 7500, eventColor: 'teal' },
  { id: '13', yachtName: 'Sea Breeze', startDate: '2025-03-18', endDate: '2025-03-23', status: 'pending', customerName: 'Chris Anderson', bookingCode: 'BK013', totalPrice: 17500, eventColor: 'green' },
  
  // April 2025 bookings
  { id: '14', yachtName: 'Ocean Pearl', startDate: '2025-04-01', endDate: '2025-04-07', status: 'pending', customerName: 'Sophie Turner', bookingCode: 'BK014', totalPrice: 38500, eventColor: 'blue' },
  { id: '15', yachtName: 'Sunset Voyager', startDate: '2025-04-10', endDate: '2025-04-14', status: 'pending', customerName: 'Michael Brown', bookingCode: 'BK015', totalPrice: 16800, eventColor: 'purple' },
  { id: '16', yachtName: 'Starlight', startDate: '2025-04-15', endDate: '2025-04-22', status: 'pending', customerName: 'Rachel Green', bookingCode: 'BK016', totalPrice: 45500, eventColor: 'pink' },
  { id: '17', yachtName: 'Blue Horizon', startDate: '2025-04-25', endDate: '2025-04-30', status: 'pending', customerName: 'Alex Johnson', bookingCode: 'BK017', totalPrice: 12500, eventColor: 'yellow' },
]

const mockYachts = [
  { id: '1', name: 'Sea Breeze', dailyRate: 3500, color: 'green' },
  { id: '2', name: 'Ocean Pearl', dailyRate: 5500, color: 'blue' },
  { id: '3', name: 'Blue Horizon', dailyRate: 2500, color: 'purple' },
  { id: '4', name: 'Sunset Voyager', dailyRate: 4200, color: 'pink' },
  { id: '5', name: 'Starlight', dailyRate: 6500, color: 'yellow' },
]

const mockCustomers = [
  { id: '1', name: 'John Smith' },
  { id: '2', name: 'Sarah Johnson' },
  { id: '3', name: 'Mike Wilson' },
  { id: '4', name: 'Emma Davis' },
  { id: '5', name: 'Alice Chen' },
  { id: '6', name: 'Robert Brown' },
  { id: '7', name: 'James Wilson' },
  { id: '8', name: 'Lisa Park' },
  { id: '9', name: 'Tom Harris' },
  { id: '10', name: 'Karen White' },
  { id: '11', name: 'David Lee' },
  { id: '12', name: 'Nina Martinez' },
  { id: '13', name: 'Chris Anderson' },
  { id: '14', name: 'Sophie Turner' },
  { id: '15', name: 'Michael Brown' },
  { id: '16', name: 'Rachel Green' },
  { id: '17', name: 'Alex Johnson' },
]

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

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [bookingForm, setBookingForm] = useState({
    yachtId: '',
    customerId: '',
    checkInDate: '',
    checkOutDate: '',
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

  const handleCreateBooking = () => {
    const yacht = mockYachts.find(y => y.id === bookingForm.yachtId)
    const customer = mockCustomers.find(c => c.id === bookingForm.customerId)
    
    if (!yacht || !customer || !bookingForm.checkInDate || !bookingForm.checkOutDate) {
      alert('Please fill in all required fields')
      return
    }

    // Check for booking conflicts with same yacht
    const newStartDate = new Date(bookingForm.checkInDate)
    const newEndDate = new Date(bookingForm.checkOutDate)
    
    const hasConflict = mockEvents.some(event => {
      if (event.yachtName !== yacht.name) return false
      if (event.status === 'cancelled') return false
      
      const existingStart = new Date(event.startDate)
      const existingEnd = new Date(event.endDate)
      
      return newStartDate <= existingEnd && newEndDate >= existingStart
    })

    if (hasConflict) {
      alert(`"${yacht.name}" is already booked for some of these dates. Please choose different dates or a different yacht.`)
      return
    }

    const days = Math.ceil((newEndDate.getTime() - newStartDate.getTime()) / (1000 * 60 * 60 * 24))
    const totalPrice = days * yacht.dailyRate

    const newBooking: BookingEvent = {
      id: String(mockEvents.length + 1),
      yachtName: yacht.name,
      startDate: bookingForm.checkInDate,
      endDate: bookingForm.checkOutDate,
      status: 'confirmed',
      customerName: customer.name,
      bookingCode: `BK${String(mockEvents.length + 1).padStart(3, '0')}`,
      totalPrice,
      eventColor: yacht.color,
    }

    mockEvents.push(newBooking)
    setIsBookingDialogOpen(false)
    setBookingForm({
      yachtId: '',
      customerId: '',
      checkInDate: '',
      checkOutDate: '',
    })
  }

  const { firstDay, daysInMonth, month, year } = getDaysInMonth(currentDate)
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  // Generate booking bars
  const bookingBars = useMemo(() => {
    const bars: any[] = []

    mockEvents.forEach((event) => {
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
  }, [month, year, firstDay, daysInMonth, mockEvents])

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1))
      return newDate
    })
  }

  // Build calendar grid
  const calendarDays = []
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

  const todayBookings = mockEvents.filter(event => {
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
    totalYachts: 5,
    activeBookings: mockEvents.filter(e => e.status === 'confirmed' || e.status === 'pending').length,
    availableYachts: 2,
    monthlyRevenue: mockEvents
      .filter(e => {
        const eventDate = new Date(e.startDate)
        return eventDate.getMonth() === month && eventDate.getFullYear() === year && e.totalPrice
      })
      .reduce((sum, e) => sum + (e.totalPrice || 0), 0),
  }

  const getEstimatedPrice = () => {
    if (!bookingForm.yachtId || !bookingForm.checkInDate || !bookingForm.checkOutDate) return 0
    const yacht = mockYachts.find(y => y.id === bookingForm.yachtId)
    if (!yacht) return 0
    const startDate = new Date(bookingForm.checkInDate)
    const endDate = new Date(bookingForm.checkOutDate)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, days) * yacht.dailyRate
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-muted-foreground">Manage your yacht bookings and schedule</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => {
              setSelectedDate('')
              setBookingForm({
                yachtId: '',
                customerId: '',
                checkInDate: '',
                checkOutDate: '',
              })
              setIsBookingDialogOpen(true)
            }}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

      {/* Booking Dialog */}
      <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              Create New Booking
            </DialogTitle>
            <DialogDescription>
              {selectedDate ? `Starting date: ${new Date(selectedDate).toLocaleDateString()}` : 'Select dates and yacht'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
                  {mockCustomers.map(customer => (
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
                  {mockYachts.map(yacht => {
                    const colorStyle = colorPalette[yacht.color as keyof typeof colorPalette] || colorPalette.green
                    return (
                      <SelectItem key={yacht.id} value={yacht.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full shadow-sm"
                            style={{ backgroundColor: colorStyle.bg }}
                          />
                          <span className="font-medium">{yacht.name}</span>
                          <span className="text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-2 py-0.5 rounded-full font-bold ml-auto">${yacht.dailyRate}/day</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkIn">Check-in Date *</Label>
                <input
                  id="checkIn"
                  type="date"
                  value={bookingForm.checkInDate}
                  onChange={(e) => setBookingForm({ ...bookingForm, checkInDate: e.target.value })}
                  className="w-full px-3 py-2 border-2 rounded-lg text-sm border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkOut">Check-out Date *</Label>
                <input
                  id="checkOut"
                  type="date"
                  value={bookingForm.checkOutDate}
                  onChange={(e) => setBookingForm({ ...bookingForm, checkOutDate: e.target.value })}
                  className="w-full px-3 py-2 border-2 rounded-lg text-sm border-pink-200 focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
                  min={bookingForm.checkInDate || new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            {getEstimatedPrice() > 0 && (
              <div 
                className="p-4 rounded-xl shadow-lg border-2"
                style={{ 
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                  color: 'white',
                  borderColor: '#a78bfa'
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Estimated Total:</span>
                  <span className="text-3xl font-bold">${getEstimatedPrice().toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsBookingDialogOpen(false)}
              className="border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBooking}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg"
            >
              Create Booking
            </Button>
          </DialogFooter>
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
                        const isStart = dateInfo.day === bar.startDay
                        const isEnd = dateInfo.day === bar.endDay
                        
                        return (
                          <div
                            key={bar.id}
                            className="h-7 rounded-md shadow-sm hover:shadow-md transition-all cursor-pointer border flex items-center px-2"
                            style={{
                              backgroundColor: eventStyle.backgroundColor,
                              color: eventStyle.text,
                              borderColor: 'rgba(0,0,0,0.1)',
                            }}
                            title={`${bar.yachtName} (${days} days) - ${bar.status}`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="font-semibold text-[10px] truncate">
                                {isStart && `${bar.yachtName}`}
                              </div>
                              <div
                                className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold uppercase flex-shrink-0"
                                style={{
                                  backgroundColor: statusColors[bar.status]?.bg,
                                  color: statusColors[bar.status]?.text,
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
                          color: eventStyle.text
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
                        setBookingForm({
                          yachtId: '',
                          customerId: '',
                          checkInDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
                          checkOutDate: '',
                        })
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
                  setBookingForm({
                    yachtId: '',
                    customerId: '',
                    checkInDate: '',
                    checkOutDate: '',
                  })
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
