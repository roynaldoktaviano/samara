// Shared enum labels/colors so the list, editor and detail panel never drift apart.

export type ContentFormat =
  | 'INSTAGRAM_REEL' | 'INSTAGRAM_POST' | 'INSTAGRAM_STORY' | 'META_AD'
  | 'GOOGLE_DISPLAY' | 'EMAIL_HERO' | 'WHATSAPP_BROADCAST' | 'LANDING_PAGE_ASSET' | 'OTHER'

export type ContentStatus = 'IDEA' | 'IN_PRODUCTION' | 'WAITING_APPROVAL' | 'APPROVED' | 'REVISION' | 'PUBLISHED'

export interface ContentVersion {
  id: string
  versionNumber: number
  mediaUrl: string | null
  mediaType: string | null
  note: string | null
  createdByName: string | null
  createdAt: string
}

export interface ContentComment {
  id: string
  authorName: string
  text: string
  action: string | null
  createdAt: string
}

export interface ContentItem {
  id: string
  title: string
  format: ContentFormat
  status: ContentStatus
  campaignId: string | null
  campaignTag: string | null
  caption: string | null
  ownerName: string | null
  dueDate: string | null
  liveUrl: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  versions: ContentVersion[]
  comments?: ContentComment[]
  _count?: { comments: number }
}

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  INSTAGRAM_REEL: 'Instagram Reel',
  INSTAGRAM_POST: 'Instagram Post',
  INSTAGRAM_STORY: 'Instagram Story',
  META_AD: 'Meta Ad',
  GOOGLE_DISPLAY: 'Google Display',
  EMAIL_HERO: 'Email Hero',
  WHATSAPP_BROADCAST: 'WhatsApp Broadcast',
  LANDING_PAGE_ASSET: 'Landing Page Asset',
  OTHER: 'Other',
}

export const STATUS_LABELS: Record<ContentStatus, string> = {
  IDEA: 'Idea',
  IN_PRODUCTION: 'In Production',
  WAITING_APPROVAL: 'Waiting Approval',
  APPROVED: 'Approved',
  REVISION: 'Needs Revision',
  PUBLISHED: 'Published',
}

export const STATUS_STYLE: Record<ContentStatus, string> = {
  IDEA: 'bg-gray-100 text-gray-700 border-gray-200',
  IN_PRODUCTION: 'bg-blue-100 text-blue-700 border-blue-200',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REVISION: 'bg-red-100 text-red-700 border-red-200',
  PUBLISHED: 'bg-violet-100 text-violet-700 border-violet-200',
}

export const STATUS_ORDER: ContentStatus[] = ['IDEA', 'IN_PRODUCTION', 'WAITING_APPROVAL', 'APPROVED', 'REVISION', 'PUBLISHED']
