'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Wrench, Plus, Edit, Search, AlertCircle, CheckCircle2, Clock } from 'lucide-react'

interface MaintenanceTask {
  id: string
  title: string
  description: string
  yachtName: string
  scheduledDate: string
  completedAt?: string
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled'
  cost?: number
}

const mockMaintenance: MaintenanceTask[] = [
  { id: '1', title: 'Engine Oil Change', description: 'Regular oil change for the main engine', yachtName: 'Sea Breeze', scheduledDate: '2025-02-15', status: 'scheduled', cost: 450 },
  { id: '2', title: 'Hull Inspection', description: 'Annual hull inspection and cleaning', yachtName: 'Ocean Pearl', scheduledDate: '2025-02-10', completedAt: '2025-02-10', status: 'completed', cost: 1200 },
  { id: '3', title: 'Navigation System Update', description: 'Update GPS and navigation charts', yachtName: 'Blue Horizon', scheduledDate: '2025-02-20', status: 'in-progress', cost: 350 },
  { id: '4', title: 'AC System Repair', description: 'Fix malfunctioning air conditioning in cabin 2', yachtName: 'Sunset Voyager', scheduledDate: '2025-02-25', status: 'scheduled', cost: 800 },
  { id: '5', title: 'Safety Equipment Check', description: 'Monthly safety equipment inspection', yachtName: 'Starlight', scheduledDate: '2025-02-05', completedAt: '2025-02-05', status: 'completed', cost: 200 },
  { id: '6', title: 'Propeller Replacement', description: 'Replace damaged propeller', yachtName: 'Ocean Pearl', scheduledDate: '2025-02-28', status: 'scheduled', cost: 2500 },
]

export default function Maintenance() {
  const [tasks] = useState<MaintenanceTask[]>(mockMaintenance)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.yachtName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      'scheduled': 'default',
      'in-progress': 'secondary',
      'completed': 'outline',
      'cancelled': 'destructive',
    }
    const icons: Record<string, React.ReactNode> = {
      'scheduled': <Clock className="h-3 w-3 mr-1" />,
      'in-progress': <AlertCircle className="h-3 w-3 mr-1" />,
      'completed': <CheckCircle2 className="h-3 w-3 mr-1" />,
      'cancelled': <AlertCircle className="h-3 w-3 mr-1" />,
    }
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'default'} className="flex items-center">
        {icons[status as keyof typeof icons]}
        {status.replace('-', ' ')}
      </Badge>
    )
  }

  const scheduledCount = tasks.filter(t => t.status === 'scheduled').length
  const inProgressCount = tasks.filter(t => t.status === 'in-progress').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const totalCost = tasks.filter(t => t.cost).reduce((sum, t) => sum + (t.cost || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Maintenance Management</h3>
          <p className="text-muted-foreground">Track and manage yacht maintenance tasks</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Schedule Maintenance
            </Button>
          </DialogTrigger>
          <DialogContent className="w-240 max-w-[100vw]">
            <DialogHeader>
              <DialogTitle>Schedule Maintenance</DialogTitle>
              <DialogDescription>Add a new maintenance task to the schedule.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" placeholder="e.g., Engine Oil Change" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yacht">Yacht *</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a yacht" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Sea Breeze</SelectItem>
                    <SelectItem value="2">Ocean Pearl</SelectItem>
                    <SelectItem value="3">Blue Horizon</SelectItem>
                    <SelectItem value="4">Sunset Voyager</SelectItem>
                    <SelectItem value="5">Starlight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Scheduled Date *</Label>
                  <Input id="date" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost">Estimated Cost ($)</Label>
                  <Input id="cost" type="number" placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Describe the maintenance task..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setIsAddDialogOpen(false)}>Schedule Task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scheduledCount}</div>
            <p className="text-xs text-muted-foreground">Pending tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
            <p className="text-xs text-muted-foreground">Active tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
            <p className="text-xs text-muted-foreground">Finished tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Maintenance expenses</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Maintenance Tasks</CardTitle>
              <CardDescription>Total tasks: {tasks.length}</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
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
              placeholder="Search maintenance tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Yacht</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>{task.yachtName}</TableCell>
                    <TableCell>{task.scheduledDate}</TableCell>
                    <TableCell>{getStatusBadge(task.status)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {task.cost ? `$${task.cost.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
