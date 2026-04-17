'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Anchor, Clock, Users, Plus, TrendingUp } from 'lucide-react'
import Link from 'next/link'

interface BookingEvent {
  id: string
  yachtName: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
  customerName?: string
}

const mockEvents: BookingEvent[] = [
  { id: '1', yachtName: 'Sea Breeze', startDate: '2025-02-15', endDate: '2025-02-17', status: 'confirmed', customerName: 'John Smith' },
  { id: '2', yachtName: 'Ocean Pearl', startDate: '2025-02-20', endDate: '2025-02-22', status: 'confirmed', customerName: 'Sarah Johnson' },
  { id: '3', yachtName: 'Blue Horizon', startDate: '2025-02-10', endDate: '2025-02-12', status: 'completed', customerName: 'Mike Wilson' },
  { id: '4', yachtName: 'Sunset Voyager', startDate: '2025-02-25', endDate: '2025-02-28', status: 'pending', customerName: 'Emma Davis' },
  { id: '5', yachtName: 'Starlight', startDate: '2025-02-05', endDate: '2025-02-06', status: 'cancelled', customerName: 'Robert Brown' },
  { id: '6', yachtName: 'Sea Breeze', startDate: '2025-02-28', endDate: '2025-03-02', status: 'confirmed', customerName: 'Alice Chen' },
]

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [todayBookings, setTodayBookings] = useState<BookingEvent[]>([])
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()
    
    return { firstDay, daysInMonth, daysInPrevMonth, month, year }
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
    monthlyRevenue: 45000
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-muted-foreground">Manage your yacht bookings and schedule</p>
        </div>
        <div className="flex gap-2">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

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
                    className={`
                      min-h-[100px] p-2 border rounded-lg cursor-pointer hover:bg-accent transition-colors
                      ${!dateInfo.isCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-background'}
                      ${isToday ? 'ring-2 ring-primary font-bold' : ''}
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
                              text-[10px] p-1 rounded truncate flex items-center gap-1
                              ${getStatusColor(event.status)}
                            `}
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
                          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-1 ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No bookings scheduled for today</p>
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
