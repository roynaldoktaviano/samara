'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Recipient {
  id: string
  email: string
  name: string | null
  status: 'PENDING' | 'SENT' | 'FAILED' | 'BOUNCED' | 'SKIPPED_UNSUBSCRIBED'
  errorMessage: string | null
  openedAt: string | null
  openCount: number
  sentAt: string | null
}

interface CampaignWithRecipients {
  id: string
  name: string
  subject: string
  totalRecipients: number
  recipients: Recipient[]
}

const STATUS_STYLE: Record<Recipient['status'], string> = {
  PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
  SENT: 'bg-green-100 text-green-700 border-green-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
  BOUNCED: 'bg-orange-100 text-orange-700 border-orange-200',
  SKIPPED_UNSUBSCRIBED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const STATUS_LABEL: Record<Recipient['status'], string> = {
  PENDING: 'Pending',
  SENT: 'Sent',
  FAILED: 'Failed',
  BOUNCED: 'Bounced',
  SKIPPED_UNSUBSCRIBED: 'Unsubscribed',
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-2xl font-semibold" style={color ? { color } : undefined}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export default function CampaignDetail({ campaignId, open, onOpenChange }: {
  campaignId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [campaign, setCampaign] = useState<CampaignWithRecipients | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchDetail = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}`)
      if (res.ok) setCampaign(await res.json())
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { if (open) fetchDetail() }, [open, fetchDetail])

  const recipients = campaign?.recipients ?? []
  const opened = recipients.filter(r => r.openedAt).length
  const failed = recipients.filter(r => r.status === 'FAILED').length
  const bounced = recipients.filter(r => r.status === 'BOUNCED').length
  const unsubscribed = recipients.filter(r => r.status === 'SKIPPED_UNSUBSCRIBED').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{campaign?.name ?? 'Campaign detail'}</DialogTitle>
          <DialogDescription>{campaign?.subject}</DialogDescription>
        </DialogHeader>

        {loading || !campaign ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2">
              <StatTile label="Recipients" value={campaign.totalRecipients} />
              <StatTile label="Opened" value={opened} color="#16a34a" />
              <StatTile label="Failed" value={failed} color="#dc2626" />
              <StatTile label="Bounced" value={bounced} color="#ea580c" />
              <StatTile label="Unsubscribed" value={unsubscribed} color="#6b7280" />
            </div>

            <ScrollArea className="flex-1 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.name ?? '—'}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell><Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.openedAt ? `${fmt(r.openedAt)}${r.openCount > 1 ? ` (${r.openCount}x)` : ''}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-65 whitespace-normal wrap-break-word">{r.errorMessage ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
