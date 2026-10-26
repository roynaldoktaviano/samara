'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Target, Plus, Loader2, LayoutGrid, List as ListIcon } from 'lucide-react'
import CampaignHubEditor from './CampaignHubEditor'
import CampaignDetailPage from './CampaignDetailPage'
import {
  STAGE_LABELS, STAGE_STYLE, STAGE_ORDER, CHANNEL_LABELS, CHANNEL_ICONS, PILL, brandGradient,
  type Campaign, type CampaignStage,
} from './campaignTypes'
import { formatDate, formatMoney } from '@/lib/format'

// Visual language mirrors proto-3's CampaignsPage exactly (src/app/proto-3/App.jsx) — the
// underline filter tabs, list/grid view toggle, table columns and card layout all use its
// literal hex/spacing values rather than this app's usual gold accent + pill filter tabs,
// per explicit user request to match the mockup pixel-for-pixel.

export default function CampaignHubPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<CampaignStage | 'ALL'>('ALL')
  const [view, setView] = useState<'list' | 'grid'>('list')
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
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[.12em] font-bold text-primary-strong">MARKETING</div>
          <h1 className="text-[22px] font-bold tracking-tight mt-1">Campaigns</h1>
          <p className="text-muted-foreground text-[13px] mt-1">One shared brief, budget and approval trail across every channel a campaign uses.</p>
        </div>
        <button
          onClick={() => setEditorOpen(true)}
          className="h-[35px] px-3.5 rounded-md bg-foreground hover:bg-foreground/90 text-background text-[12px] font-semibold inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      {!loading && campaigns.length === 0 && (
        <div className="border rounded-xl bg-card p-5 flex items-center gap-4">
          <span className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 bg-info/10 text-info"><Target className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-sm">No campaigns yet</h2>
            <p className="text-sm text-muted-foreground">A campaign bundles the channels it needs — Email, Meta Ads, Organic Social, Landing Page and more — under one brief, with a shared content-approval queue and budget.</p>
          </div>
        </div>
      )}

      <div className="h-[54px] bg-card border rounded-lg flex items-center justify-between px-3">
        <div className="flex items-stretch self-stretch overflow-x-auto">
          <FilterTab label="All" count={counts.ALL} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          {STAGE_ORDER.map(s => (
            <FilterTab key={s} label={STAGE_LABELS[s]} count={counts[s]} active={filter === s} onClick={() => setFilter(s)} />
          ))}
        </div>
        <div className="flex border rounded-md overflow-hidden shrink-0">
          <button
            onClick={() => setView('list')}
            className={`h-[29px] w-8 grid place-items-center border-r ${view === 'list' ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground'}`}
          ><ListIcon className="h-3.5 w-3.5" /></button>
          <button
            onClick={() => setView('grid')}
            className={`h-[29px] w-8 grid place-items-center ${view === 'grid' ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground'}`}
          ><LayoutGrid className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No campaigns in this stage.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map(c => <CampaignGridCard key={c.id} campaign={c} onClick={() => setOpenId(c.id)} />)}
        </div>
      ) : (
        <CampaignTable campaigns={filtered} onOpen={setOpenId} />
      )}

      <CampaignHubEditor open={editorOpen} onOpenChange={setEditorOpen} onCreated={id => { fetchCampaigns(); setOpenId(id) }} />
    </div>
  )
}

// proto-3's `.tabs.compact` — underline text tabs with a muted count pill, not this app's
// usual pill-shaped filter buttons.
function FilterTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 text-[11px] relative ${active ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'}`}
    >
      {label} <em className="not-italic bg-muted text-[9px] px-1.5 py-0.5 rounded-lg ml-0.5">{count}</em>
      {active && <span className="absolute left-3.5 right-3.5 bottom-0 h-[2px] bg-foreground" />}
    </button>
  )
}

function readinessOf(c: Campaign) {
  const done = c.channels.filter(ch => ch.status === 'DONE' || ch.status === 'LIVE').length
  return c.channels.length ? Math.round((done / c.channels.length) * 100) : 0
}

function CampaignTable({ campaigns, onOpen }: { campaigns: Campaign[]; onOpen: (id: string) => void }) {
  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="hidden md:grid grid-cols-[2fr_100px_130px_150px_130px_100px] items-center gap-2 h-10 px-4 bg-muted/50 border-b text-[8px] tracking-wide uppercase text-muted-foreground font-bold">
        <span>Campaign</span><span>Status</span><span>Channels</span><span>Timeline</span><span>Progress</span><span>Budget</span>
      </div>
      {campaigns.map(c => {
        const readiness = readinessOf(c)
        const spend = c.channels.reduce((s, ch) => s + (ch.actualSpend ?? 0), 0)
        const period = c.startDate || c.endDate ? `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` : '—'
        return (
          <button
            key={c.id} onClick={() => onOpen(c.id)}
            className="w-full grid grid-cols-1 md:grid-cols-[2fr_100px_130px_150px_130px_100px] items-center gap-2 min-h-[69px] px-4 py-2.5 border-b last:border-0 text-left hover:bg-muted/50 text-[10px] text-foreground/80"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <i className="h-[42px] w-[42px] rounded-md shrink-0" style={{ background: brandGradient(c.brand ?? c.name) }} />
              <span className="min-w-0">
                <strong className="text-[11px] text-foreground block truncate">{c.name}</strong>
                {c.objective && <small className="text-[9px] text-muted-foreground block truncate">{c.objective}</small>}
              </span>
            </span>
            <span><span className={`${PILL} ${STAGE_STYLE[c.stage]}`}>{STAGE_LABELS[c.stage]}</span></span>
            <span className="flex items-center gap-1 flex-wrap">
              {c.channels.slice(0, 4).map(ch => {
                const Icon = CHANNEL_ICONS[ch.type]
                return <i key={ch.id} className="h-[23px] w-[23px] rounded-full border grid place-items-center text-muted-foreground bg-card shrink-0" title={CHANNEL_LABELS[ch.type]}><Icon className="h-3 w-3" /></i>
              })}
            </span>
            <span className="text-muted-foreground">{period}</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-20 rounded-full bg-muted overflow-hidden shrink-0"><i className="h-full block rounded-full bg-success" style={{ width: `${readiness}%` }} /></span>
              <b className="text-[9px]">{readiness}%</b>
            </span>
            <span className="flex flex-col">
              <span>{formatMoney(c.plannedBudget)}</span>
              {spend > 0 && <small className="text-[8px] text-muted-foreground">spent {formatMoney(spend)}</small>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CampaignGridCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const readiness = readinessOf(campaign)
  const spend = campaign.channels.reduce((s, ch) => s + (ch.actualSpend ?? 0), 0)
  const period = campaign.startDate || campaign.endDate
    ? `${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)}`
    : null

  return (
    <button onClick={onClick} className="text-left border rounded-xl bg-card overflow-hidden hover:shadow-md transition-all">
      <div className="h-[110px] relative flex items-end p-3.5" style={{ background: `linear-gradient(180deg,transparent 30%,rgba(8,18,30,.8)), ${brandGradient(campaign.brand ?? campaign.name)}` }}>
        <span className={`${PILL} ${STAGE_STYLE[campaign.stage]} absolute top-3 right-3`}>{STAGE_LABELS[campaign.stage]}</span>
        <div className="text-white min-w-0">
          {campaign.brand && <span className="text-[9px] tracking-[.15em] block opacity-90">{campaign.brand.toUpperCase()}</span>}
          <h3 className="text-[15px] font-semibold mt-1 truncate">{campaign.name}</h3>
        </div>
      </div>
      <div className="p-3.5 space-y-3">
        {campaign.objective && <p className="text-[10px] text-muted-foreground line-clamp-2">{campaign.objective}</p>}
        <div className="flex items-center justify-between border-b pb-3 text-[9px] text-muted-foreground">
          <span>{period ?? 'No dates set'}</span>
          {campaign.ownerName && <span>{campaign.ownerName}</span>}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5"><span className="text-[8px] text-muted-foreground">CAMPAIGN READINESS</span><strong className="text-[9px]">{readiness}%</strong></div>
          <div className="h-1 rounded-full bg-muted overflow-hidden"><i className="h-full block rounded-full bg-success" style={{ width: `${readiness}%` }} /></div>
        </div>
        <div className="grid grid-cols-2 border-t pt-3">
          <div className="flex flex-col"><span className="text-[8px] text-muted-foreground">BUDGET</span><strong className="text-[11px] mt-0.5">{formatMoney(campaign.plannedBudget)}</strong></div>
          <div className="flex flex-col"><span className="text-[8px] text-muted-foreground">SPENT</span><strong className="text-[11px] mt-0.5">{formatMoney(spend || null)}</strong></div>
        </div>
      </div>
    </button>
  )
}
