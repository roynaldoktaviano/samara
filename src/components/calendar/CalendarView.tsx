'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Anchor, Clock } from 'lucide-react'

interface BookingEvent {
  id: string
  yachtName: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
}

const mockEvents: BookingEvent[] = [
  { id: '1', yachtName: 'Sea Breeze', startDate: '2025-02-15', endDate: '2025-02-17', status: 'confirmed' },
  { id: '2', yachtName: 'Ocean Pearl', startDate: '2025-02-20', endDate: '2025-02-22', status: 'confirmed' },
  { id: '3', yachtName: 'Blue Horizon', startDate: '2025-02-10', endDate: '2025-02-12', status: 'completed' },
  { id: '4', yachtName: 'Sunset Voyager', startDate: '2025-02-25', endDate: '2025-02-28', status: 'pending' },
  { id: '5', yachtName: 'Starlight', startDate: '2025-02-05', endDate: '2025-02-06', status: 'cancelled' },
]

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Booking Calendar</h3>
        <p className="text-muted-foreground">View all yacht reservations in calendar view</p>
      </div>

      <Card>
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
              const isToday = dateInfo.isCurrentMonth && 
                dateInfo.day === new Date().getDate() && 
                month === new Date().getMonth() &&
                year === new Date().getFullYear()

              return (
                <div
                  key={index}
                  className={`
                    min-h-[100px] p-2 border rounded-lg
                    ${!dateInfo.isCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-background'}
                    ${isToday ? 'ring-2 ring-primary' : ''}
                  `}
                >
                  <div className={`
                    text-sm font-medium mb-1
                    ${isToday ? 'bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center' : ''}
                  `}>
                    {dateInfo.day}
                  </div>
                  {events.length > 0 && (
                    <div className="space-y-1">
                      {events.map((event) => (
                        <div
                          key={event.id}
                          className={`
                            text-xs p-1 rounded truncate flex items-center gap-1
                            ${getStatusColor(event.status)}
                          `}
                        >
                          <Anchor className="h-3 w-3" />
                          {event.yachtName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {[
              { status: 'confirmed', color: 'bg-primary' },
              { status: 'pending', color: 'bg-yellow-500' },
              { status: 'completed', color: 'bg-green-500' },
              { status: 'cancelled', color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.status} className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded ${item.color}`} />
                <span className="text-sm capitalize">{item.status}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
