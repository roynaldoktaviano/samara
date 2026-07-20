'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { UserPlus, Plus, Edit, Search, Mail, Phone, ChevronRight, Trash2, X, Globe, RotateCw, Download } from 'lucide-react'
import LeadEditSheet from '@/components/leads/LeadEditSheet'
import FreshsalesImportModal from '@/components/shared/FreshsalesImportModal'

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Lead {
  id: string
  name: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  nationality?: string
  notes?: string
  createdAt: string
  isSubscribed: boolean | null
}

interface Inquiry {
  id: string
  source: string
  checkInDate?: string | null
  checkOutDate?: string | null
  guestCount?: number | null
  tripType?: string | null
  message?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  createdAt: string
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function Leads() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sheetLeadId, setSheetLeadId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<Lead | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null)

  // single delete
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkErrors, setBulkErrors] = useState<string[]>([])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      if (res.ok) setLeads(await res.json())
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // clear selection when list changes
  useEffect(() => { setSelectedIds(new Set()) }, [leads])

  const openDetail = (l: Lead) => {
    setDetail(l)
    setDetailOpen(true)
    setInquiries(null)
    fetch(`/api/leads/${l.id}/inquiries`).then(r => r.ok ? r.json() : []).then(setInquiries).catch(() => setInquiries([]))
  }

  const openEdit = (l: Lead, e: React.MouseEvent) => {
    e.stopPropagation()
    setSheetLeadId(l.id)
    setSheetOpen(true)
  }

  /* ── checkbox helpers ── */
  const allSelected  = leads.length > 0 && selectedIds.size === leads.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < leads.length

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(leads.map(l => l.id)))
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
      const res = await fetch(`/api/leads/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setDeleteError(d.error ?? 'Failed to delete'); return }
      setDeleteTarget(null)
      fetchLeads()
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
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        const l = leads.find(x => x.id === id)
        errors.push(`${l?.name ?? id}: ${d.error ?? 'Failed'}`)
      }
    }
    setBulkDeleting(false)
    if (errors.length > 0) {
      setBulkErrors(errors)
    } else {
      setBulkDeleteOpen(false)
      setSelectedIds(new Set())
      fetchLeads()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">Leads</h3>
            <button onClick={() => fetchLeads()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-muted-foreground">Manage lead profiles</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="mr-2 h-4 w-4" /> Import from Freshsales
          </Button>
          <Button onClick={() => { setSheetLeadId(null); setSheetOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle>All Leads</CardTitle>
          <CardDescription>{leads.length} lead(s) registered</CardDescription>
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
                  <TableHead>Subscribed</TableHead>
                  <TableHead>Nationality</TableHead>
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
                      <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell><div className="flex justify-end gap-1"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
                    </TableRow>
                  ))
                ) : leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="py-12 text-center text-muted-foreground">No leads found</TableCell>
                  </TableRow>
                ) : leads.map(l => (
                  <TableRow
                    key={l.id}
                    className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(l.id) ? 'bg-muted/40' : ''}`}
                    onClick={() => openDetail(l)}
                  >
                    {isAdmin && (
                      <TableCell onClick={e => toggleOne(l.id, e)}>
                        <Checkbox
                          checked={selectedIds.has(l.id)}
                          onCheckedChange={() => {}}
                          aria-label={`Select ${l.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                          <UserPlus className="h-4 w-4" />
                        </div>
                        <p className="font-medium text-sm">{l.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {l.email && <div className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3 text-muted-foreground" />{l.email}</div>}
                        {l.phone && <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3 text-muted-foreground" />{l.phone}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {l.isSubscribed === null ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : l.isSubscribed ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-transparent">Subscribed</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-transparent">Unsubscribed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.nationality ? <div className="flex items-center gap-1 text-xs"><Globe className="h-3 w-3 text-muted-foreground" />{l.nationality}</div> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={e => openEdit(l, e)}><Edit className="h-4 w-4" /></Button>
                        {isAdmin && (
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={e => { e.stopPropagation(); setDeleteError(''); setDeleteTarget(l) }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openDetail(l) }}><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Add / Edit Lead Sheet ─────────────────────────────────────────── */}
      <LeadEditSheet
        open={sheetOpen}
        leadId={sheetLeadId}
        onClose={() => { setSheetOpen(false); setSheetLeadId(null) }}
        onSaved={() => fetchLeads()}
      />

      <FreshsalesImportModal open={importOpen} onOpenChange={setImportOpen} onImported={() => fetchLeads()} />

      {/* ── Detail Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl">{detail?.name}</DialogTitle>
              </div>
              {detail && (
                <Button size="sm" variant="outline" onClick={e => openEdit(detail, e)}>
                  <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              )}
            </div>
          </DialogHeader>
          {detail && (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Email', detail.email],
                  ['Phone', detail.phone],
                  ['Nationality', detail.nationality],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="font-medium mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {detail.notes && (
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
                  <p className="font-medium mt-0.5 whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}
              <div className="text-sm">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Inquiry History</p>
                {inquiries === null ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : inquiries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No form submissions yet</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {inquiries.map(inq => (
                      <div key={inq.id} className="rounded-lg border px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">{inq.source}</span>
                          <span className="text-[11px] text-muted-foreground">{new Date(inq.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {(inq.checkInDate || inq.checkOutDate) && (
                          <p className="text-xs text-muted-foreground">
                            {inq.checkInDate ? new Date(inq.checkInDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            {' → '}
                            {inq.checkOutDate ? new Date(inq.checkOutDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            {inq.guestCount ? ` · ${inq.guestCount} guest${inq.guestCount > 1 ? 's' : ''}` : ''}
                            {inq.tripType ? ` · ${inq.tripType}` : ''}
                          </p>
                        )}
                        {inq.message && <p className="text-xs whitespace-pre-wrap">{inq.message}</p>}
                        {(inq.utmSource || inq.utmMedium || inq.utmCampaign) && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {inq.utmSource   && <Badge variant="outline" className="text-[10px] font-normal">src: {inq.utmSource}</Badge>}
                            {inq.utmMedium   && <Badge variant="outline" className="text-[10px] font-normal">medium: {inq.utmMedium}</Badge>}
                            {inq.utmCampaign && <Badge variant="outline" className="text-[10px] font-normal">campaign: {inq.utmCampaign}</Badge>}
                          </div>
                        )}
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
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
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
              {deleting ? 'Deleting...' : 'Delete Lead'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Delete Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={open => { if (!open) { setBulkDeleteOpen(false); setBulkErrors([]) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Lead{selectedIds.size > 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected lead{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkErrors.length > 0 && (
            <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2 space-y-0.5">
              <p className="font-semibold mb-1">Some leads could not be deleted:</p>
              {bulkErrors.map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting} onClick={() => { if (bulkErrors.length > 0) { setBulkDeleteOpen(false); setBulkErrors([]); setSelectedIds(new Set()); fetchLeads() } }}>
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
