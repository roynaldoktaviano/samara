'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Send, Zap, Users2, MessageSquare, DollarSign, AlertTriangle, ChevronRight } from 'lucide-react'
import type { MarketingPerformanceSnapshot } from '@/lib/marketing-performance'
import { ACCENT, PageHeader, KpiCard } from '@/components/marketing/shared/MarketingUI'

const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

type NavView = 'marketing-campaigns' | 'marketing-automations' | 'marketing-audiences' | 'marketing-performance'

export default function CommandCenterPage({ onNavigate }: { onNavigate?: (view: NavView) => void }) {
  const [snapshot, setSnapshot] = useState<MarketingPerformanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSnapshot = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/performance?days=30')
      if (res.ok) setSnapshot(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

  const go = (view: NavView) => onNavigate?.(view)

  const draftCampaigns = snapshot?.campaigns.statusCounts['DRAFT'] ?? 0
  const failedCampaigns = snapshot?.campaigns.statusCounts['FAILED'] ?? 0
  const sentCampaigns = snapshot?.campaigns.statusCounts['SENT'] ?? 0
  const attentionItems = snapshot ? [
    draftCampaigns > 0 && { label: `${draftCampaigns} campaign draft${draftCampaigns === 1 ? '' : 's'} not yet sent`, view: 'marketing-campaigns' as NavView },
    failedCampaigns > 0 && { label: `${failedCampaigns} campaign${failedCampaigns === 1 ? '' : 's'} failed to send`, view: 'marketing-campaigns' as NavView },
    snapshot.automations.paused > 0 && { label: `${snapshot.automations.paused} automation${snapshot.automations.paused === 1 ? '' : 's'} paused`, view: 'marketing-automations' as NavView },
    snapshot.automations.totalFailed > 0 && { label: `${snapshot.automations.totalFailed} automation send${snapshot.automations.totalFailed === 1 ? '' : 's'} failed`, view: 'marketing-automations' as NavView },
  ].filter(Boolean) as { label: string; view: NavView }[] : []

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader eyebrow="MARKETING" title="Marketing Command Center" subtitle="A rollup of campaign activity, automations, and attributed booking revenue." />

      {loading || !snapshot ? (
        <p className="text-sm text-muted-foreground p-6">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard icon={Send} label="Campaigns sent" value={String(sentCampaigns)} sub={`${draftCampaigns} draft`} />
            <KpiCard icon={Zap} label="Active automations" value={String(snapshot.automations.active)} sub={`${snapshot.automations.totalSent} emails sent`} />
            <KpiCard icon={Users2} label="Saved audiences" value={String(snapshot.audiences.count)} />
            <KpiCard icon={MessageSquare} label="New inquiries" value={String(snapshot.inquiries.totalInPeriod)} sub="Last 30 days" trend={snapshot.inquiries.trend.map(w => w.count)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <button onClick={() => go('marketing-performance')} className="text-left border rounded-xl bg-white p-5 hover:shadow-md hover:border-[#bdac7e]/50 transition-all lg:col-span-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" style={{ color: ACCENT }} /> Confirmed revenue
              </div>
              <p className="text-2xl font-bold tracking-tight mt-2">{fmtUsd(snapshot.revenue.totalConfirmed)}</p>
              <p className="text-xs text-muted-foreground mt-1">All-time, by acquisition channel</p>
              <div className="flex items-center gap-1 text-xs font-medium mt-3" style={{ color: ACCENT }}>
                View full breakdown <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>

            <div className="border rounded-xl bg-white p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="font-semibold text-sm">Needs attention</h2>
              </div>
              {attentionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
              ) : (
                <div className="space-y-1">
                  {attentionItems.map((item, i) => (
                    <button key={i} onClick={() => go(item.view)} className="w-full flex items-center justify-between text-left text-sm rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                      <span>{item.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <button onClick={() => go('marketing-campaigns')} className="text-left border rounded-xl bg-white p-5 hover:shadow-md hover:border-[#bdac7e]/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Recent campaigns</h2>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {snapshot.campaigns.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns sent yet.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.campaigns.recent.slice(0, 4).map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.name}</span>
                      <Badge className="bg-gray-100 text-gray-700 border-gray-200 shrink-0 ml-2">{c.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </button>

            <button onClick={() => go('marketing-automations')} className="text-left border rounded-xl bg-white p-5 hover:shadow-md hover:border-[#bdac7e]/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Automations</h2>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {snapshot.automations.list.length === 0 ? (
                <p className="text-sm text-muted-foreground">No automations set up yet.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.automations.list.slice(0, 4).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{a.name}</span>
                      <Badge className={a.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200 shrink-0 ml-2' : 'bg-gray-100 text-gray-600 border-gray-200 shrink-0 ml-2'}>
                        {a.status === 'ACTIVE' ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
