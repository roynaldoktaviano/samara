import { Mail, Megaphone, Search, MessageCircle, ImageIcon, Globe, Users2, Layers } from 'lucide-react'
import type { ContentItem } from '@/components/marketing/content/contentTypes'

export type CampaignStage = 'PLANNING' | 'IN_PRODUCTION' | 'APPROVAL' | 'LIVE' | 'COMPLETED'

export type CampaignChannelType =
  | 'EMAIL' | 'META_ADS' | 'GOOGLE_ADS' | 'WHATSAPP' | 'ORGANIC_SOCIAL' | 'LANDING_PAGE' | 'AGENT_OUTREACH' | 'OTHER'

export type CampaignChannelStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'LIVE' | 'PAUSED' | 'DONE'

export interface CampaignChannel {
  id: string
  type: CampaignChannelType
  status: CampaignChannelStatus
  ownerName: string | null
  notes: string | null
  plannedBudget: number | null
  actualSpend: number | null
  externalUrl: string | null
  externalCampaignName: string | null
  emailCampaignId: string | null
  emailCampaign: { id: string; name: string; status: string; totalRecipients: number; sentCount: number; sentAt: string | null; openedCount?: number; clickedCount?: number } | null
  createdAt: string
  updatedAt: string
}

export interface CampaignComment {
  id: string
  authorName: string
  text: string
  createdAt: string
}

export interface Campaign {
  id: string
  name: string
  brand: string | null
  stage: CampaignStage
  objective: string | null
  targetResult: string | null
  promise: string | null
  offer: string | null
  startDate: string | null
  endDate: string | null
  plannedBudget: number | null
  ownerName: string | null
  audienceSegments: string[] | null
  markets: string[] | null
  masterLanguage: string | null
  additionalLanguages: string[] | null
  exclusions: string[] | null
  // The campaign's ?utm_campaign= slug — matched against Inquiry.utmCampaign server-side
  // to compute `attribution` below (see src/lib/campaign-attribution.ts).
  utmSlug: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  channels: CampaignChannel[]
  comments?: CampaignComment[]
  contentItems?: ContentItem[]
  _count?: { contentItems: number; comments: number }
  // Only present on the single-campaign GET (the list endpoint doesn't compute it, to
  // keep the Campaigns list cheap) — real numbers, "0" until utmSlug is set and starts
  // matching inbound inquiries, never fabricated.
  attribution?: { leads: number; bookings: number; revenue: number }
}

export interface CampaignReadiness {
  strategyBrief: number
  audienceMarkets: number
  creativeProduction: number
  approvals: number
  trackingAttribution: number
  overall: number
}

// Purely derived from fields already on `campaign` (no extra fetch) — each dimension is a
// real, checkable fact (fields filled, content items approved, utmSlug set), standing in
// for proto-3's "Campaign readiness" donut + checklist, which was hardcoded/dummy there.
export function computeCampaignReadiness(campaign: Campaign): CampaignReadiness {
  const briefFields = [campaign.objective, campaign.targetResult, campaign.promise, campaign.offer]
  const strategyBrief = Math.round((briefFields.filter(Boolean).length / briefFields.length) * 100)

  const audienceChecks = [
    (campaign.audienceSegments?.length ?? 0) > 0,
    (campaign.markets?.length ?? 0) > 0,
    !!campaign.masterLanguage,
  ]
  const audienceMarkets = Math.round((audienceChecks.filter(Boolean).length / audienceChecks.length) * 100)

  const items = campaign.contentItems ?? []
  const creativeProduction = items.length
    ? Math.round((items.filter(i => i.status !== 'IDEA' && i.status !== 'IN_PRODUCTION').length / items.length) * 100)
    : 0
  const approvals = items.length
    ? Math.round((items.filter(i => i.status === 'APPROVED' || i.status === 'PUBLISHED').length / items.length) * 100)
    : 0

  const trackingAttribution = campaign.utmSlug ? 100 : 0

  const overall = Math.round((strategyBrief + audienceMarkets + creativeProduction + approvals + trackingAttribution) / 5)

  return { strategyBrief, audienceMarkets, creativeProduction, approvals, trackingAttribution, overall }
}

export const STAGE_LABELS: Record<CampaignStage, string> = {
  PLANNING: 'Planning',
  IN_PRODUCTION: 'In Production',
  APPROVAL: 'Approval',
  LIVE: 'Live',
  COMPLETED: 'Completed',
}

// Exact badge hex pairs from the proto-3 mockup's five tones (src/app/proto-3/App.jsx
// COLORS/`.badge-*` rules) — COMPLETED has no proto-3 equivalent (the mockup only ever
// needed 4 stages), so it reuses the violet pairing proto-3 uses elsewhere (.mi-3 icon).
export const PILL = 'rounded-full px-[7px] py-[3px] text-[9px] font-bold border-0 leading-none'
export const STAGE_STYLE: Record<CampaignStage, string> = {
  PLANNING: 'bg-[#eef0f2] text-[#626872]',
  IN_PRODUCTION: 'bg-[#eaf1ff] text-[#2864d7]',
  APPROVAL: 'bg-[#fff2d8] text-[#996313]',
  LIVE: 'bg-[#e6f7ee] text-[#087b4c]',
  COMPLETED: 'bg-[#f3ebfa] text-[#8553b5]',
}

export const STAGE_ORDER: CampaignStage[] = ['PLANNING', 'IN_PRODUCTION', 'APPROVAL', 'LIVE', 'COMPLETED']

export const CHANNEL_ICONS: Record<CampaignChannelType, React.ElementType> = {
  EMAIL: Mail, META_ADS: Megaphone, GOOGLE_ADS: Search, WHATSAPP: MessageCircle,
  ORGANIC_SOCIAL: ImageIcon, LANDING_PAGE: Globe, AGENT_OUTREACH: Users2, OTHER: Layers,
}

export const CHANNEL_LABELS: Record<CampaignChannelType, string> = {
  EMAIL: 'Email',
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  WHATSAPP: 'WhatsApp',
  ORGANIC_SOCIAL: 'Organic Social',
  LANDING_PAGE: 'Landing Page',
  AGENT_OUTREACH: 'Agent Outreach',
  OTHER: 'Other',
}

export const CHANNEL_STATUS_LABELS: Record<CampaignChannelStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  LIVE: 'Live',
  PAUSED: 'Paused',
  DONE: 'Done',
}

export const CHANNEL_STATUS_STYLE: Record<CampaignChannelStatus, string> = {
  NOT_STARTED: 'bg-[#eef0f2] text-[#626872]',
  IN_PROGRESS: 'bg-[#eaf1ff] text-[#2864d7]',
  READY: 'bg-[#fff2d8] text-[#996313]',
  LIVE: 'bg-[#e6f7ee] text-[#087b4c]',
  PAUSED: 'bg-[#fdecec] text-[#bd3c3c]',
  DONE: 'bg-[#f3ebfa] text-[#8553b5]',
}

export const CHANNEL_STATUS_ORDER: CampaignChannelStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'READY', 'LIVE', 'PAUSED', 'DONE']

// Per-channel accent color, lifted straight from proto-3's channelData (App.jsx) so a
// channel's progress bar / icon chip reads the same regardless of which real
// CampaignChannelType backs it. AGENT_OUTREACH/OTHER have no proto-3 counterpart, so they
// take a neutral slate consistent with the rest of the palette rather than inventing a
// new hue.
export const CHANNEL_ACCENT: Record<CampaignChannelType, string> = {
  META_ADS: '#2776e8',
  GOOGLE_ADS: '#4285f4',
  EMAIL: '#9d6fcb',
  ORGANIC_SOCIAL: '#ef4d7a',
  WHATSAPP: '#20b86a',
  LANDING_PAGE: '#d69a2d',
  AGENT_OUTREACH: '#5b6b7a',
  OTHER: '#8a8f96',
}

function hashSeed(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return hash
}

// Deterministic dark gradient standing in for proto-3's stock cover photos (yacht/reef/
// island images) — this app has no campaign cover-image field, so a hashed hue keeps every
// campaign visually distinct across the list and detail pages without faking a photo.
export function brandGradient(seed: string) {
  const hash = hashSeed(seed)
  const hue = hash % 360
  return `linear-gradient(160deg, hsl(${hue} 45% 24%), hsl(${(hue + 40) % 360} 40% 12%))`
}

// Same idea as brandGradient, but a real (stock, decorative-only) photo for the campaign
// detail hero — proto-3 uses one of three fixed Unsplash yacht/reef/island photos the same
// way, purely as backdrop art, never as a stand-in for real campaign content or data.
const HERO_STOCK_PHOTOS = [
  'https://images.unsplash.com/photo-1540946485063-a40da27545f8?auto=format&fit=crop&w=1500&q=80',
  'https://images.unsplash.com/photo-1546026423-cc4642628d2b?auto=format&fit=crop&w=1500&q=80',
  'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1500&q=80',
  'https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=1500&q=80',
]

export function heroBackground(seed: string) {
  const photo = HERO_STOCK_PHOTOS[hashSeed(seed) % HERO_STOCK_PHOTOS.length]
  return `linear-gradient(90deg, rgba(10,20,30,.88), rgba(10,20,30,.42), rgba(10,20,30,.12)), url(${photo})`
}
