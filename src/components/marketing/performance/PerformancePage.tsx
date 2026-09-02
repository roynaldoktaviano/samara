'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Mail, Zap, DollarSign, Users2 } from 'lucide-react'
import type { MarketingPerformanceSnapshot } from '@/lib/marketing-performance'
import { ACCENT, PageHeader, KpiCard, SectionCard } from '@/components/marketing/shared/MarketingUI'

const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function BarList({ rows, valueFmt, total }: { rows: { channel: string; value: number }[]; valueFmt: (n: number) => string; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No data yet for this period.</p>
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.channel}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium">{r.channel}</span>
            <span className="text-muted-foreground">{valueFmt(r.value)}{total > 0 && ` · ${((r.value / total) * 100).toFixed(0)}%`}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: ACCENT }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PerformancePage() {
  const [snapshot, setSnapshot] = useState<MarketingPerformanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSnapshot = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/performance?days=180')
      if (res.ok) setSnapshot(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader eyebrow="MEASURE" title="Marketing Performance" subtitle="From email campaigns and automations to inquiries and attributed booking revenue." />

      {loading || !snapshot ? (
        <p className="text-sm text-muted-foreground p-6">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard icon={Mail} label="Email open rate" value={fmtPct(snapshot.campaigns.openRate)} sub={`${snapshot.campaigns.totalOpened} of ${snapshot.campaigns.totalSentRecipients} sent emails`} />
            <KpiCard icon={Mail} label="Email click rate" value={fmtPct(snapshot.campaigns.clickRate)} sub={`${snapshot.campaigns.totalClicked} clicked`} />
            <KpiCard icon={Zap} label="Emails sent, last 8 weeks" value={String(snapshot.campaigns.sentTrend.reduce((s, w) => s + w.count, 0))} sub={`${snapshot.automations.active} automation${snapshot.automations.active === 1 ? '' : 's'} active`} trend={snapshot.campaigns.sentTrend.map(w => w.count)} />
            <KpiCard icon={DollarSign} label="Confirmed revenue" value={fmtUsd(snapshot.revenue.totalConfirmed)} sub="All-time, attributed to acquisition channel" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SectionCard title="Revenue by acquisition channel" subtitle="Each guest's earliest inquiry decides their channel — a first-touch attribution model.">
              <BarList rows={snapshot.revenue.byChannel.map(r => ({ channel: r.channel, value: r.revenue }))} valueFmt={fmtUsd} total={snapshot.revenue.totalConfirmed} />
            </SectionCard>
            <SectionCard title="Inquiries by source" subtitle={`Last ${snapshot.inquiries.periodDays} days · ${snapshot.inquiries.totalInPeriod} total inquiries`}>
              <BarList rows={snapshot.inquiries.bySource.map(r => ({ channel: r.channel, value: r.count }))} valueFmt={n => String(n)} total={snapshot.inquiries.totalInPeriod} />
            </SectionCard>
          </div>

          <SectionCard title="Inquiry volume" subtitle="Last 8 weeks">
            <div className="flex items-end gap-4">
              <div className="flex-1"><div className="mt-3"><svg viewBox="0 0 100 56" preserveAspectRatio="none" className="w-full" style={{ height: 56 }}>
                {(() => {
                  const data = snapshot.inquiries.trend.map(w => w.count)
                  const max = Math.max(...data, 1)
                  const barW = 100 / data.length
                  return data.map((v, i) => (
                    <rect key={i} x={i * barW + barW * 0.15} y={56 - (v / max) * 50} width={barW * 0.7} height={(v / max) * 50 || 1} rx="1.5" fill={ACCENT} />
                  ))
                })()}
              </svg></div></div>
            </div>
          </SectionCard>

          <SectionCard title="Recent email campaigns">
            {snapshot.campaigns.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No campaigns sent yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Clicked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.campaigns.recent.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge className="bg-gray-100 text-gray-700 border-gray-200">{c.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(c.sentAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.totalRecipients}</TableCell>
                      <TableCell className="text-muted-foreground">{c.openedCount}</TableCell>
                      <TableCell className="text-muted-foreground">{c.clickedCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          <SectionCard title="Automations">
            {snapshot.automations.list.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No automations set up yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.automations.list.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <Badge className={a.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}>
                          {a.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.sentCount}</TableCell>
                      <TableCell className="text-muted-foreground">{a.pendingCount}</TableCell>
                      <TableCell className="text-muted-foreground">{a.failedCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> {snapshot.audiences.count} saved audience{snapshot.audiences.count === 1 ? '' : 's'} available for targeting.
          </p>
        </>
      )}
    </div>
  )
}
