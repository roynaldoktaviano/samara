'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Send, Plus, Pencil, Trash2, Ban, Eye } from 'lucide-react'
import { toast } from 'sonner'
import CampaignEditor from './CampaignEditor'
import CampaignDetailView from './CampaignDetailView'

const ACCENT = '#bdac7e'

interface Campaign {
  id: string
  name: string
  subject: string
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELED'
  fromEmail: string
  fromName: string | null
  scheduledAt: string | null
  sentAt: string | null
  totalRecipients: number
  sentCount: number
  failedCount: number
  openedCount: number
  clickedCount: number
  createdByName: string | null
  createdAt: string
}

const STATUS_STYLE: Record<Campaign['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SCHEDULED: 'bg-blue-100 text-blue-700 border-blue-200',
  SENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  SENT: 'bg-green-100 text-green-700 border-green-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
  CANCELED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/campaigns')
      if (res.ok) setCampaigns(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const openNew = () => { setEditingId(null); setEditorOpen(true) }
  const openEdit = (c: Campaign) => { setEditingId(c.id); setEditorOpen(true) }
  const openDetail = (c: Campaign) => { setViewingId(c.id) }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/marketing/campaigns/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Campaign deleted'); fetchCampaigns() }
    else toast.error('Failed to delete campaign')
    setDeleteTarget(null)
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    const res = await fetch(`/api/marketing/campaigns/${cancelTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELED' }),
    })
    if (res.ok) { toast.success('Scheduled send canceled'); fetchCampaigns() }
    else toast.error('Failed to cancel')
    setCancelTarget(null)
  }

  if (viewingId) {
    return <CampaignDetailView campaignId={viewingId} onBack={() => setViewingId(null)} />
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5" style={{ color: ACCENT }} />
          <h1 className="text-xl font-semibold">Email Campaigns</h1>
        </div>
        <Button onClick={openNew} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Campaign
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading...</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground p-12 text-center">No campaigns yet. Create one to reach your guests and agents.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Clicked</TableHead>
                  <TableHead>Sent / Scheduled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow
                    key={c.id}
                    className={c.status === 'SENT' || c.status === 'SENDING' ? 'cursor-pointer' : undefined}
                    onClick={() => (c.status === 'SENT' || c.status === 'SENDING') && openDetail(c)}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">{c.subject}</TableCell>
                    <TableCell><Badge className={STATUS_STYLE[c.status]}>{c.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.createdByName ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {c.status === 'SENT' || c.status === 'SENDING'
                        ? `${c.sentCount}/${c.totalRecipients}${c.failedCount ? ` (${c.failedCount} failed)` : ''}`
                        : c.totalRecipients || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.status === 'SENT' || c.status === 'SENDING' ? `${c.openedCount}/${c.sentCount}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.status === 'SENT' || c.status === 'SENDING' ? `${c.clickedCount}/${c.sentCount}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmt(c.sentAt ?? c.scheduledAt)}</TableCell>
                    <TableCell className="text-right space-x-1" onClick={e => e.stopPropagation()}>
                      {(c.status === 'SENT' || c.status === 'SENDING') && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openDetail(c)} title="View detail"><Eye className="h-3.5 w-3.5" /></Button>
                      )}
                      {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      {c.status === 'SCHEDULED' && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600" onClick={() => setCancelTarget(c)} title="Cancel scheduled send"><Ban className="h-3.5 w-3.5" /></Button>
                      )}
                      {c.status !== 'SENDING' && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => setDeleteTarget(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CampaignEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        campaignId={editingId}
        onSaved={fetchCampaigns}
        onSent={id => setViewingId(id)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete &quot;{deleteTarget?.name}&quot; and its send history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled send?</AlertDialogTitle>
            <AlertDialogDescription>&quot;{cancelTarget?.name}&quot; will not be sent and will be marked as canceled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>Cancel Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
