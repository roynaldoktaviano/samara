'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Plus, Edit, Search, Mail, Phone, Ship, ChevronRight, Trash2, X, CreditCard, Calendar, RotateCw } from 'lucide-react'
import GuestEditSheet from '@/components/customers/GuestEditSheet'

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
  isChild?: boolean
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
  isWaitingList?: boolean
  wlStatus?: string
}

interface GuestDetail extends Guest {
  tripHistory: TripEntry[]
}

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const statusColor: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function Guests() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'

  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetGuestId, setSheetGuestId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<GuestDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // single delete
  const [deleteTarget, setDeleteTarget] = useState<Guest | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkErrors, setBulkErrors] = useState<string[]>([])

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

  // clear selection when list changes
  useEffect(() => { setSelectedIds(new Set()) }, [guests])

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
    setSheetGuestId(g.id)
    setSheetOpen(true)
  }

  /* ── checkbox helpers ── */
  const allSelected  = guests.length > 0 && selectedIds.size === guests.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < guests.length

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(guests.map(g => g.id)))
  }

  const toggleOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /* ── single delete ── */
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setDeleteError(d.error ?? 'Failed to delete'); return }
      setDeleteTarget(null)
      fetchGuests()
    } finally {
      setDeleting(false)
    }
  }

  /* ── bulk delete ── */
  const confirmBulkDelete = async () => {
    setBulkDeleting(true)
    setBulkErrors([])
    const errors: string[] = []
    for (const id of selectedIds) {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        const g = guests.find(x => x.id === id)
        errors.push(`${g?.name ?? id}: ${d.error ?? 'Failed'}`)
      }
    }
    setBulkDeleting(false)
    if (errors.length > 0) {
      setBulkErrors(errors)
    } else {
      setBulkDeleteOpen(false)
      setSelectedIds(new Set())
      fetchGuests()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">Guest Management</h3>
            <button onClick={() => fetchGuests()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-muted-foreground">Manage guest profiles and view trip history</p>
        </div>
        <Button onClick={() => { setSheetGuestId(null); setSheetOpen(true) }}>
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

            {/* Bulk action bar */}
            {isAdmin && selectedIds.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                <Button
                  variant="destructive" size="sm"
                  onClick={() => { setBulkErrors([]); setBulkDeleteOpen(true) }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete {selectedIds.size}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              </div>
            )}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        ref={el => { if (el) (el as HTMLButtonElement).dataset.indeterminate = someSelected ? 'true' : 'false' }}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                        className={someSelected ? 'opacity-70' : ''}
                      />
                    </TableHead>
                  )}
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
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      {isAdmin && <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><div className="space-y-1.5"><Skeleton className="h-3 w-36" /><Skeleton className="h-3 w-24" /></div></TableCell>
                      <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-8" /></TableCell>
                      <TableCell><div className="flex justify-end gap-1"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
                    </TableRow>
                  ))
                ) : guests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-muted-foreground">No guests found</TableCell>
                  </TableRow>
                ) : guests.map(g => (
                  <TableRow
                    key={g.id}
                    className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(g.id) ? 'bg-muted/40' : ''}`}
                    onClick={() => openDetail(g)}
                  >
                    {isAdmin && (
                      <TableCell onClick={e => toggleOne(g.id, e)}>
                        <Checkbox
                          checked={selectedIds.has(g.id)}
                          onCheckedChange={() => {}}
                          aria-label={`Select ${g.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm">{g.name}</p>
                            {g.isChild && <span className="text-[9px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Child</span>}
                          </div>
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
                        {isAdmin && (
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={e => { e.stopPropagation(); setDeleteError(''); setDeleteTarget(g) }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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

      {/* ── Add / Edit Guest Sheet ─────────────────────────────────────────── */}
      <GuestEditSheet
        open={sheetOpen}
        guestId={sheetGuestId}
        onClose={() => { setSheetOpen(false); setSheetGuestId(null) }}
        onSaved={() => fetchGuests()}
      />

      {/* ── Detail + Trip History Dialog ─────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            {detailLoading || !detail ? (
              <>
                <DialogTitle className="sr-only">Customer Detail</DialogTitle>
                <div className="space-y-1.5">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </>
            ) : (
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
            )}
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-px w-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            </div>
          ) : (
            <>
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
                  Trip History ({detail.tripHistory.filter(t => !t.isWaitingList).length})
                  {detail.tripHistory.some(t => t.isWaitingList) && (
                    <span className="text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                      +{detail.tripHistory.filter(t => t.isWaitingList).length} waiting list
                    </span>
                  )}
                </p>
                {detail.tripHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trips yet.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.tripHistory.map(t => (
                      <div key={t.id} className={`rounded-lg border p-3 text-sm ${t.isWaitingList ? 'border-amber-200 bg-amber-50/40' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{t.bookingCode}</span>
                              {t.isWaitingList && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-medium">Waiting List</span>
                              )}
                              {!t.isWaitingList && t.isLead && <span className="text-[10px] bg-[#bdac7e]/20 text-[#8a7040] rounded px-1.5 py-0.5 font-medium">Lead</span>}
                              {t.cabin && <span className="text-[10px] text-muted-foreground">{t.cabin}</span>}
                            </div>
                            <p className="font-medium mt-1">{t.tripTitle || t.destination || '—'}</p>
                            {t.yachtName && <p className="text-xs text-muted-foreground">{t.yachtName}</p>}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              {fmtDate(t.startDate)} – {fmtDate(t.endDate)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {t.isWaitingList ? (
                              <Badge variant="outline" className={`text-[10px] ${
                                t.wlStatus === 'waiting'   ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                t.wlStatus === 'promoted'  ? 'bg-green-50 text-green-700 border-green-200' :
                                                             'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                {t.wlStatus === 'waiting' ? 'Menunggu' : t.wlStatus === 'promoted' ? 'Dipromosi' : 'Dibatalkan'}
                              </Badge>
                            ) : (
                              <Badge className={`text-[10px] ${statusColor[t.status] ?? 'bg-gray-100 text-gray-600'}`} variant="outline">
                                {t.status}
                              </Badge>
                            )}
                            {!t.isWaitingList && (
                              <p className="text-xs text-muted-foreground mt-1.5">${t.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            )}
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

      {/* ── Single Delete Confirmation ────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) { setDeleteTarget(null); setDeleteError('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Guest</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={deleting}
              onClick={e => { e.preventDefault(); confirmDelete() }}
            >
              {deleting ? 'Deleting...' : 'Delete Guest'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Delete Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={open => { if (!open) { setBulkDeleteOpen(false); setBulkErrors([]) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Guest{selectedIds.size > 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected guest{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
              Guests that have existing bookings will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkErrors.length > 0 && (
            <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2 space-y-0.5">
              <p className="font-semibold mb-1">Some guests could not be deleted:</p>
              {bulkErrors.map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting} onClick={() => { if (bulkErrors.length > 0) { setBulkDeleteOpen(false); setBulkErrors([]); setSelectedIds(new Set()); fetchGuests() } }}>
              {bulkErrors.length > 0 ? 'Close' : 'Cancel'}
            </AlertDialogCancel>
            {bulkErrors.length === 0 && (
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-white"
                disabled={bulkDeleting}
                onClick={e => { e.preventDefault(); confirmBulkDelete() }}
              >
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
