'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Anchor, Plus, Edit, Search, MoreHorizontal, Trash2 } from 'lucide-react'

interface Yacht {
  id: string
  name: string
  model: string
  year: number
  capacity: number
  cabins: number
  length: number
  hourlyRate: number
  dailyRate: number
  status: 'available' | 'booked' | 'maintenance'
}

const mockYachts: Yacht[] = [
  { id: '1', name: 'Samara I', model: 'Custom Phinisi', year: 2017, capacity: 12, cabins: 5, length: 27.0, hourlyRate: 350, dailyRate: 3500, status: 'available' },
  { id: '2', name: 'Samara II', model: 'Custom Phinisi', year: 2018, capacity: 10, cabins: 4, length: 24.0, hourlyRate: 300, dailyRate: 3000, status: 'available' },
  { id: '3', name: 'Mischief', model: 'Luxury Phinisi', year: 2015, capacity: 8, cabins: 3, length: 30.0, hourlyRate: 500, dailyRate: 5500, status: 'booked' },
  { id: '4', name: 'Otium', model: 'Luxury Motor Yacht', year: 2022, capacity: 14, cabins: 5, length: 35.0, hourlyRate: 800, dailyRate: 7000, status: 'available' }
];
export default function Yachts() {
  const [yachts] = useState<Yacht[]>(mockYachts)
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  const filteredYachts = yachts.filter(yacht =>
    yacht.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    yacht.model?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      available: 'default',
      booked: 'secondary',
      maintenance: 'destructive',
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Yachts Management</h3>
          <p className="text-muted-foreground">Manage your yacht fleet</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Yacht
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Yacht</DialogTitle>
              <DialogDescription>Enter the details of the new yacht to add to your fleet.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Yacht Name</Label>
                  <Input id="name" placeholder="e.g., Sea Breeze" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" placeholder="e.g., Azimut 55" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" type="number" placeholder="2023" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input id="capacity" type="number" placeholder="12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cabins">Cabins</Label>
                  <Input id="cabins" type="number" placeholder="3" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="length">Length (m)</Label>
                  <Input id="length" type="number" step="0.1" placeholder="16.7" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                  <Input id="hourlyRate" type="number" placeholder="500" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dailyRate">Daily Rate ($)</Label>
                  <Input id="dailyRate" type="number" placeholder="3500" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Enter yacht description..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setIsAddDialogOpen(false)}>Save Yacht</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Overview</CardTitle>
          <CardDescription>Total yachts: {yachts.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search yachts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Hourly Rate</TableHead>
                  <TableHead>Daily Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredYachts.map((yacht) => (
                  <TableRow key={yacht.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Anchor className="h-4 w-4 text-muted-foreground" />
                        {yacht.name}
                      </div>
                    </TableCell>
                    <TableCell>{yacht.model}</TableCell>
                    <TableCell>{yacht.year}</TableCell>
                    <TableCell>{yacht.capacity} guests</TableCell>
                    <TableCell>${yacht.hourlyRate}</TableCell>
                    <TableCell>${yacht.dailyRate}</TableCell>
                    <TableCell>{getStatusBadge(yacht.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
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
