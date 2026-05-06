'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Users, Plus, Edit, Search, Mail, Phone, Ship, ChevronRight, Loader2, X, CreditCard, Calendar, MapPin } from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Guest {
  id: string
  name: string
  firstName?: string
  lastName?: string
  gender?: string
  email?: string
  phone?: string
  passport?: string
  dateOfBirth?: string
  address?: string
  dietaryRequirements?: string
  allergies?: string
  equipmentSizes?: string
  operationalNotes?: string
  totalBookings: number
  totalSpent: number
  createdAt: string
}

interface TripEntry {
  id: string
  bookingCode: string
  tripType: string
  startDate: string
  endDate: string
  destination: string
  status: string
  totalPrice: number
  yachtName: string
  tripTitle: string
  isLead: boolean
  cabin: string
}

interface GuestDetail extends Guest {
  tripHistory: TripEntry[]
}

const EMPTY: GuestFormState = {
  firstName: '', lastName: '', gender: '', email: '', phone: '',
  passport: '', dateOfBirth: '', address: '',
  dietaryRequirements: '', allergies: '', equipmentSizes: '', operationalNotes: '',
}

interface GuestFormState {
  firstName: string; lastName: string; gender: string
  email: string; phone: string; passport: string
  dateOfBirth: string; address: string
  dietaryRequirements: string; allergies: string
  equipmentSizes: string; operationalNotes: string
}

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const statusColor: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
}

/* ─── Guest Form (shared Add / Edit) ─────────────────────────────────────── */
function GuestForm({ value, onChange }: { value: GuestFormState; onChange: (f: GuestFormState) => void }) {
  const set = (k: keyof GuestFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Guest Information</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input value={value.firstName} onChange={set('firstName')} placeholder="John" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={value.lastName} onChange={set('lastName')} placeholder="Smith" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={value.gender} onValueChange={v => onChange({ ...value, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={value.email} onChange={set('email')} placeholder="john@email.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Passport / ID</Label>
              <Input value={value.passport} onChange={set('passport')} placeholder="A1234567" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input type="tel" value={value.phone} onChange={set('phone')} placeholder="+62 812..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={value.dateOfBirth} onChange={set('dateOfBirth')} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={value.address} onChange={set('address')} placeholder="City, Country" />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Health & Special Requirements</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Dietary Requirements</Label>
            <Textarea rows={2} value={value.dietaryRequirements} onChange={set('dietaryRequirements')} placeholder="e.g. Vegetarian, Halal, Vegan..." />
          </div>
          <div className="space-y-1.5">
            <Label>Allergies</Label>
            <Textarea rows={2} value={value.allergies} onChange={set('allergies')} placeholder="e.g. Shellfish, Peanuts..." />
          </div>
          <div className="space-y-1.5">
            <Label>Equipment Sizes</Label>
            <Input value={value.equipmentSizes} onChange={set('equipmentSizes')} placeholder="e.g. Wetsuit M, Fins L" />
          </div>
          <div className="space-y-1.5">
            <Label>Operational Notes</Label>
            <Textarea rows={2} value={value.operationalNotes} onChange={set('operationalNotes')} placeholder="Crew-facing notes..." />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function Guests() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<GuestFormState>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GuestDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchGuests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      if (res.ok) setGuests(await res.json())
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchGuests() }, [fetchGuests])

  const openDetail = async (g: Guest) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/customers/${g.id}`)
      if (res.ok) setDetail(await res.json())
    } finally {
      setDetailLoading(false)
    }
  }

  const openEdit = (g: Guest, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditId(g.id)
    setForm({
      firstName: g.firstName ?? '', lastName: g.lastName ?? '', gender: g.gender ?? '',
      email: g.email ?? '', phone: g.phone ?? '', passport: g.passport ?? '',
      dateOfBirth: g.dateOfBirth ? g.dateOfBirth.slice(0, 10) : '',
      address: g.address ?? '', dietaryRequirements: g.dietaryRequirements ?? '',
      allergies: g.allergies ?? '', equipmentSizes: g.equipmentSizes ?? '',
      operationalNotes: g.operationalNotes ?? '',
    })
    setEditOpen(true)
  }

  const handleAdd = async () => {
    if (!form.firstName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) { setAddOpen(false); setForm(EMPTY); fetchGuests() }
    } finally { setSaving(false) }
  }

  const handleEdit = async () => {
    if (!editId || !form.firstName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) {
        setEditOpen(false); setEditId(null); setForm(EMPTY); fetchGuests()
        if (detail?.id === editId) { const d = await res.json(); setDetail(prev => prev ? { ...prev, ...d } : prev) }
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Guest Management</h3>
          <p className="text-muted-foreground">Manage guest profiles and view trip history</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setAddOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" /> Add Guest
        </Button>
      </div>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle>All Guests</CardTitle>
          <CardDescription>{guests.length} guest(s) registered</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone, passport..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-sm"
            />
            {search && <button onClick={() => setSearch('')}><X className="h-4 w-4 text-muted-foreground" /></button>}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Passport</TableHead>
                  <TableHead>Date of Birth</TableHead>
                  <TableHead>Trips</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : guests.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No guests found</TableCell></TableRow>
                ) : guests.map(g => (
                  <TableRow key={g.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(g)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{g.name}</p>
                          {g.gender && <p className="text-xs text-muted-foreground">{g.gender}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {g.email && <div className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3 text-muted-foreground" />{g.email}</div>}
                        {g.phone && <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3 text-muted-foreground" />{g.phone}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {g.passport ? <div className="flex items-center gap-1 text-xs"><CreditCard className="h-3 w-3 text-muted-foreground" />{g.passport}</div> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{g.dateOfBirth ? fmtDate(g.dateOfBirth) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Ship className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{g.totalBookings}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={e => openEdit(g, e)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openDetail(g) }}><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Add Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Guest</DialogTitle>
          </DialogHeader>
          <GuestForm value={form} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.firstName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Guest</DialogTitle>
          </DialogHeader>
          <GuestForm value={form} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving || !form.firstName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail + Trip History Dialog ─────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">{detail.name}</DialogTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {detail.gender && <span>{detail.gender} · </span>}
                      {detail.totalBookings} trip(s)
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={e => openEdit(detail, e)}>
                    <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                </div>
              </DialogHeader>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Email', detail.email],
                  ['Phone', detail.phone],
                  ['Passport / ID', detail.passport],
                  ['Date of Birth', detail.dateOfBirth ? fmtDate(detail.dateOfBirth) : ''],
                  ['Address', detail.address],
                  ['Dietary Requirements', detail.dietaryRequirements],
                  ['Allergies', detail.allergies],
                  ['Equipment Sizes', detail.equipmentSizes],
                  ['Operational Notes', detail.operationalNotes],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="font-medium mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Trip History */}
              <div>
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Ship className="h-4 w-4 text-muted-foreground" />
                  Trip History ({detail.tripHistory.length})
                </p>
                {detail.tripHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trips yet.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.tripHistory.map(t => (
                      <div key={t.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{t.bookingCode}</span>
                              {t.isLead && <span className="text-[10px] bg-[#bdac7e]/20 text-[#8a7040] rounded px-1.5 py-0.5 font-medium">Lead</span>}
                              {t.cabin && <span className="text-[10px] text-muted-foreground">{t.cabin}</span>}
                            </div>
                            <p className="font-medium mt-1">{t.tripTitle || t.destination}</p>
                            {t.yachtName && <p className="text-xs text-muted-foreground">{t.yachtName}</p>}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              {fmtDate(t.startDate)} – {fmtDate(t.endDate)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge className={`text-[10px] ${statusColor[t.status] ?? 'bg-gray-100 text-gray-600'}`} variant="outline">
                              {t.status}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1.5">IDR {t.totalPrice.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
