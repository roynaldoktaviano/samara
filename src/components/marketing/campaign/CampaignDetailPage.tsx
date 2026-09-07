'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Loader2, Plus, X, Trash2, Link2, Unlink, Eye, Pencil, ChevronRight, ChevronUp, Calendar, Users, Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import ContentEditor from '@/components/marketing/content/ContentEditor'
import ContentApprovalTab from './ContentApprovalTab'
import ContentDetailSheet from '@/components/marketing/content/ContentDetailSheet'
import { STATUS_LABELS, type ContentItem, type ContentFormat, type ContentStatus } from '@/components/marketing/content/contentTypes'
import {
  STAGE_LABELS, STAGE_STYLE, STAGE_ORDER, CHANNEL_LABELS, CHANNEL_ICONS, CHANNEL_ACCENT, CHANNEL_STATUS_LABELS, CHANNEL_STATUS_STYLE,
  CHANNEL_STATUS_ORDER, PILL, heroBackground, computeCampaignReadiness, type Campaign, type CampaignChannel, type CampaignChannelType, type CampaignStage,
} from './campaignTypes'
import { useMarketingTeam, ownerOptionNames, type MarketingTeamMember } from '@/components/marketing/shared/useMarketingTeam'

// Visual language for this whole detail page mirrors proto-3's CampaignDetail exactly
// (src/app/proto-3/App.jsx) — the campaign-tabs underline accent (#b39a69), badge tones,
// KPI strip, channel cards and asset grid all use its literal hex values rather than this
// app's usual gold (#bdac7e), per explicit user request to match the mockup pixel-for-pixel.
const TAB_ACCENT = '#b39a69'
const TABS = ['Overview', 'Brief', 'Channels', 'Content & Approval', 'Performance'] as const
type Tab = typeof TABS[number]

// Content Studio's format enum already has a counterpart for most channel types (a Meta ad
// creative IS format META_AD, an Organic Social post is one of the three Instagram formats,
// etc.) — so "connecting" a channel to its content is just filtering the campaign's content
// items by format, no new relation needed. AGENT_OUTREACH/OTHER have no matching format
// (their content, if any, would only ever land in the shared 'OTHER' bucket, which isn't
// unique to one channel) so they're left unmapped — no "Content for this channel" section.
const CHANNEL_TO_CONTENT_FORMATS: Partial<Record<CampaignChannelType, ContentFormat[]>> = {
  EMAIL: ['EMAIL_HERO'],
  META_ADS: ['META_AD'],
  GOOGLE_ADS: ['GOOGLE_DISPLAY'],
  WHATSAPP: ['WHATSAPP_BROADCAST'],
  ORGANIC_SOCIAL: ['INSTAGRAM_REEL', 'INSTAGRAM_POST', 'INSTAGRAM_STORY'],
  LANDING_PAGE: ['LANDING_PAGE_ASSET'],
}

// Local override of Content Studio's STATUS_STYLE (contentTypes.ts) with proto-3's exact
// badge hex pairs — kept local rather than changed globally, since Content Studio's own
// pages are out of scope for this reskin (per the user's "Campaign Hub only for now" choice).
const CONTENT_STATUS_HEX: Record<ContentStatus, string> = {
  IDEA: 'bg-[#eef0f2] text-[#626872]',
  IN_PRODUCTION: 'bg-[#eaf1ff] text-[#2864d7]',
  WAITING_APPROVAL: 'bg-[#fff2d8] text-[#996313]',
  APPROVED: 'bg-[#e6f7ee] text-[#087b4c]',
  REVISION: 'bg-[#fdecec] text-[#bd3c3c]',
  PUBLISHED: 'bg-[#f3ebfa] text-[#8553b5]',
}

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMoney = (n: number | null) => n == null ? '—' : n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR']

export default function CampaignDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: session } = useSession()
  const canApprove = APPROVER_ROLES.includes((session?.user as { role?: string })?.role ?? '')
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Overview')
  const [contentEditorOpen, setContentEditorOpen] = useState(false)
  const [newContentFormat, setNewContentFormat] = useState<ContentFormat | undefined>(undefined)
  const [openContentId, setOpenContentId] = useState<string | null>(null)
  const team = useMarketingTeam()

  const openNewContent = (format?: ContentFormat) => { setNewContentFormat(format); setContentEditorOpen(true) }

  const fetchCampaign = useCallback(async () => {
    const res = await fetch(`/api/marketing/campaign/${id}`)
    if (res.ok) setCampaign(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { fetchCampaign() }, [fetchCampaign])

  const updateField = async (patch: Record<string, unknown>) => {
    const res = await fetch(`/api/marketing/campaign/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (res.ok) fetchCampaign()
    else toast.error((await res.json().catch(() => null))?.error ?? 'Failed to save')
  }

  if (loading || !campaign) {
    return <div className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  const contentNeedingAttention = (campaign.contentItems ?? []).filter(c => c.status === 'WAITING_APPROVAL' || c.status === 'REVISION')

  return (
    <div className="space-y-0">
      {/* Hero — same layout as proto-3's .campaign-hero. Backdrop is a decorative stock
          photo (see heroBackground) — this app has no campaign cover-image field, so it's
          chosen deterministically per campaign rather than faked as real campaign content. */}
      <div
        className="relative rounded-t-xl md:mx-6 mt-4 md:mt-6 px-5 sm:px-8 pt-5 pb-6 text-white overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: heroBackground(campaign.brand ?? campaign.name) }}
      >
        <div className="flex items-center justify-between gap-3 mb-8 sm:mb-10 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] min-w-0">
            <button onClick={onBack} className="inline-flex items-center gap-1 text-white/90 hover:text-white shrink-0">
              <ChevronUp className="h-3.5 w-3.5" /> Back to campaigns
            </button>
            <span className="text-white/40">/</span>
            <span className="text-white/95 font-medium truncate">{campaign.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const landingUrl = campaign.channels.find(c => c.type === 'LANDING_PAGE')?.externalUrl
                if (landingUrl) window.open(landingUrl, '_blank', 'noopener')
                else toast.error('No landing page link set yet — add one in the Channels tab.')
              }}
              className="h-[30px] px-3 rounded-md bg-white/15 border border-white/30 hover:bg-white/25 text-white text-[10px] font-semibold inline-flex items-center gap-1.5"
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
            <button
              onClick={() => setTab('Brief')}
              className="h-[30px] px-3 rounded-md bg-white text-[#222] hover:bg-white/90 text-[10px] font-semibold inline-flex items-center gap-1.5"
            >
              <Pencil className="h-3 w-3" /> Edit campaign
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {campaign.brand && <div className="text-[9px] tracking-[.16em] text-[#e8d9ba] font-semibold">{campaign.brand.toUpperCase()}</div>}
            <input
              defaultValue={campaign.name} onBlur={e => e.target.value.trim() && e.target.value !== campaign.name && updateField({ name: e.target.value })}
              className="text-2xl sm:text-[28px] font-bold tracking-tight bg-transparent focus:outline-none focus:border-b focus:border-white/40 w-full mt-1.5 mb-2 placeholder:text-white/50"
            />
            {campaign.objective && <p className="text-[11px] text-white/85 max-w-xl mb-3">{campaign.objective}</p>}
            <div className="flex items-center gap-4 flex-wrap text-[9px] text-white/85">
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {fmtDate(campaign.startDate)} – {fmtDate(campaign.endDate)}</span>
              {campaign.audienceSegments && campaign.audienceSegments.length > 0 && (
                <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> {campaign.audienceSegments.join(' · ')}</span>
              )}
              {campaign.markets && campaign.markets.length > 0 && (
                <span className="inline-flex items-center gap-1.5"><Globe className="h-3 w-3" /> {campaign.markets.join(' · ')}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`${PILL} ${STAGE_STYLE[campaign.stage]} mb-1`}>{STAGE_LABELS[campaign.stage]}</span>
            <select
              value={campaign.ownerName ?? ''} onChange={e => updateField({ ownerName: e.target.value || null })}
              className="bg-transparent border-0 px-1 rounded hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/40 text-white text-[9px] mb-1"
            >
              <option value="" className="text-black">Unassigned</option>
              {ownerOptionNames(team, campaign.ownerName).map(n => <option key={n} value={n} className="text-black">{n}</option>)}
            </select>
            <Select
              value={campaign.stage} onValueChange={v => updateField({ stage: v as CampaignStage })}
              disabled={campaign.stage === 'APPROVAL' && !canApprove}
            >
              <SelectTrigger className="w-44 h-8 bg-white/15 border-white/30 text-white text-[11px] hover:bg-white/20 [&_svg]:text-white/80"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            {campaign.stage === 'APPROVAL' && !canApprove && (
              <span className="text-[9px] text-white/75 max-w-44 text-right">Only a Marketing Director can move this past Approval</span>
            )}
          </div>
        </div>
      </div>

      <div className="md:mx-6 sticky top-0 z-10 bg-white border-b flex items-center gap-5 overflow-x-auto px-1 sm:px-2">
        {TABS.map(t => (
          <button
            key={t} onClick={() => setTab(t)}
            className={`shrink-0 py-3 text-[11px] font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'text-[#222]' : 'border-transparent text-[#6f747c] hover:text-[#222]'}`}
            style={tab === t ? { borderColor: TAB_ACCENT } : { borderColor: 'transparent' }}
          >
            {t}{t === 'Content & Approval' && contentNeedingAttention.length > 0 && <em className={`ml-1.5 not-italic ${PILL} bg-[#fff0d4] text-[#936115]`}>{contentNeedingAttention.length}</em>}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-6 md:pt-5">
        {tab === 'Overview' && <OverviewTab campaign={campaign} onGo={setTab} />}
      {tab === 'Brief' && <BriefTab campaign={campaign} onSave={updateField} onRefresh={fetchCampaign} campaignId={id} />}
      {tab === 'Channels' && (
        <ChannelsTab campaign={campaign} onRefresh={fetchCampaign} team={team} onOpenContent={setOpenContentId} onNewContent={openNewContent} />
      )}
      {tab === 'Content & Approval' && (
        <ContentApprovalTab campaign={campaign} onNew={() => openNewContent()} onRefresh={fetchCampaign} />
      )}
      {tab === 'Performance' && <PerformanceTab campaign={campaign} />}
      </div>

      <ContentEditor
        open={contentEditorOpen} onOpenChange={setContentEditorOpen} campaignId={id} defaultFormat={newContentFormat}
        onCreated={cid => { fetchCampaign(); setOpenContentId(cid) }}
      />
      <ContentDetailSheet id={openContentId} onOpenChange={open => !open && setOpenContentId(null)} onChanged={fetchCampaign} />
    </div>
  )
}

// proto-3's inline "→" navigation links (.text-btn) are blue, distinct from the gold/tab
// accent used elsewhere on this page — kept as its own constant so every such link matches.
const LINK_BLUE = '#2764d9'

// One continuous bordered strip with internal dividers — proto-3's .campaign-kpis, not
// this app's usual gapped grid of separate cards.
function KpiStrip({ items }: { items: { label: string; value: string; sub?: string; subTone?: 'green' | 'blue' }[] }) {
  return (
    <div className={`grid bg-white border rounded-xl`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it, i) => (
        <div key={it.label} className={`p-4 ${i < items.length - 1 ? 'border-r' : ''}`}>
          <span className="text-[8px] tracking-wide text-muted-foreground">{it.label}</span>
          <strong className="text-xl font-bold tracking-tight block mt-1.5 mb-0.5">{it.value}</strong>
          {it.sub && <small className={`text-[8px] ${it.subTone === 'green' ? 'text-[#168458]' : it.subTone === 'blue' ? 'text-[#2563eb]' : 'text-muted-foreground'}`}>{it.sub}</small>}
        </div>
      ))}
    </div>
  )
}

// proto-3's .donut — a conic-gradient ring with the value printed in the middle. `value`
// drives the gradient stop directly, so this is inert decoration around a real number.
function Donut({ value, color = '#16a46a', size = 58 }: { value: number; color?: string; size?: number }) {
  return (
    <div
      className="rounded-full grid place-items-center relative shrink-0"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${value}%, #edf0f3 0)` }}
    >
      <div className="absolute rounded-full bg-white" style={{ inset: size * 0.12 }} />
      <span className="relative text-[10px] font-bold">{value}%</span>
    </div>
  )
}

function OverviewTab({ campaign, onGo }: { campaign: Campaign; onGo: (t: Tab) => void }) {
  const totalSpend = campaign.channels.reduce((s, c) => s + (c.actualSpend ?? 0), 0)
  const attention = (campaign.contentItems ?? []).filter(c => c.status === 'WAITING_APPROVAL' || c.status === 'REVISION')
  const attribution = campaign.attribution ?? { leads: 0, bookings: 0, revenue: 0 }
  const roas = totalSpend > 0 && attribution.revenue > 0 ? `${(attribution.revenue / totalSpend).toFixed(1)}×` : '—'
  const readiness = computeCampaignReadiness(campaign)

  return (
    <div className="space-y-4">
      <KpiStrip items={[
        { label: 'SPEND', value: fmtMoney(totalSpend || null), sub: campaign.plannedBudget ? `${Math.round((totalSpend / campaign.plannedBudget) * 100)}% of budget` : undefined, subTone: 'blue' },
        { label: 'QUALIFIED LEADS', value: String(attribution.leads), sub: campaign.utmSlug ? undefined : 'set a UTM slug in Brief to track', subTone: attribution.leads > 0 ? 'green' : undefined },
        { label: 'BOOKINGS', value: String(attribution.bookings), sub: attribution.bookings > 0 ? 'attributed' : undefined, subTone: 'blue' },
        { label: 'REVENUE', value: fmtMoney(attribution.revenue || null), sub: attribution.revenue > 0 ? 'confirmed payments' : undefined, subTone: 'green' },
        { label: 'ROAS', value: roas, sub: totalSpend > 0 ? 'revenue ÷ spend' : undefined },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4">
        <div className="border rounded-xl bg-white p-5 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Campaign components</h2>
            <button onClick={() => onGo('Channels')} className="text-[10px] font-semibold" style={{ color: LINK_BLUE }}>Manage channels →</button>
          </div>
          {campaign.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels added yet.</p>
          ) : (
            <div className="divide-y">
              {campaign.channels.map(ch => {
                const Icon = CHANNEL_ICONS[ch.type]
                // Real subtitle only — proto-3's "3 ad sets · 11 ads" needs an ad-platform
                // API integration this app doesn't have, so anything beyond Email (which
                // really is tracked end-to-end) stays honest with whatever the staffer
                // actually typed in, rather than a fabricated number.
                const subtitle = ch.type === 'EMAIL' && ch.emailCampaign
                  ? `${ch.emailCampaign.sentCount}/${ch.emailCampaign.totalRecipients} recipients`
                  : ch.externalCampaignName || ch.notes || null
                // "Since" caption under the status badge — real last-edited time, standing
                // in for proto-3's fabricated "Live since 08 Jul" / "Next send 24 Jul".
                const since = ch.type === 'EMAIL' && ch.emailCampaign?.sentAt
                  ? `Sent ${fmtDate(ch.emailCampaign.sentAt)}`
                  : `Updated ${fmtDate(ch.updatedAt)}`
                // Result column — only Email has a real, tracked result; every other
                // channel type has no ad-platform/analytics integration to pull one from.
                const result = ch.type === 'EMAIL' && ch.emailCampaign && ch.emailCampaign.sentCount > 0
                  ? {
                      main: `${Math.round(((ch.emailCampaign.openedCount ?? 0) / ch.emailCampaign.sentCount) * 100)}% open`,
                      sub: `${Math.round(((ch.emailCampaign.clickedCount ?? 0) / ch.emailCampaign.sentCount) * 100)}% click`,
                    }
                  : null
                return (
                  <button
                    key={ch.id} onClick={() => onGo('Channels')}
                    className="w-full flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0 text-left hover:bg-muted/30 -mx-1 px-1 rounded"
                  >
                    <span className="h-9 w-9 rounded-lg grid place-items-center shrink-0" style={{ background: `${CHANNEL_ACCENT[ch.type]}14`, color: CHANNEL_ACCENT[ch.type] }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium truncate">{CHANNEL_LABELS[ch.type]}</div>
                      {subtitle && <div className="text-[9px] text-muted-foreground truncate mt-0.5">{subtitle}</div>}
                    </div>
                    <div className="hidden sm:flex flex-col items-start shrink-0 w-32">
                      <span className={`${PILL} ${CHANNEL_STATUS_STYLE[ch.status]}`}>{CHANNEL_STATUS_LABELS[ch.status]}</span>
                      <span className="text-[8px] text-muted-foreground mt-1 truncate">{since}</span>
                    </div>
                    <div className="hidden md:flex flex-col items-start shrink-0 w-20">
                      <strong className="text-[11px]">{result?.main ?? '—'}</strong>
                      {result?.sub && <span className="text-[8px] text-muted-foreground mt-0.5">{result.sub}</span>}
                    </div>
                    {ch.ownerName && (
                      <span className="hidden sm:flex items-center gap-1.5 shrink-0 w-24">
                        <InitialAvatar name={ch.ownerName} size={20} />
                        <span className="text-[9px] text-muted-foreground truncate">{ch.ownerName}</span>
                      </span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="border rounded-xl bg-white p-5">
            <div className="flex items-center justify-between mb-1">
              <div><h2 className="font-semibold text-sm">Campaign readiness</h2><p className="text-[10px] text-muted-foreground mt-0.5">All launch requirements</p></div>
              <Donut value={readiness.overall} />
            </div>
            <div className="space-y-2 mt-3">
              {[
                ['Strategy & brief', readiness.strategyBrief],
                ['Audience & markets', readiness.audienceMarkets],
                ['Creative production', readiness.creativeProduction],
                ['Approvals', readiness.approvals],
                ['Tracking & attribution', readiness.trackingAttribution],
              ].map(([label, pct]) => (
                <div key={label as string} className="grid grid-cols-[110px_1fr_28px] items-center gap-2">
                  <span className="text-[9px] truncate">{label}</span>
                  <div className="h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-[#21a36a]" style={{ width: `${pct}%` }} /></div>
                  <strong className="text-[8px] text-right">{pct}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded-xl bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Approval needed</h2>
              {attention.length > 0 && <span className={`${PILL} bg-[#fff2d8] text-[#996313]`}>{attention.length}</span>}
            </div>
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
            ) : (
              <div className="space-y-2">
                {attention.slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => onGo('Content & Approval')} className="flex items-center justify-between text-sm w-full text-left hover:opacity-70">
                    <span className="truncate">{c.title}</span>
                    <span className={`${PILL} ${CONTENT_STATUS_HEX[c.status]} shrink-0`}>{STATUS_LABELS[c.status]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TagList({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    if (input.trim()) { onChange([...values, input.trim()]); setInput('') }
  }
  return (
    <div className="space-y-1.5">
      <BriefLabel>{label}</BriefLabel>
      <div className="flex flex-wrap gap-1.5 border rounded-md p-2 min-h-9">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[9px] bg-[#eef2f9] text-[#355a91] rounded px-1.5 py-1">
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={placeholder}
          className="flex-1 min-w-[100px] text-[11px] bg-transparent focus:outline-none"
        />
      </div>
    </div>
  )
}

// proto-3's .brief-grid label formula: tiny, tracked, uppercase, muted.
function BriefLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[8px] tracking-wide text-muted-foreground font-semibold uppercase">{children}</label>
}

function BriefTab({ campaign, onSave, onRefresh, campaignId }: {
  campaign: Campaign; onSave: (p: Record<string, unknown>) => void; onRefresh: () => void; campaignId: string
}) {
  const [comment, setComment] = useState('')

  const postComment = async () => {
    if (!comment.trim()) return
    const text = comment
    setComment('')
    const res = await fetch(`/api/marketing/campaign/${campaignId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    })
    if (res.ok) onRefresh()
    else toast.error('Failed to post comment')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="border rounded-xl bg-white p-5 space-y-4">
          <h2 className="font-semibold text-sm">Campaign brief</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <BriefLabel>Business objective</BriefLabel>
              <Textarea defaultValue={campaign.objective ?? ''} onBlur={e => onSave({ objective: e.target.value })} rows={2} placeholder="What should this campaign achieve, and why now?" />
            </div>
            <div className="space-y-1.5">
              <BriefLabel>Target result</BriefLabel>
              <Input defaultValue={campaign.targetResult ?? ''} onBlur={e => onSave({ targetResult: e.target.value })} placeholder="e.g. 3 confirmed charters" />
            </div>
            <div className="space-y-1.5">
              <BriefLabel>Campaign promise</BriefLabel>
              <Textarea defaultValue={campaign.promise ?? ''} onBlur={e => onSave({ promise: e.target.value })} rows={2} placeholder="The one thing this campaign promises" />
            </div>
            <div className="space-y-1.5">
              <BriefLabel>Offer</BriefLabel>
              <Textarea defaultValue={campaign.offer ?? ''} onBlur={e => onSave({ offer: e.target.value })} rows={2} placeholder="Any incentive attached, if applicable" />
            </div>
          </div>
        </div>

        <div className="border rounded-xl bg-white p-5 space-y-4">
          <h2 className="font-semibold text-sm">Audience, markets & languages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TagList label="AUDIENCE SEGMENTS" values={campaign.audienceSegments ?? []} onChange={v => onSave({ audienceSegments: v })} placeholder="Add audience..." />
            <TagList label="MARKETS" values={campaign.markets ?? []} onChange={v => onSave({ markets: v })} placeholder="Add country or region..." />
            <div className="space-y-1.5">
              <BriefLabel>Master language</BriefLabel>
              <Input defaultValue={campaign.masterLanguage ?? ''} onBlur={e => onSave({ masterLanguage: e.target.value })} placeholder="e.g. English" />
            </div>
            <TagList label="ADDITIONAL LANGUAGES" values={campaign.additionalLanguages ?? []} onChange={v => onSave({ additionalLanguages: v })} placeholder="Add..." />
            <div className="sm:col-span-2">
              <TagList label="EXCLUSIONS" values={campaign.exclusions ?? []} onChange={v => onSave({ exclusions: v })} placeholder="Add exclusion..." />
            </div>
          </div>
        </div>

        <div className="border rounded-xl bg-white p-5 space-y-2">
          <h2 className="font-semibold text-sm">Attribution</h2>
          <p className="text-[10px] text-muted-foreground">
            Add <code className="bg-muted px-1 rounded">?utm_campaign={campaign.utmSlug || '…'}</code> to this campaign's ad and link URLs — inquiries that come in with it get counted as this campaign's leads, bookings and revenue on the Overview tab.
          </p>
          <Input
            defaultValue={campaign.utmSlug ?? ''} onBlur={e => onSave({ utmSlug: e.target.value })}
            placeholder="e.g. raja-ampat-2027" className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="border rounded-xl bg-white p-5 space-y-3 h-fit">
        <h2 className="font-semibold text-sm">Discussion</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {(campaign.comments ?? []).map(c => (
            <div key={c.id} className="flex gap-2">
              <InitialAvatar name={c.authorName} />
              <div className="flex-1 min-w-0">
                <p className="flex items-center justify-between gap-2">
                  <strong className="text-[9px]">{c.authorName}</strong>
                  <span className="text-[7px] text-muted-foreground shrink-0">{new Date(c.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </p>
                <p className="text-[9px] text-[#5f646c] leading-relaxed mt-0.5">{c.text}</p>
              </div>
            </div>
          ))}
          {(campaign.comments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        </div>
        <div className="flex gap-2">
          <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a campaign comment..." onKeyDown={e => e.key === 'Enter' && postComment()} />
          <Button size="sm" onClick={postComment} disabled={!comment.trim()} style={{ backgroundColor: '#22262b' }} className="hover:bg-[#0d0f11]">Send</Button>
        </div>
      </div>
    </div>
  )
}

// proto-3's Avatar — initials on a colored circle, same hashed-hue trick as brandGradient
// so a given name always lands on the same color across the page.
function InitialAvatar({ name, size = 26 }: { name: string | null; size?: number }) {
  const label = (name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  let hash = 0
  for (const ch of (name ?? '?')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      className="rounded-full grid place-items-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hash % 360} 35% 38%)` }}
    >
      {label}
    </span>
  )
}

function ChannelsTab({ campaign, onRefresh, team, onOpenContent, onNewContent }: {
  campaign: Campaign; onRefresh: () => void; team: MarketingTeamMember[]
  onOpenContent: (id: string) => void; onNewContent: (format?: ContentFormat) => void
}) {
  const [addType, setAddType] = useState<CampaignChannelType | ''>('')
  const [deleteTarget, setDeleteTarget] = useState<CampaignChannel | null>(null)
  const availableTypes = (Object.keys(CHANNEL_LABELS) as CampaignChannelType[]).filter(t => !campaign.channels.some(c => c.type === t))

  const addChannel = async () => {
    if (!addType) return
    const res = await fetch(`/api/marketing/campaign/${campaign.id}/channels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: addType }),
    })
    if (res.ok) { onRefresh(); setAddType('') } else toast.error('Failed to add component')
  }

  const updateChannel = async (channelId: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/marketing/campaign/${campaign.id}/channels/${channelId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (res.ok) onRefresh()
    else toast.error((await res.json().catch(() => null))?.error ?? 'Failed to save')
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/marketing/campaign/${campaign.id}/channels/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Component removed'); onRefresh() } else toast.error('Failed to remove')
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-4">
      {availableTypes.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={addType} onValueChange={v => setAddType(v as CampaignChannelType)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Add a component..." /></SelectTrigger>
            <SelectContent>
              {availableTypes.map(t => <SelectItem key={t} value={t}>{CHANNEL_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={addChannel} disabled={!addType}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add</Button>
        </div>
      )}

      {campaign.channels.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No components yet — add one above.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaign.channels.map(ch => {
            const formats = CHANNEL_TO_CONTENT_FORMATS[ch.type]
            const linkedContent = formats ? (campaign.contentItems ?? []).filter(c => formats.includes(c.format)) : undefined
            return (
              <ChannelCard
                key={ch.id} channel={ch} onUpdate={p => updateChannel(ch.id, p)} onDelete={() => setDeleteTarget(ch)} team={team}
                linkedContent={linkedContent} onOpenContent={onOpenContent} onNewContent={() => onNewContent(formats?.[0])}
              />
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this component?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `"${CHANNEL_LABELS[deleteTarget.type]}" will be removed from this campaign.`}
              {deleteTarget?.emailCampaignId && ' The linked email campaign itself is not deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ChannelCard({ channel, onUpdate, onDelete, team, linkedContent, onOpenContent, onNewContent }: {
  channel: CampaignChannel; onUpdate: (p: Record<string, unknown>) => Promise<void>; onDelete: () => void; team: MarketingTeamMember[]
  linkedContent?: ContentItem[]; onOpenContent?: (id: string) => void; onNewContent?: () => void
}) {
  const Icon = CHANNEL_ICONS[channel.type]
  const [linking, setLinking] = useState(false)
  const [unlinkedEmails, setUnlinkedEmails] = useState<{ id: string; name: string; status: string }[]>([])
  const [pickEmailId, setPickEmailId] = useState('')
  const [plannedBudgetStr, setPlannedBudgetStr] = useState(String(channel.plannedBudget ?? ''))
  const [actualSpendStr, setActualSpendStr] = useState(String(channel.actualSpend ?? ''))
  useEffect(() => setPlannedBudgetStr(String(channel.plannedBudget ?? '')), [channel.plannedBudget])
  useEffect(() => setActualSpendStr(String(channel.actualSpend ?? '')), [channel.actualSpend])

  const startLinking = async () => {
    setLinking(true)
    const res = await fetch('/api/marketing/campaign/unlinked-emails')
    if (res.ok) setUnlinkedEmails(await res.json())
  }

  const confirmLink = () => {
    if (!pickEmailId) return
    onUpdate({ emailCampaignId: pickEmailId })
    setLinking(false); setPickEmailId('')
  }

  const accent = CHANNEL_ACCENT[channel.type]
  const progress = channel.status === 'NOT_STARTED' ? 0 : channel.status === 'IN_PROGRESS' ? 45 : channel.status === 'READY' ? 80 : 100

  return (
    <div className="border rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}14`, color: accent }}><Icon className="h-4.5 w-4.5" /></span>
          <h3 className="font-semibold text-[12px] truncate">{CHANNEL_LABELS[channel.type]}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={channel.status} onValueChange={v => onUpdate({ status: v })}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHANNEL_STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{CHANNEL_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] text-muted-foreground">SETUP & PRODUCTION</span>
          <strong className="text-[9px]">{progress}%</strong>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: accent }} />
        </div>
      </div>

      {channel.type === 'EMAIL' && (
        <div className="rounded-lg bg-muted/40 p-2.5 text-xs">
          {channel.emailCampaign ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{channel.emailCampaign.name}</p>
                <p className="text-muted-foreground">{channel.emailCampaign.status} · {channel.emailCampaign.sentCount}/{channel.emailCampaign.totalRecipients} sent</p>
              </div>
              <button onClick={() => onUpdate({ unlinkEmail: true })} className="text-muted-foreground hover:text-foreground shrink-0"><Unlink className="h-3.5 w-3.5" /></button>
            </div>
          ) : linking ? (
            <div className="flex items-center gap-1.5">
              <Select value={pickEmailId} onValueChange={setPickEmailId}>
                <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder={unlinkedEmails.length ? 'Pick an email campaign...' : 'None available'} /></SelectTrigger>
                <SelectContent>
                  {unlinkedEmails.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-7 text-xs" disabled={!pickEmailId} onClick={confirmLink}>Link</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLinking(false)}>Cancel</Button>
            </div>
          ) : (
            <button onClick={startLinking} className="inline-flex items-center gap-1.5 hover:underline" style={{ color: LINK_BLUE }}>
              <Link2 className="h-3.5 w-3.5" /> Link an email campaign (built in Email Campaigns)
            </button>
          )}
        </div>
      )}

      {channel.type === 'LANDING_PAGE' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Landing page link</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="url" defaultValue={channel.externalUrl ?? ''} placeholder="https://..."
              onBlur={e => onUpdate({ externalUrl: e.target.value })} className="h-8 text-sm"
            />
            {channel.externalUrl && (
              <a href={channel.externalUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                <Link2 className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {(channel.type === 'META_ADS' || channel.type === 'GOOGLE_ADS') && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Campaign name in {channel.type === 'META_ADS' ? 'Meta Ads' : 'Google Ads'}</Label>
          <Input
            defaultValue={channel.externalCampaignName ?? ''} placeholder={`e.g. ${channel.type === 'META_ADS' ? 'Otium — Raja Ampat Conversions' : 'Otium — Search Brand + Generic'}`}
            onBlur={e => onUpdate({ externalCampaignName: e.target.value })} className="h-8 text-sm"
          />
        </div>
      )}

      {linkedContent !== undefined && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Content for this channel ({linkedContent.length})</Label>
            <button onClick={onNewContent} className="text-[10px] font-semibold inline-flex items-center gap-1" style={{ color: LINK_BLUE }}>
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {linkedContent.length === 0 ? (
            <p className="text-xs text-muted-foreground border rounded-md px-2.5 py-2">No content yet for this channel.</p>
          ) : (
            <div className="border rounded-md divide-y overflow-hidden">
              {linkedContent.slice(0, 4).map(item => (
                <button key={item.id} onClick={() => onOpenContent?.(item.id)} className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50">
                  <span className="text-xs truncate">{item.title}</span>
                  <span className={`${PILL} ${CONTENT_STATUS_HEX[item.status]} shrink-0`}>{STATUS_LABELS[item.status]}</span>
                </button>
              ))}
              {linkedContent.length > 4 && (
                <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">+{linkedContent.length - 4} more</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Owner</Label>
        <select
          value={channel.ownerName ?? ''} onChange={e => onUpdate({ ownerName: e.target.value || null })}
          className="h-8 w-full text-sm border rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
        >
          <option value="">Unassigned</option>
          {ownerOptionNames(team, channel.ownerName).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Planned budget</Label>
          <RupiahInput
            value={plannedBudgetStr} onChange={setPlannedBudgetStr}
            onBlur={() => onUpdate({ plannedBudget: plannedBudgetStr ? Number(plannedBudgetStr) : null })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Actual spend</Label>
          <RupiahInput
            value={actualSpendStr} onChange={setActualSpendStr}
            onBlur={() => onUpdate({ actualSpend: actualSpendStr ? Number(actualSpendStr) : null })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Textarea defaultValue={channel.notes ?? ''} onBlur={e => onUpdate({ notes: e.target.value })} rows={2} className="text-sm" placeholder="Setup notes, next action..." />
      </div>
    </div>
  )
}


function PerformanceTab({ campaign }: { campaign: Campaign }) {
  const totalPlanned = campaign.channels.reduce((s, c) => s + (c.plannedBudget ?? 0), 0) || campaign.plannedBudget || 0
  const totalSpend = campaign.channels.reduce((s, c) => s + (c.actualSpend ?? 0), 0)
  const emailChannel = campaign.channels.find(c => c.type === 'EMAIL' && c.emailCampaign)
  const contentByStatus = STATUS_ORDER_LOCAL.map(s => ({ status: s, count: (campaign.contentItems ?? []).filter(c => c.status === s).length }))

  return (
    <div className="space-y-4">
      <KpiStrip items={[
        { label: 'PLANNED BUDGET', value: fmtMoney(totalPlanned || null) },
        { label: 'ACTUAL SPEND', value: fmtMoney(totalSpend || null), sub: totalPlanned ? `${Math.round((totalSpend / totalPlanned) * 100)}% of budget` : undefined, subTone: 'blue' },
        { label: 'CONTENT PUBLISHED', value: String((campaign.contentItems ?? []).filter(c => c.status === 'PUBLISHED').length), sub: `of ${(campaign.contentItems ?? []).length} total`, subTone: 'green' },
      ]} />

      {emailChannel?.emailCampaign && (
        <div className="border rounded-xl bg-white p-5">
          <h2 className="font-semibold text-sm mb-3">Email channel</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground block">Status</span><strong>{emailChannel.emailCampaign.status}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Sent</span><strong>{emailChannel.emailCampaign.sentCount} / {emailChannel.emailCampaign.totalRecipients}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Sent at</span><strong>{emailChannel.emailCampaign.sentAt ? fmtDate(emailChannel.emailCampaign.sentAt) : '—'}</strong></div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Open/click detail lives on this campaign's entry in Email Campaigns.</p>
        </div>
      )}

      <div className="border rounded-xl bg-white p-5">
        <h2 className="font-semibold text-sm mb-3">Content pipeline</h2>
        <div className="space-y-2">
          {contentByStatus.map(({ status, count }) => (
            <div key={status} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-muted-foreground">{STATUS_LABELS[status]}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(campaign.contentItems ?? []).length ? (count / (campaign.contentItems ?? []).length) * 100 : 0}%`, background: '#21a36a' }} />
              </div>
              <span className="w-6 text-right font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Revenue and ROAS attribution per campaign isn&apos;t wired up yet — it needs UTM-campaign tracking on inquiries, which this ERP doesn&apos;t capture today.</p>
    </div>
  )
}

const STATUS_ORDER_LOCAL: ContentItem['status'][] = ['IDEA', 'IN_PRODUCTION', 'WAITING_APPROVAL', 'APPROVED', 'REVISION', 'PUBLISHED']
