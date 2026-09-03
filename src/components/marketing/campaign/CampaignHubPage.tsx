'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Target, Plus, Loader2 } from 'lucide-react'
import { PageHeader, ModuleHero } from '@/components/marketing/shared/MarketingUI'
import CampaignHubEditor from './CampaignHubEditor'
import CampaignDetailPage from './CampaignDetailPage'
import { STAGE_LABELS, STAGE_STYLE, STAGE_ORDER, CHANNEL_LABELS, type Campaign, type CampaignStage } from './campaignTypes'

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null

export default function CampaignHubPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<CampaignStage | 'ALL'>('ALL')
  const [editorOpen, setEditorOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/campaign')
      if (res.ok) setCampaigns(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: campaigns.length }
    for (const s of STAGE_ORDER) c[s] = campaigns.filter(x => x.stage === s).length
    return c
  }, [campaigns])

  const filtered = filter === 'ALL' ? campaigns : campaigns.filter(c => c.stage === filter)

  if (openId) {
    return <CampaignDetailPage id={openId} onBack={() => { setOpenId(null); fetchCampaigns() }} />
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader
        eyebrow="MARKETING" title="Campaigns"
        subtitle="One shared brief, budget and approval trail across every channel a campaign uses."
        action={
          <Button onClick={() => setEditorOpen(true)} style={{ backgroundColor: '#bdac7e', color: 'white' }} className="hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" /> New campaign
          </Button>
        }
      />

      {!loading && campaigns.length === 0 && (
        <ModuleHero icon={Target} title="No campaigns yet" description="A campaign bundles the channels it needs — Email, Meta Ads, Organic Social, Landing Page and more — under one brief, with a shared content-approval queue and budget." />
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <FilterTab label="All" count={counts.ALL} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
        {STAGE_ORDER.map(s => (
          <FilterTab key={s} label={STAGE_LABELS[s]} count={counts[s]} active={filter === s} onClick={() => setFilter(s)} />
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No campaigns in this stage.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <CampaignCard key={c.id} campaign={c} onClick={() => setOpenId(c.id)} />
          ))}
        </div>
      )}

      <CampaignHubEditor open={editorOpen} onOpenChange={setEditorOpen} onCreated={id => { fetchCampaigns(); setOpenId(id) }} />
    </div>
  )
}

function FilterTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'bg-white text-muted-foreground border-border hover:bg-muted/50'}`}
    >
      {label} <span className={active ? 'opacity-80' : 'opacity-60'}>{count}</span>
    </button>
  )
}

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const period = campaign.startDate || campaign.endDate
    ? `${fmtDate(campaign.startDate) ?? '—'} – ${fmtDate(campaign.endDate) ?? '—'}`
    : null
  const done = campaign.channels.filter(c => c.status === 'DONE' || c.status === 'LIVE').length
  const readiness = campaign.channels.length ? Math.round((done / campaign.channels.length) * 100) : 0

  return (
    <button onClick={onClick} className="text-left border rounded-xl bg-white overflow-hidden hover:shadow-md hover:border-[#bdac7e]/50 transition-all p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {campaign.brand && <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{campaign.brand}</div>}
          <h3 className="font-semibold text-sm leading-snug truncate">{campaign.name}</h3>
        </div>
        <Badge className={`${STAGE_STYLE[campaign.stage]} shrink-0`}>{STAGE_LABELS[campaign.stage]}</Badge>
      </div>
      {campaign.objective && <p className="text-xs text-muted-foreground line-clamp-2">{campaign.objective}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        {campaign.channels.slice(0, 4).map(ch => (
          <span key={ch.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{CHANNEL_LABELS[ch.type]}</span>
        ))}
        {campaign.channels.length > 4 && <span className="text-[10px] text-muted-foreground">+{campaign.channels.length - 4}</span>}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Readiness</span><strong className="text-foreground">{readiness}%</strong>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${readiness}%`, background: '#bdac7e' }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
        <span>{campaign.ownerName ?? 'Unassigned'}</span>
        {period && <span>{period}</span>}
      </div>
    </button>
  )
}
