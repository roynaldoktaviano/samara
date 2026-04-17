'use client'

import { useState, useEffect } from 'react'
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
}

const mockEvents: BookingEvent[] = [
  // January 2025 bookings
  { id: '1', yachtName: 'Sea Breeze', startDate: '2025-01-15', endDate: '2025-01-18', status: 'completed', customerName: 'John Smith', bookingCode: 'BK001', totalPrice: 10500 },
  { id: '2', yachtName: 'Ocean Pearl', startDate: '2025-01-20', endDate: '2025-01-25', status: 'completed', customerName: 'Sarah Johnson', bookingCode: 'BK002', totalPrice: 27500 },
  { id: '3', yachtName: 'Blue Horizon', startDate: '2025-01-28', endDate: '2025-01-30', status: 'completed', customerName: 'Mike Wilson', bookingCode: 'BK003', totalPrice: 7500 },
  
  // February 2025 bookings
  { id: '4', yachtName: 'Sea Breeze', startDate: '2025-02-05', endDate: '2025-02-08', status: 'completed', customerName: 'Robert Brown', bookingCode: 'BK004', totalPrice: 10500 },
  { id: '5', yachtName: 'Ocean Pearl', startDate: '2025-02-10', endDate: '2025-02-14', status: 'confirmed', customerName: 'Emma Davis', bookingCode: 'BK005', totalPrice: 22000 },
  { id: '6', yachtName: 'Starlight', startDate: '2025-02-12', endDate: '2025-02-17', status: 'confirmed', customerName: 'Alice Chen', bookingCode: 'BK006', totalPrice: 32500 },
  { id: '7', yachtName: 'Blue Horizon', startDate: '2025-02-15', endDate: '2025-02-18', status: 'pending', customerName: 'James Wilson', bookingCode: 'BK007', totalPrice: 7500 },
  { id: '8', yachtName: 'Sunset Voyager', startDate: '2025-02-20', endDate: '2025-02-26', status: 'confirmed', customerName: 'Lisa Park', bookingCode: 'BK008', totalPrice: 25200 },
  { id: '9', yachtName: 'Sea Breeze', startDate: '2025-02-22', endDate: '2025-02-24', status: 'pending', customerName: 'Tom Harris', bookingCode: 'BK009', totalPrice: 10500 },
  { id: '10', yachtName: 'Ocean Pearl', startDate: '2025-02-27', endDate: '2025-03-03', status: 'confirmed', customerName: 'Karen White', bookingCode: 'BK010', totalPrice: 38500 },
  
  // March 2025 bookings
  { id: '11', yachtName: 'Starlight', startDate: '2025-03-05', endDate: '2025-03-10', status: 'pending', customerName: 'David Lee', bookingCode: 'BK011', totalPrice: 32500 },
  { id: '12', yachtName: 'Blue Horizon', startDate: '2025-03-12', endDate: '2025-03-15', status: 'pending', customerName: 'Nina Martinez', bookingCode: 'BK012', totalPrice: 7500 },
  { id: '13', yachtName: 'Sea Breeze', startDate: '2025-03-18', endDate: '2025-03-23', status: 'pending', customerName: 'Chris Anderson', bookingCode: 'BK013', totalPrice: 17500 },
  
  // April 2025 bookings
  { id: '14', yachtName: 'Ocean Pearl', startDate: '2025-04-01', endDate: '2025-04-07', status: 'pending', customerName: 'Sophie Turner', bookingCode: 'BK014', totalPrice: 38500 },
  { id: '15', yachtName: 'Sunset Voyager', startDate: '2025-04-10', endDate: '2025-04-14', status: 'pending', customerName: 'Michael Brown', bookingCode: 'BK015', totalPrice: 16800 },
  { id: '16', yachtName: 'Starlight', startDate: '2025-04-15', endDate: '2025-04-22', status: 'pending', customerName: 'Rachel Green', bookingCode: 'BK016', totalPrice: 45500 },
  { id: '17', yachtName: 'Blue Horizon', startDate: '2025-04-25', endDate: '2025-04-30', status: 'pending', customerName: 'Alex Johnson', bookingCode: 'BK017', totalPrice: 12500 },
]

const mockYachts = [
  { id: '1', name: 'Sea Breeze', dailyRate: 3500 },
  { id: '2', name: 'Ocean Pearl', dailyRate: 5500 },
  { id: '3', name: 'Blue Horizon', dailyRate: 2500 },
  { id: '4', name: 'Sunset Voyager', dailyRate: 4200 },
  { id: '5', name: 'Starlight', dailyRate: 6500 },
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

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [todayBookings, setTodayBookings] = useState<BookingEvent[]>([])
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

    const startDate = new Date(bookingForm.checkInDate)
    const endDate = new Date(bookingForm.checkOutDate)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
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
    }

    mockEvents.push(newBooking)
    setIsBookingDialogOpen(false)
    setBookingForm({
      yachtId: '',
      customerId: '',
      checkInDate: '',
      checkOutDate: '',
    })
    
    // Update today's bookings if the new booking is for today
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (bookingForm.checkInDate <= todayStr && bookingForm.checkOutDate >= todayStr) {
      setTodayBookings([...todayBookings, newBooking])
    }
  }

  const { firstDay, daysInMonth, daysInPrevMonth, month, year } = getDaysInMonth(currentDate)
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const getEventsForDay = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return []
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return mockEvents.filter(event => {
      const start = new Date(event.startDate)
      const end = new Date(event.endDate)
      const current = new Date(dateStr)
      return current >= start && current <= end
    })
  }

  // Get today's bookings
  useEffect(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const bookingsToday = mockEvents.filter(event => {
      const start = new Date(event.startDate)
      const end = new Date(event.endDate)
      const current = new Date(todayStr)
      return current >= start && current <= end
    })
    setTodayBookings(bookingsToday)
  }, [month, year])

  const getStatusColor = (status: string) => {
    const colors = {
      confirmed: 'bg-primary text-primary-foreground',
      pending: 'bg-yellow-500 text-white',
      completed: 'bg-green-500 text-white',
      cancelled: 'bg-red-500 text-white',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-500'
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1))
      return newDate
    })
  }

  const calendarDays = []
  
  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({ day: daysInPrevMonth - i, isCurrentMonth: false })
  }
  
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ day: i, isCurrentMonth: true })
  }
  
  // Next month days
  const remainingDays = 42 - calendarDays.length
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push({ day: i, isCurrentMonth: false })
  }

  const today = new Date()
  const isCurrentMonthToday = today.getMonth() === month && today.getFullYear() === year
  const todayDate = today.getDate()

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
          <Button onClick={() => {
            setSelectedDate('')
            setBookingForm({
              yachtId: '',
              customerId: '',
              checkInDate: '',
              checkOutDate: '',
            })
            setIsBookingDialogOpen(true)
          }}>
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

      {/* Booking Dialog */}
      <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Booking</DialogTitle>
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
                <SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select a yacht" />
                </SelectTrigger>
                <SelectContent>
                  {mockYachts.map(yacht => (
                    <SelectItem key={yacht.id} value={yacht.id}>
                      {yacht.name} - ${yacht.dailyRate}/day
                    </SelectItem>
                  ))}
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
                  className="w-full px-3 py-2 border rounded-md text-sm"
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
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  min={bookingForm.checkInDate || new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            {getEstimatedPrice() > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Estimated Total:</span>
                  <span className="text-2xl font-bold">${getEstimatedPrice().toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBookingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBooking}>
              Create Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bookings</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quickStats.activeBookings}</div>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Yachts</CardTitle>
            <Anchor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quickStats.availableYachts}</div>
            <p className="text-xs text-muted-foreground">Ready to book</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayBookings.length}</div>
            <p className="text-xs text-muted-foreground">Bookings today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${quickStats.monthlyRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Projected</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar - Main Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{monthNames[month]} {year}</CardTitle>
                <CardDescription>Calendar view of all bookings</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {/* Day names header */}
              {dayNames.map((day) => (
                <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              
              {/* Calendar days */}
              {calendarDays.map((dateInfo, index) => {
                const events = getEventsForDay(dateInfo.day, dateInfo.isCurrentMonth)
                const isToday = isCurrentMonthToday && 
                  dateInfo.day === todayDate &&
                  dateInfo.isCurrentMonth

                return (
                  <div
                    key={index}
                    onClick={() => handleDateClick(dateInfo.day, dateInfo.isCurrentMonth)}
                    className={`
                      min-h-[100px] p-2 border rounded-lg cursor-pointer hover:bg-accent hover:border-primary transition-all
                      ${!dateInfo.isCurrentMonth ? 'bg-muted/30 text-muted-foreground opacity-50' : 'bg-background'}
                      ${isToday ? 'ring-2 ring-primary font-bold' : ''}
                      ${dateInfo.isCurrentMonth ? 'hover:shadow-md' : ''}
                    `}
                  >
                    <div className={`
                      text-sm mb-1 flex items-center justify-between
                      ${isToday ? 'bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center' : ''}
                    `}>
                      {dateInfo.day}
                      {events.length > 0 && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    {events.length > 0 && (
                      <div className="space-y-1">
                        {events.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className={`
                              text-[10px] p-1 rounded truncate flex items-center gap-1 cursor-pointer hover:opacity-80
                              ${getStatusColor(event.status)}
                            `}
                            onClick={(e) => {
                              e.stopPropagation()
                              // Could open booking details here
                            }}
                          >
                            <Anchor className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{event.yachtName}</span>
                          </div>
                        ))}
                        {events.length > 2 && (
                          <div className="text-[10px] text-muted-foreground pl-1">
                            +{events.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                    {dateInfo.isCurrentMonth && events.length === 0 && (
                      <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar with Today's Bookings */}
        <div className="space-y-6">
          {/* Today's Bookings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Today's Schedule
              </CardTitle>
              <CardDescription>
                {today.toDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {todayBookings.length > 0 ? (
                  todayBookings.map((booking) => (
                    <div key={booking.id} className="p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-3 w-3 rounded-full flex-shrink-0 ${
                          booking.status === 'confirmed' ? 'bg-green-500' :
                          booking.status === 'pending' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{booking.yachtName}</p>
                          <p className="text-xs text-muted-foreground truncate">{booking.customerName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(booking.status)}`}>
                              {booking.status}
                            </div>
                            {booking.bookingCode && (
                              <span className="text-[10px] text-muted-foreground">
                                {booking.bookingCode}
                              </span>
                            )}
                          </div>
                          {booking.totalPrice && (
                            <p className="text-xs font-semibold mt-1">
                              ${booking.totalPrice.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No bookings scheduled for today</p>
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
                      className="mt-4 text-primary hover:underline text-sm"
                    >
                      Book a yacht for today
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle>Status Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { status: 'confirmed', color: 'bg-primary', label: 'Confirmed' },
                  { status: 'pending', color: 'bg-yellow-500', label: 'Pending' },
                  { status: 'completed', color: 'bg-green-500', label: 'Completed' },
                  { status: 'cancelled', color: 'bg-red-500', label: 'Cancelled' },
                ].map((item) => (
                  <div key={item.status} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded ${item.color}`} />
                    <span className="text-sm capitalize">{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <Plus className="mr-2 h-4 w-4" />
                New Booking
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Users className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
              <Button variant="outline" className="w-full justify-start">
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
