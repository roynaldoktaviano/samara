'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Calendar, Plus, Edit, Search, Eye } from 'lucide-react'

interface Booking {
  id: string
  bookingCode: string
  yachtName: string
  customerName: string
  startDate: string
  endDate: string
  totalPrice: number
  depositPaid: number
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
}

const mockBookings: Booking[] = [
  { id: '1', bookingCode: 'BK1001', yachtName: 'Sea Breeze', customerName: 'John Smith', startDate: '2025-02-15', endDate: '2025-02-17', totalPrice: 7000, depositPaid: 3500, status: 'confirmed' },
  { id: '2', bookingCode: 'BK1002', yachtName: 'Ocean Pearl', customerName: 'Sarah Johnson', startDate: '2025-02-20', endDate: '2025-02-22', totalPrice: 11000, depositPaid: 5500, status: 'pending' },
  { id: '3', bookingCode: 'BK1003', yachtName: 'Blue Horizon', customerName: 'Mike Wilson', startDate: '2025-02-10', endDate: '2025-02-12', totalPrice: 5000, depositPaid: 5000, status: 'completed' },
  { id: '4', bookingCode: 'BK1004', yachtName: 'Sunset Voyager', customerName: 'Emma Davis', startDate: '2025-02-25', endDate: '2025-02-28', totalPrice: 12600, depositPaid: 6300, status: 'confirmed' },
  { id: '5', bookingCode: 'BK1005', yachtName: 'Starlight', customerName: 'Robert Brown', startDate: '2025-02-05', endDate: '2025-02-06', totalPrice: 6500, depositPaid: 0, status: 'cancelled' },
]

export default function Bookings() {
  const [bookings] = useState<Booking[]>(mockBookings)
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = 
      booking.bookingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.yachtName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      confirmed: 'default',
      pending: 'secondary',
      completed: 'outline',
      cancelled: 'destructive',
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  const getDaysCount = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Bookings Management</h3>
          <p className="text-muted-foreground">Manage all yacht reservations</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Booking
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Booking</DialogTitle>
              <DialogDescription>Create a new yacht reservation for a customer.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">John Smith</SelectItem>
                    <SelectItem value="2">Sarah Johnson</SelectItem>
                    <SelectItem value="3">Mike Wilson</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="yacht">Yacht</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a yacht" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Sea Breeze</SelectItem>
                    <SelectItem value="2">Ocean Pearl</SelectItem>
                    <SelectItem value="3">Blue Horizon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit">Deposit Amount ($)</Label>
                <Input id="deposit" type="number" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" placeholder="Additional notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setIsAddDialogOpen(false)}>Create Booking</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Bookings</CardTitle>
              <CardDescription>Total bookings: {bookings.length}</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bookings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking Code</TableHead>
                  <TableHead>Yacht</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Total Price</TableHead>
                  <TableHead>Deposit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium">{booking.bookingCode}</TableCell>
                    <TableCell>{booking.yachtName}</TableCell>
                    <TableCell>{booking.customerName}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <div>{booking.startDate}</div>
                        <div className="text-muted-foreground">{booking.endDate}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getDaysCount(booking.startDate, booking.endDate)} days</TableCell>
                    <TableCell>${booking.totalPrice.toLocaleString()}</TableCell>
                    <TableCell>${booking.depositPaid.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(booking.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
