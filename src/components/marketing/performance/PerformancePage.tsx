'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Mail, Zap, DollarSign, Users2 } from 'lucide-react'
import type { MarketingPerformanceSnapshot } from '@/lib/marketing-performance'

const ACCENT = '#bdac7e'

const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-xl bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color: ACCENT }} /> {label}
      </div>
      <p className="text-2xl font-bold tracking-tight mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

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
      <div>
        <div className="text-[11px] font-bold tracking-wider" style={{ color: ACCENT }}>MEASURE</div>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Marketing Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">From email campaigns and automations to inquiries and attributed booking revenue.</p>
      </div>

      {loading || !snapshot ? (
        <p className="text-sm text-muted-foreground p-6">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard icon={Mail} label="Email open rate" value={fmtPct(snapshot.campaigns.openRate)} sub={`${snapshot.campaigns.totalOpened} of ${snapshot.campaigns.totalSentRecipients} sent emails`} />
            <KpiCard icon={Mail} label="Email click rate" value={fmtPct(snapshot.campaigns.clickRate)} sub={`${snapshot.campaigns.totalClicked} clicked`} />
            <KpiCard icon={Zap} label="Automation emails sent" value={String(snapshot.automations.totalSent)} sub={`${snapshot.automations.active} automation${snapshot.automations.active === 1 ? '' : 's'} active`} />
            <KpiCard icon={DollarSign} label="Confirmed revenue" value={fmtUsd(snapshot.revenue.totalConfirmed)} sub="All-time, attributed to acquisition channel" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="border rounded-xl bg-white p-5">
              <h2 className="font-semibold text-sm mb-1">Revenue by acquisition channel</h2>
              <p className="text-xs text-muted-foreground mb-4">Each guest&apos;s earliest inquiry decides their channel — a first-touch attribution model.</p>
              <BarList rows={snapshot.revenue.byChannel.map(r => ({ channel: r.channel, value: r.revenue }))} valueFmt={fmtUsd} total={snapshot.revenue.totalConfirmed} />
            </div>
            <div className="border rounded-xl bg-white p-5">
              <h2 className="font-semibold text-sm mb-1">Inquiries by source</h2>
              <p className="text-xs text-muted-foreground mb-4">Last {snapshot.inquiries.periodDays} days · {snapshot.inquiries.totalInPeriod} total inquiries</p>
              <BarList rows={snapshot.inquiries.bySource.map(r => ({ channel: r.channel, value: r.count }))} valueFmt={n => String(n)} total={snapshot.inquiries.totalInPeriod} />
            </div>
          </div>

          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="p-4 border-b"><h2 className="font-semibold text-sm">Recent email campaigns</h2></div>
            {snapshot.campaigns.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No campaigns sent yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Sent</th>
                      <th className="p-3 font-medium">Recipients</th>
                      <th className="p-3 font-medium">Opened</th>
                      <th className="p-3 font-medium">Clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.campaigns.recent.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{c.name}</td>
                        <td className="p-3"><Badge className="bg-gray-100 text-gray-700 border-gray-200">{c.status}</Badge></td>
                        <td className="p-3 text-muted-foreground">{fmtDate(c.sentAt)}</td>
                        <td className="p-3 text-muted-foreground">{c.totalRecipients}</td>
                        <td className="p-3 text-muted-foreground">{c.openedCount}</td>
                        <td className="p-3 text-muted-foreground">{c.clickedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="p-4 border-b"><h2 className="font-semibold text-sm">Automations</h2></div>
            {snapshot.automations.list.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No automations set up yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Sent</th>
                      <th className="p-3 font-medium">Pending</th>
                      <th className="p-3 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.automations.list.map(a => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3">
                          <Badge className={a.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}>
                            {a.status === 'ACTIVE' ? 'Active' : 'Paused'}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{a.sentCount}</td>
                        <td className="p-3 text-muted-foreground">{a.pendingCount}</td>
                        <td className="p-3 text-muted-foreground">{a.failedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> {snapshot.audiences.count} saved audience{snapshot.audiences.count === 1 ? '' : 's'} available for targeting.
          </p>
        </>
      )}
    </div>
  )
}
