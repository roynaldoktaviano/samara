'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Anchor, Clock, Users, Plus, TrendingUp, MapPin } from 'lucide-react'

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
  { id: '11', yachtName: 'Starlight', startDate: '2025-03-05', endDate: '2025-03-10', status: 'pending', customerName: 'David Lee', bookingCode: 'BK011', totalPrice: 32500, eventColor: 'yellow' },
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
  green: { bg: '#10b981', text: 'white', hover: '#059669', light: '#d1fae5' },
  blue: { bg: '#3b82f6', text: 'white', hover: '#2563eb', light: '#dbeafe' },
  purple: { bg: '#8b5cf6', text: 'white', hover: '#7c3aed', light: '#ede9fe' },
  pink: { bg: '#ec4899', text: 'white', hover: '#db2777', light: '#fce7f3' },
  yellow: { bg: '#f59e0b', text: 'white', hover: '#d97706', light: '#fef3c7' },
  teal: { bg: '#14b8a6', text: 'white', hover: '#0d9488', light: '#ccfbf1' },
}

const statusColors = {
  confirmed: { bg: '#10b981', text: 'white', light: '#d1fae5' },
  pending: { bg: '#f59e0b', text: 'white', light: '#fef3c7' },
  completed: { bg: '#6b7280', text: 'white', light: '#e5e7eb' },
  cancelled: { bg: '#ef4444', text: 'white', light: '#fee2e2' },
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

  const { firstDay, daysInMonth, daysInPrevMonth, month, year } = getDaysInMonth(currentDate)
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

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

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todayBookings = mockEvents.filter(event => {
    const start = new Date(event.startDate)
    const end = new Date(event.endDate)
    const current = new Date(todayStr)
    return current >= start && current <= end
  })

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1))
      return newDate
    })
  }

  const calendarDays = []
  
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({ day: daysInPrevMonth - i, isCurrentMonth: false })
  }
  
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ day: i, isCurrentMonth: true })
  }
  
  const remainingDays = 42 - calendarDays.length
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push({ day: i, isCurrentMonth: false })
  }

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
        <Card className="border-2 border-green-400/50 hover:shadow-xl transition-all hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-green-700">Active Bookings</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: colorPalette.green.bg }}>
              <CalendarIcon className="h-5 w-5" style={{ color: colorPalette.green.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{quickStats.activeBookings}</div>
            <p className="text-xs text-green-600 font-medium">Current month</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-400/50 hover:shadow-xl transition-all hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-blue-700">Available Yachts</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: colorPalette.blue.bg }}>
              <Anchor className="h-5 w-5" style={{ color: colorPalette.blue.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{quickStats.availableYachts}</div>
            <p className="text-xs text-blue-600 font-medium">Ready to book</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-pink-400/50 hover:shadow-xl transition-all hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-pink-700">Today's Activity</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: colorPalette.pink.bg }}>
              <Clock className="h-5 w-5" style={{ color: colorPalette.pink.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-700">{todayBookings.length}</div>
            <p className="text-xs text-pink-600 font-medium">Bookings today</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-yellow-400/50 hover:shadow-xl transition-all hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-yellow-700">Monthly Revenue</CardTitle>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: colorPalette.yellow.bg }}>
              <TrendingUp className="h-5 w-5" style={{ color: colorPalette.yellow.text }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">${quickStats.monthlyRevenue.toLocaleString()}</div>
            <p className="text-xs text-yellow-600 font-medium">Projected</p>
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
            <div className="grid grid-cols-7 gap-2">
              {/* Day names header */}
              {dayNames.map((day) => (
                <div key={day} className="p-3 text-center text-sm font-bold text-gray-700">
                  {day}
                </div>
              ))}
              
              {/* Calendar days */}
              {calendarDays.map((dateInfo, index) => {
                const events = getEventsForDay(dateInfo.day, dateInfo.isCurrentMonth)
                const isToday = isCurrentMonthToday && 
                  dateInfo.day === todayDate &&
                  dateInfo.isCurrentMonth

                // Calculate booking bars for this cell
                const bookingBars = events.map((event) => {
                  const eventStyle = getEventStyle(event.eventColor || 'green')
                  const eventDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dateInfo.day).padStart(2, '0')}`
                  const isStart = event.startDate === eventDateStr
                  const isEnd = event.endDate === eventDateStr
                  
                  // Calculate width and position
                  let roundedClass = ''
                  if (isStart && isEnd) {
                    roundedClass = 'rounded-lg'
                  } else if (isStart) {
                    roundedClass = 'rounded-l-lg rounded-r-none'
                  } else if (isEnd) {
                    roundedClass = 'rounded-r-lg rounded-l-none'
                  } else {
                    roundedClass = 'rounded-none'
                  }

                  return {
                    ...event,
                    eventStyle,
                    isStart,
                    isEnd,
                    roundedClass,
                  }
                })

                return (
                  <div
                    key={index}
                    onClick={() => handleDateClick(dateInfo.day, dateInfo.isCurrentMonth)}
                    className={`
                      min-h-[100px] p-1.5 rounded-lg cursor-pointer transition-all duration-200 group relative overflow-hidden
                      ${!dateInfo.isCurrentMonth ? 'bg-gray-50 text-gray-400 opacity-50' : 'bg-white hover:bg-gray-50'}
                      ${isToday ? 'ring-2 ring-purple-400 ring-offset-1' : ''}
                      ${dateInfo.isCurrentMonth ? 'border border-gray-200' : ''}
                    `}
                  >
                    <div className={`
                      text-xs font-bold mb-1.5 flex items-center justify-between
                      ${isToday ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-1 rounded-md' : 'text-gray-700'}
                    `}>
                      <span>{dateInfo.day}</span>
                      {bookingBars.length > 0 && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-purple-500'}`} />
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      {bookingBars.map((bar) => (
                        <div
                          key={bar.id}
                          className={`
                            px-2 py-1.5 shadow-sm transition-all hover:shadow-md cursor-pointer border-l-4 border-r-4
                            ${bar.roundedClass}
                          `}
                          style={{
                            backgroundColor: bar.eventStyle.backgroundColor,
                            color: bar.eventStyle.color,
                            borderLeftColor: bar.isStart || (bar.isStart && bar.isEnd) ? bar.eventStyle.backgroundColor : 'transparent',
                            borderRightColor: bar.isEnd || (bar.isStart && bar.isEnd) ? bar.eventStyle.backgroundColor : 'transparent',
                          }}
                        >
                          <div className="font-semibold text-[10px] truncate">{bar.yachtName}</div>
                          {!bar.isEnd && (
                            <div className="text-[8px] opacity-75">→</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {dateInfo.isCurrentMonth && bookingBars.length === 0 && (
                      <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 top-8 bg-purple-50/50 rounded-lg z-0">
                        <Plus className="h-4 w-4 text-purple-400" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Today's Bookings */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colorPalette.pink.bg }}>
                  <Clock className="h-5 w-5" style={{ color: colorPalette.pink.text }} />
                </div>
                Today's Schedule
              </CardTitle>
              <CardDescription>
                {today.toDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {todayBookings.length > 0 ? (
                  todayBookings.map((booking) => {
                    const eventStyle = getEventStyle(booking.eventColor || 'green')
                    const days = getDaysBetweenDates(booking.startDate, booking.endDate)
                    return (
                      <div 
                        key={booking.id} 
                        className="p-4 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer hover:-translate-y-1 border-2"
                        style={{ 
                          backgroundColor: eventStyle.backgroundColor,
                          borderColor: eventStyle.hover,
                          color: eventStyle.text
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-2 h-2 rounded-full`} 
                                style={{ 
                                  backgroundColor: 'white',
                                  opacity: 0.9
                                }} 
                              />
                              <p className="font-bold text-sm truncate">{booking.yachtName}</p>
                            </div>
                            <p className="text-xs mb-2 opacity-90 truncate">{booking.customerName}</p>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <div 
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                                style={{
                                  backgroundColor: statusColors[booking.status]?.light,
                                  color: statusColors[booking.status]?.bg,
                                }}
                              >
                                {booking.status}
                              </div>
                              {booking.bookingCode && (
                                <span className="text-[10px] opacity-80 bg-white/20 px-2 py-0.5 rounded-full">
                                  {booking.bookingCode}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs opacity-90">
                                <Clock className="h-3 w-3" />
                                <span>{days} {days === 1 ? 'day' : 'days'}</span>
                              </div>
                              {booking.totalPrice && (
                                <p className="text-sm font-bold">
                                  ${booking.totalPrice.toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 opacity-50" style={{ backgroundColor: colorPalette.pink.bg }}>
                      <Clock className="h-8 w-8" style={{ color: colorPalette.pink.text }} />
                    </div>
                    <p className="text-muted-foreground text-sm mb-4">No bookings scheduled for today</p>
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
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-2 rounded-xl font-medium shadow-md hover:shadow-lg transition-all"
                    >
                      Book a yacht for today
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Status Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { status: 'confirmed', color: '#2dd4bf' },
                  { status: 'pending', color: '#ffd89b' },
                  { status: 'completed', color: '#e0e0e0' },
                  { status: 'cancelled', color: '#ffaaa5' },
                ].map((item) => (
                  <div key={item.status} className="flex items-center gap-3">
                    <div 
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm font-medium capitalize">{item.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start border-2 border-green-300 hover:bg-green-50 hover:border-green-400"
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
                className="w-full justify-start border-2 border-blue-300 hover:bg-blue-50 hover:border-blue-400"
              >
                <Users className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start border-2 border-purple-300 hover:bg-purple-50 hover:border-purple-400"
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
