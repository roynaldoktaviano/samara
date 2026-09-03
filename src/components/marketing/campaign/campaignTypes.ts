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
  emailCampaign: { id: string; name: string; status: string; totalRecipients: number; sentCount: number; sentAt: string | null } | null
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
  createdByName: string | null
  createdAt: string
  updatedAt: string
  channels: CampaignChannel[]
  comments?: CampaignComment[]
  contentItems?: ContentItem[]
  _count?: { contentItems: number; comments: number }
}

export const STAGE_LABELS: Record<CampaignStage, string> = {
  PLANNING: 'Planning',
  IN_PRODUCTION: 'In Production',
  APPROVAL: 'Approval',
  LIVE: 'Live',
  COMPLETED: 'Completed',
}

export const STAGE_STYLE: Record<CampaignStage, string> = {
  PLANNING: 'bg-gray-100 text-gray-700 border-gray-200',
  IN_PRODUCTION: 'bg-blue-100 text-blue-700 border-blue-200',
  APPROVAL: 'bg-amber-100 text-amber-700 border-amber-200',
  LIVE: 'bg-green-100 text-green-700 border-green-200',
  COMPLETED: 'bg-violet-100 text-violet-700 border-violet-200',
}

export const STAGE_ORDER: CampaignStage[] = ['PLANNING', 'IN_PRODUCTION', 'APPROVAL', 'LIVE', 'COMPLETED']

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
  NOT_STARTED: 'bg-gray-100 text-gray-600 border-gray-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  READY: 'bg-amber-100 text-amber-700 border-amber-200',
  LIVE: 'bg-green-100 text-green-700 border-green-200',
  PAUSED: 'bg-orange-100 text-orange-700 border-orange-200',
  DONE: 'bg-violet-100 text-violet-700 border-violet-200',
}

export const CHANNEL_STATUS_ORDER: CampaignChannelStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'READY', 'LIVE', 'PAUSED', 'DONE']
