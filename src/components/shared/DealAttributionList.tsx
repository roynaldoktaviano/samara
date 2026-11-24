'use client'

// Ad attribution PER DEAL of a lead / guest (src/lib/deal-attribution.ts): a person with two deals can
// come from two different ads, years apart — each deal shows its own first touch, last paid click and
// whether an ad acquired or only assisted it.
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { LEAD_STAGE_LABEL } from '@/lib/lead-pipeline'
import { DEAL_BOOKING_TYPE_LABEL, DEAL_ENQUIRY_CHANNEL_LABEL } from '@/lib/deal-classify'
import type { DealBookingType, DealEnquiryChannel, LeadStage } from '@prisma/client'

interface Attribution {
  firstSource: string | null; firstMedium: string | null; firstCampaign: string | null; firstTerm: string | null
  firstLandingUrl: string | null; firstReferrer: string | null; firstGclid: string | null; firstGbraid: string | null; firstWbraid: string | null; firstFbclid: string | null
  firstBrand: string | null; firstAt: string | null; firstOrigin: string | null
  lastPaidNetwork: string | null; lastPaidSource: string | null; lastPaidMedium: string | null; lastPaidCampaign: string | null; lastPaidTerm: string | null
  lastPaidLandingUrl: string | null; lastPaidGclid: string | null; lastPaidGbraid: string | null; lastPaidWbraid: string | null; lastPaidCtwaClid: string | null
  lastPaidBrand: string | null; lastPaidAt: string | null; lastPaidOrigin: string | null
  adRole: string | null; adNetwork: string | null; adEvidence: string | null
}
interface DealRow {
  id: string; orderId: string | null; tripType: string | null; productInterest: string | null; stage: LeadStage; createdAt: string; brand: string
  bookingType: DealBookingType | null; enquiryChannel: DealEnquiryChannel | null; attribution: Attribution | null
}

const ORIGIN_LABEL: Record<string, string> = {
  CF7: 'website form', META_LEAD_AD: 'Meta lead form', WHATSAPP: 'WhatsApp tap', PAGE_VIEW: 'website visit',
  FRESHSALES: 'Freshsales contact', FRESHSALES_WEB: 'Freshsales web tracking',
}
const origin = (o: string | null) => (o ? ORIGIN_LABEL[o] ?? o.toLowerCase().replace(/_/g, ' ') : null)
const cap = (b: string | null) => (b ? b.charAt(0) + b.slice(1).toLowerCase().replace(/_/g, ' ') : null)
const when = (d: string) => formatDate(d, 'datetime')
const ROLE_STYLE: Record<string, string> = {
  ACQUIRED: 'bg-success/15 text-success', ASSISTED: 'bg-warning/15 text-warning', NONE: 'bg-muted text-muted-foreground',
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0 w-24">{label}</span>
      <span className={`min-w-0 break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  )
}

const clickIds = (g: string | null, gb: string | null, wb: string | null, extra?: string | null) =>
  [g && `gclid ${g.slice(0, 18)}…`, gb && 'gbraid', wb && 'wbraid', extra].filter(Boolean).join(' · ') || null

function DealCard({ d }: { d: DealRow }) {
  const a = d.attribution
  const role = a?.adRole ?? 'NONE'
  return (
    <div className="rounded-lg border p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{d.orderId ?? 'Deal'}</span>
        <span className="text-muted-foreground">{[cap(d.tripType), d.productInterest, LEAD_STAGE_LABEL[d.stage], `opened ${formatDate(d.createdAt)}`].filter(Boolean).join(' · ')}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_STYLE[role] ?? ROLE_STYLE.NONE}`}>
          {role === 'ACQUIRED' ? `Acquired · ${a?.adNetwork}` : role === 'ASSISTED' ? `Assisted · ${a?.adNetwork}` : 'No ad'}
        </span>
      </div>
      {(d.bookingType || d.enquiryChannel || a?.adEvidence) && (
        <p className="text-muted-foreground">
          {[d.enquiryChannel && `via ${DEAL_ENQUIRY_CHANNEL_LABEL[d.enquiryChannel]}`, d.bookingType && DEAL_BOOKING_TYPE_LABEL[d.bookingType], a?.adEvidence].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="font-medium">First touch <span className="font-normal text-[10px] text-muted-foreground">· never overwritten</span></p>
          {a?.firstAt ? (
            <>
              <Row label="When" value={`${when(a.firstAt)}${a.firstOrigin ? ` · ${origin(a.firstOrigin)}` : ''}`} />
              <Row label="Source / medium" value={a.firstSource || a.firstMedium ? `${a.firstSource ?? '—'} / ${a.firstMedium ?? '—'}` : 'Direct (no campaign)'} />
              <Row label="Campaign" value={a.firstCampaign} />
              <Row label="Term" value={a.firstTerm} />
              <Row label="Landing page" value={a.firstLandingUrl} />
              <Row label="Referrer" value={a.firstReferrer} />
              <Row label="Click ids" value={clickIds(a.firstGclid, a.firstGbraid, a.firstWbraid, a.firstFbclid && 'fbclid')} mono />
              <Row label="Brand" value={cap(a.firstBrand)} />
            </>
          ) : <p className="text-muted-foreground italic">Not recorded</p>}
        </div>
        <div className="space-y-1">
          <p className="font-medium">Last paid ad click <span className="font-normal text-[10px] text-muted-foreground">· within this deal</span></p>
          {a?.lastPaidAt ? (
            <>
              <Row label="When" value={`${when(a.lastPaidAt)}${a.lastPaidOrigin ? ` · ${origin(a.lastPaidOrigin)}` : ''}`} />
              <Row label="Network" value={a.lastPaidNetwork} />
              <Row label="Source / medium" value={`${a.lastPaidSource ?? '—'} / ${a.lastPaidMedium ?? '—'}`} />
              <Row label="Campaign" value={a.lastPaidCampaign} />
              <Row label="Term" value={a.lastPaidTerm} />
              <Row label="Landing page" value={a.lastPaidLandingUrl} />
              <Row label="Click ids" value={clickIds(a.lastPaidGclid, a.lastPaidGbraid, a.lastPaidWbraid, a.lastPaidCtwaClid && 'ctwa')} mono />
              <Row label="Brand" value={cap(a.lastPaidBrand)} />
            </>
          ) : <p className="text-muted-foreground italic">No ad click in this deal&apos;s window</p>}
        </div>
      </div>
    </div>
  )
}

export function DealAttributionList({ leadId, customerId }: { leadId?: string | null; customerId?: string | null }) {
  const url = customerId ? `/api/customers/${customerId}/attribution` : leadId ? `/api/leads/${leadId}/attribution` : null
  const [state, setState] = useState<{ url: string; deals: DealRow[] } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    fetch(url).then(r => (r.ok ? r.json() : [])).then(d => { if (alive) setState({ url, deals: Array.isArray(d) ? d : [] }) })
      .catch(() => { if (alive) setState({ url, deals: [] }) })
    return () => { alive = false }
  }, [url])
  if (!url) return null
  if (state?.url !== url) return <Skeleton className="h-20 w-full rounded-lg" />
  if (!state.deals.length) return <p className="text-xs text-muted-foreground italic">No deals yet — ads are attributed per deal.</p>
  return <div className="space-y-2">{state.deals.map(d => <DealCard key={d.id} d={d} />)}</div>
}
