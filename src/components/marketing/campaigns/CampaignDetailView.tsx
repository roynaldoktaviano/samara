'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ArrowLeft, Eye, MousePointerClick, UserX } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const GREEN = '#16a34a'
const BLUE = '#2563eb'
const TZ = 'Asia/Jakarta'

interface ClickEvent {
  id: string
  url: string
  ipAddress: string | null
  clickedAt: string
}

interface OpenEvent {
  id: string
  ipAddress: string | null
  openedAt: string
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
  unsubscribedAt: string | null
  clicks: ClickEvent[]
  opens: OpenEvent[]
  sentAt: string | null
}

interface CampaignWithRecipients {
  id: string
  name: string
  subject: string
  status: string
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

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: TZ })

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
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Link performance</CardTitle></CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  )
}

function opensByDate(recipients: Recipient[]) {
  const counts = new Map<string, number>()
  for (const r of recipients) {
    for (const o of r.opens) {
      const key = new Date(o.openedAt).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD, sorts naturally
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date: fmtDate(date), count }))
}

function opensByHour(recipients: Recipient[]) {
  const counts = new Array(24).fill(0)
  for (const r of recipients) {
    for (const o of r.opens) {
      const hour = Number(new Date(o.openedAt).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }))
      counts[hour % 24] += 1
    }
  }
  return counts.map((count, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, count }))
}

// Most recent IP seen for a recipient, from either an open or a click event.
function latestIp(r: Recipient): string | null {
  const events = [
    ...r.opens.map(o => ({ at: o.openedAt, ip: o.ipAddress })),
    ...r.clicks.map(c => ({ at: c.clickedAt, ip: c.ipAddress })),
  ].filter(e => e.ip)
  if (events.length === 0) return null
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return events[0].ip
}

export default function CampaignDetailView({ campaignId, onBack }: {
  campaignId: string
  onBack: () => void
}) {
  const [campaign, setCampaign] = useState<CampaignWithRecipients | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}`)
      if (res.ok) setCampaign(await res.json())
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  if (loading || !campaign) {
    return (
      <div className="p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        <p className="text-sm text-muted-foreground py-12 text-center">Loading...</p>
      </div>
    )
  }

  const recipients = campaign.recipients
  const opened = recipients.filter(r => r.openedAt).length
  const clicked = recipients.filter(r => r.clickedAt).length
  const failed = recipients.filter(r => r.status === 'FAILED').length
  const bounced = recipients.filter(r => r.status === 'BOUNCED').length
  const unsubscribed = recipients.filter(r => r.status === 'SKIPPED_UNSUBSCRIBED')
  const linkStats = computeLinkStats(recipients)
  const dateData = opensByDate(recipients)
  const hourData = opensByHour(recipients)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to campaigns</Button>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <Badge variant="outline">{campaign.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{campaign.subject}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatTile label="Recipients" value={campaign.totalRecipients} />
        <StatTile label="Opened" value={opened} color={GREEN} />
        <StatTile label="Clicked" value={clicked} color={BLUE} />
        <StatTile label="Failed" value={failed} color="#dc2626" />
        <StatTile label="Bounced" value={bounced} color="#ea580c" />
        <StatTile label="Unsubscribed" value={unsubscribed.length} color="#6b7280" />
      </div>

      {(dateData.length > 0 || hourData.some(h => h.count > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Opens by date</CardTitle></CardHeader>
            <CardContent>
              {dateData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No opens yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dateData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip />
                    <Bar dataKey="count" name="Opens" fill={GREEN} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Opens by hour of day</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="count" name="Opens" fill={GREEN} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <LinkPerformance stats={linkStats} totalRecipients={campaign.totalRecipients} />

      {unsubscribed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><UserX className="h-4 w-4 text-gray-500" />Unsubscribed ({unsubscribed.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unsubscribed.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium">{r.name ?? r.email}</span>
                  {r.name && <span className="text-muted-foreground ml-1.5">{r.email}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{fmt(r.unsubscribedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recipients ({recipients.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Clicked</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.email}</TableCell>
                  <TableCell><Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.openedAt ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Eye className="h-3 w-3" />
                            {fmt(r.openedAt)}{r.openCount > 1 ? ` (${r.openCount}x)` : ''}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" align="start">
                          <p className="text-xs font-medium mb-2">Dibuka ({r.opens.length}x)</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {r.opens.map(o => (
                              <div key={o.id} className="text-xs border-b pb-1.5 last:border-0">
                                <div className="text-muted-foreground">{fmt(o.openedAt)}{o.ipAddress ? ` · ${o.ipAddress}` : ''}</div>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : '—'}
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
                                <div className="text-muted-foreground">{fmt(c.clickedAt)}{c.ipAddress ? ` · ${c.ipAddress}` : ''}</div>
                                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline wrap-break-word block">{c.url}</a>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{latestIp(r) ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-65 whitespace-normal wrap-break-word">{r.errorMessage ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
