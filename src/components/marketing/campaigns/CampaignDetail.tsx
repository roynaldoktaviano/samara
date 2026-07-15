'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MousePointerClick } from 'lucide-react'

interface ClickEvent {
  id: string
  url: string
  clickedAt: string
}

interface Recipient {
  id: string
  email: string
  name: string | null
  status: 'PENDING' | 'SENT' | 'FAILED' | 'BOUNCED' | 'SKIPPED_UNSUBSCRIBED'
  errorMessage: string | null
  openedAt: string | null
  openCount: number
  clickedAt: string | null
  clickCount: number
  lastClickUrl: string | null
  clicks: ClickEvent[]
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

interface LinkStat {
  url: string
  clickers: number
}

// Unique clickers per URL (not raw click count — someone clicking the same
// link twice shouldn't outweigh two different people clicking it once).
function computeLinkStats(recipients: Recipient[]): LinkStat[] {
  const byUrl = new Map<string, Set<string>>()
  for (const r of recipients) {
    for (const c of r.clicks) {
      if (!byUrl.has(c.url)) byUrl.set(c.url, new Set())
      byUrl.get(c.url)!.add(r.id)
    }
  }
  return Array.from(byUrl.entries())
    .map(([url, ids]) => ({ url, clickers: ids.size }))
    .sort((a, b) => b.clickers - a.clickers)
}

function LinkPerformance({ stats, totalRecipients }: { stats: LinkStat[]; totalRecipients: number }) {
  if (stats.length === 0) return null
  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <p className="text-xs font-medium text-muted-foreground">Link performance</p>
      {stats.map(s => {
        const pct = totalRecipients > 0 ? Math.round((s.clickers / totalRecipients) * 100) : 0
        return (
          <div key={s.url} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{s.url}</a>
              <span className="text-muted-foreground shrink-0 tabular-nums">{s.clickers} ({pct}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(pct, s.clickers > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        )
      })}
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
  const clicked = recipients.filter(r => r.clickedAt).length
  const failed = recipients.filter(r => r.status === 'FAILED').length
  const bounced = recipients.filter(r => r.status === 'BOUNCED').length
  const unsubscribed = recipients.filter(r => r.status === 'SKIPPED_UNSUBSCRIBED').length
  const linkStats = computeLinkStats(recipients)

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
            <div className="grid grid-cols-6 gap-2">
              <StatTile label="Recipients" value={campaign.totalRecipients} />
              <StatTile label="Opened" value={opened} color="#16a34a" />
              <StatTile label="Clicked" value={clicked} color="#2563eb" />
              <StatTile label="Failed" value={failed} color="#dc2626" />
              <StatTile label="Bounced" value={bounced} color="#ea580c" />
              <StatTile label="Unsubscribed" value={unsubscribed} color="#6b7280" />
            </div>

            <LinkPerformance stats={linkStats} totalRecipients={campaign.totalRecipients} />

            <ScrollArea className="flex-1 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Clicked</TableHead>
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
                      <TableCell className="text-xs text-muted-foreground">
                        {r.clickedAt ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className="flex items-center gap-1 text-blue-600 hover:underline">
                                <MousePointerClick className="h-3 w-3" />
                                {fmt(r.clickedAt)}{r.clickCount > 1 ? ` (${r.clickCount}x)` : ''}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-3" align="start">
                              <p className="text-xs font-medium mb-2">Link yang diklik ({r.clicks.length})</p>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {r.clicks.map(c => (
                                  <div key={c.id} className="text-xs border-b pb-1.5 last:border-0">
                                    <div className="text-muted-foreground">{fmt(c.clickedAt)}</div>
                                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline wrap-break-word block">{c.url}</a>
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : '—'}
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
