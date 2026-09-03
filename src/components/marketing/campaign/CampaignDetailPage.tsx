'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, Loader2, Plus, X, Mail, Megaphone, Search, MessageCircle, Globe,
  Users2, Layers, Trash2, Link2, Unlink, ImageIcon, Video, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import ContentEditor from '@/components/marketing/content/ContentEditor'
import ContentDetailSheet from '@/components/marketing/content/ContentDetailSheet'
import { FORMAT_LABELS, STATUS_LABELS, STATUS_STYLE, type ContentItem, type ContentFormat } from '@/components/marketing/content/contentTypes'
import {
  STAGE_LABELS, STAGE_STYLE, STAGE_ORDER, CHANNEL_LABELS, CHANNEL_STATUS_LABELS, CHANNEL_STATUS_STYLE,
  CHANNEL_STATUS_ORDER, type Campaign, type CampaignChannel, type CampaignChannelType, type CampaignStage,
} from './campaignTypes'
import { useMarketingTeam, ownerOptionNames, type MarketingTeamMember } from '@/components/marketing/shared/useMarketingTeam'

const ACCENT = '#bdac7e'
const TABS = ['Overview', 'Brief', 'Channels', 'Content & Approval', 'Performance'] as const
type Tab = typeof TABS[number]

const CHANNEL_ICONS: Record<CampaignChannelType, React.ElementType> = {
  EMAIL: Mail, META_ADS: Megaphone, GOOGLE_ADS: Search, WHATSAPP: MessageCircle,
  ORGANIC_SOCIAL: ImageIcon, LANDING_PAGE: Globe, AGENT_OUTREACH: Users2, OTHER: Layers,
}

// Content Studio's format enum already has a 1:1 counterpart for these three channel types
// (a Meta ad creative IS format META_AD, etc.) — so "connecting" a channel to its content is
// just filtering the campaign's content items by format, no new relation needed.
const CHANNEL_TO_CONTENT_FORMAT: Partial<Record<CampaignChannelType, ContentFormat>> = {
  META_ADS: 'META_AD',
  GOOGLE_ADS: 'GOOGLE_DISPLAY',
  LANDING_PAGE: 'LANDING_PAGE_ASSET',
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
    else toast.error('Failed to save')
  }

  if (loading || !campaign) {
    return <div className="p-6 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  const contentNeedingAttention = (campaign.contentItems ?? []).filter(c => c.status === 'WAITING_APPROVAL' || c.status === 'REVISION')

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {campaign.brand && <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{campaign.brand}</span>}
              <Badge className={STAGE_STYLE[campaign.stage]}>{STAGE_LABELS[campaign.stage]}</Badge>
            </div>
            <input
              defaultValue={campaign.name} onBlur={e => e.target.value.trim() && e.target.value !== campaign.name && updateField({ name: e.target.value })}
              className="text-2xl font-bold tracking-tight bg-transparent focus:outline-none focus:border-b focus:border-[#bdac7e] w-full"
            />
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <select
                value={campaign.ownerName ?? ''} onChange={e => updateField({ ownerName: e.target.value || null })}
                className="bg-transparent border-0 -ml-1 px-1 rounded hover:bg-muted focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
              >
                <option value="">Unassigned</option>
                {ownerOptionNames(team, campaign.ownerName).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>· {fmtDate(campaign.startDate)} – {fmtDate(campaign.endDate)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Select
              value={campaign.stage} onValueChange={v => updateField({ stage: v as CampaignStage })}
              disabled={campaign.stage === 'APPROVAL' && !canApprove}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            {campaign.stage === 'APPROVAL' && !canApprove && (
              <span className="text-[11px] text-muted-foreground">Only a Marketing Director can move this past Approval</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {TABS.map(t => (
          <button
            key={t} onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#bdac7e] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t}{t === 'Content & Approval' && contentNeedingAttention.length > 0 && <em className="ml-1.5 not-italic text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{contentNeedingAttention.length}</em>}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab campaign={campaign} onGo={setTab} />}
      {tab === 'Brief' && <BriefTab campaign={campaign} onSave={updateField} onRefresh={fetchCampaign} campaignId={id} />}
      {tab === 'Channels' && (
        <ChannelsTab campaign={campaign} onRefresh={fetchCampaign} team={team} onOpenContent={setOpenContentId} onNewContent={openNewContent} />
      )}
      {tab === 'Content & Approval' && (
        <ContentTab
          campaign={campaign}
          onNew={() => openNewContent()}
          onOpen={setOpenContentId}
        />
      )}
      {tab === 'Performance' && <PerformanceTab campaign={campaign} />}

      <ContentEditor
        open={contentEditorOpen} onOpenChange={setContentEditorOpen} campaignId={id} defaultFormat={newContentFormat}
        onCreated={cid => { fetchCampaign(); setOpenContentId(cid) }}
      />
      <ContentDetailSheet id={openContentId} onOpenChange={open => !open && setOpenContentId(null)} onChanged={fetchCampaign} />
    </div>
  )
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-xl bg-white p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <p className="text-xl font-bold tracking-tight mt-1.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function OverviewTab({ campaign, onGo }: { campaign: Campaign; onGo: (t: Tab) => void }) {
  const totalSpend = campaign.channels.reduce((s, c) => s + (c.actualSpend ?? 0), 0)
  const doneChannels = campaign.channels.filter(c => c.status === 'DONE' || c.status === 'LIVE').length
  const readiness = campaign.channels.length ? Math.round((doneChannels / campaign.channels.length) * 100) : 0
  const attention = (campaign.contentItems ?? []).filter(c => c.status === 'WAITING_APPROVAL' || c.status === 'REVISION')

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="PLANNED BUDGET" value={fmtMoney(campaign.plannedBudget)} />
        <KpiTile label="ACTUAL SPEND" value={fmtMoney(totalSpend || null)} sub={campaign.plannedBudget ? `${Math.round((totalSpend / campaign.plannedBudget) * 100)}% of budget` : undefined} />
        <KpiTile label="CHANNEL READINESS" value={`${readiness}%`} sub={`${doneChannels} of ${campaign.channels.length} live/done`} />
        <KpiTile label="NEEDS ATTENTION" value={String(attention.length)} sub="content items" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-xl bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Campaign components</h2>
            <button onClick={() => onGo('Channels')} className="text-xs font-medium" style={{ color: ACCENT }}>Manage channels →</button>
          </div>
          {campaign.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels added yet.</p>
          ) : (
            <div className="space-y-2">
              {campaign.channels.map(ch => {
                const Icon = CHANNEL_ICONS[ch.type]
                return (
                  <div key={ch.id} className="flex items-center gap-2.5 text-sm">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{CHANNEL_LABELS[ch.type]}</span>
                    <Badge className={CHANNEL_STATUS_STYLE[ch.status]}>{CHANNEL_STATUS_LABELS[ch.status]}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border rounded-xl bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Needs attention</h2>
            <button onClick={() => onGo('Content & Approval')} className="text-xs font-medium" style={{ color: ACCENT }}>Open queue →</button>
          </div>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
          ) : (
            <div className="space-y-2">
              {attention.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{c.title}</span>
                  <Badge className={STATUS_STYLE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                </div>
              ))}
            </div>
          )}
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
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5 border rounded-md p-2 min-h-9">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={placeholder}
          className="flex-1 min-w-[100px] text-sm bg-transparent focus:outline-none"
        />
      </div>
    </div>
  )
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
              <Label className="text-xs text-muted-foreground">Business objective</Label>
              <Textarea defaultValue={campaign.objective ?? ''} onBlur={e => onSave({ objective: e.target.value })} rows={2} placeholder="What should this campaign achieve, and why now?" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Target result</Label>
              <Input defaultValue={campaign.targetResult ?? ''} onBlur={e => onSave({ targetResult: e.target.value })} placeholder="e.g. 3 confirmed charters" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Campaign promise</Label>
              <Textarea defaultValue={campaign.promise ?? ''} onBlur={e => onSave({ promise: e.target.value })} rows={2} placeholder="The one thing this campaign promises" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Offer</Label>
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
              <Label className="text-xs text-muted-foreground">Master language</Label>
              <Input defaultValue={campaign.masterLanguage ?? ''} onBlur={e => onSave({ masterLanguage: e.target.value })} placeholder="e.g. English" />
            </div>
            <TagList label="ADDITIONAL LANGUAGES" values={campaign.additionalLanguages ?? []} onChange={v => onSave({ additionalLanguages: v })} placeholder="Add..." />
            <div className="sm:col-span-2">
              <TagList label="EXCLUSIONS" values={campaign.exclusions ?? []} onChange={v => onSave({ exclusions: v })} placeholder="Add exclusion..." />
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-xl bg-white p-5 space-y-3 h-fit">
        <h2 className="font-semibold text-sm">Discussion</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {(campaign.comments ?? []).map(c => (
            <div key={c.id} className="text-sm">
              <p><strong>{c.authorName}</strong> <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></p>
              <p className="text-muted-foreground">{c.text}</p>
            </div>
          ))}
          {(campaign.comments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        </div>
        <div className="flex gap-2">
          <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a campaign comment..." onKeyDown={e => e.key === 'Enter' && postComment()} />
          <Button size="sm" variant="outline" onClick={postComment} disabled={!comment.trim()}>Send</Button>
        </div>
      </div>
    </div>
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
            const format = CHANNEL_TO_CONTENT_FORMAT[ch.type]
            const linkedContent = format ? (campaign.contentItems ?? []).filter(c => c.format === format) : undefined
            return (
              <ChannelCard
                key={ch.id} channel={ch} onUpdate={p => updateChannel(ch.id, p)} onDelete={() => setDeleteTarget(ch)} team={team}
                linkedContent={linkedContent} onOpenContent={onOpenContent} onNewContent={() => onNewContent(format)}
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
  channel: CampaignChannel; onUpdate: (p: Record<string, unknown>) => void; onDelete: () => void; team: MarketingTeamMember[]
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

  return (
    <div className="border rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></span>
          <h3 className="font-medium text-sm truncate">{CHANNEL_LABELS[channel.type]}</h3>
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
            <button onClick={startLinking} className="inline-flex items-center gap-1.5 hover:underline" style={{ color: ACCENT }}>
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
            <button onClick={onNewContent} className="text-xs font-medium inline-flex items-center gap-1" style={{ color: ACCENT }}>
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
                  <Badge className={`${STATUS_STYLE[item.status]} shrink-0 text-[10px]`}>{STATUS_LABELS[item.status]}</Badge>
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

function ContentTab({ campaign, onNew, onOpen }: { campaign: Campaign; onNew: () => void; onOpen: (id: string) => void }) {
  const items = campaign.contentItems ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} content item{items.length === 1 ? '' : 's'} in this campaign</p>
        <Button size="sm" onClick={onNew} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New content
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No content linked to this campaign yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => <ContentCardMini key={item.id} item={item} onClick={() => onOpen(item.id)} />)}
        </div>
      )}
    </div>
  )
}

function ContentCardMini({ item, onClick }: { item: ContentItem; onClick: () => void }) {
  const latest = item.versions?.[0] ?? null
  return (
    <button onClick={onClick} className="text-left border rounded-xl bg-white overflow-hidden hover:shadow-md hover:border-[#bdac7e]/50 transition-all">
      <div className="h-32 bg-muted/40 flex items-center justify-center relative">
        {latest?.mediaUrl ? (
          latest.mediaType === 'video' ? <video src={latest.mediaUrl} className="w-full h-full object-cover" muted /> : latest.mediaType === 'image' ? <img src={latest.mediaUrl} alt={item.title} className="w-full h-full object-cover" /> : <FileText className="h-7 w-7 text-muted-foreground/40" />
        ) : <ImageIcon className="h-7 w-7 text-muted-foreground/30" />}
        <Badge className={`absolute top-2 right-2 ${STATUS_STYLE[item.status]}`}>{STATUS_LABELS[item.status]}</Badge>
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-medium text-sm leading-snug line-clamp-2">{item.title}</h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{FORMAT_LABELS[item.format]}</span>
          {latest?.mediaType === 'video' && <Video className="h-3 w-3" />}
        </div>
      </div>
    </button>
  )
}

function PerformanceTab({ campaign }: { campaign: Campaign }) {
  const totalPlanned = campaign.channels.reduce((s, c) => s + (c.plannedBudget ?? 0), 0) || campaign.plannedBudget || 0
  const totalSpend = campaign.channels.reduce((s, c) => s + (c.actualSpend ?? 0), 0)
  const emailChannel = campaign.channels.find(c => c.type === 'EMAIL' && c.emailCampaign)
  const contentByStatus = STATUS_ORDER_LOCAL.map(s => ({ status: s, count: (campaign.contentItems ?? []).filter(c => c.status === s).length }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiTile label="PLANNED BUDGET" value={fmtMoney(totalPlanned || null)} />
        <KpiTile label="ACTUAL SPEND" value={fmtMoney(totalSpend || null)} sub={totalPlanned ? `${Math.round((totalSpend / totalPlanned) * 100)}% of budget` : undefined} />
        <KpiTile label="CONTENT PUBLISHED" value={String((campaign.contentItems ?? []).filter(c => c.status === 'PUBLISHED').length)} sub={`of ${(campaign.contentItems ?? []).length} total`} />
      </div>

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
                <div className="h-full rounded-full" style={{ width: `${(campaign.contentItems ?? []).length ? (count / (campaign.contentItems ?? []).length) * 100 : 0}%`, background: ACCENT }} />
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
