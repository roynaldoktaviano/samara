// Optional B2B / B2C tag on an EmailCampaign. Stored as a nullable string.
export const CAMPAIGN_EMAIL_TYPES = ['B2B', 'B2C'] as const
export type CampaignEmailType = (typeof CAMPAIGN_EMAIL_TYPES)[number]

export function normalizeEmailType(v: unknown): CampaignEmailType | null {
  return typeof v === 'string' && (CAMPAIGN_EMAIL_TYPES as readonly string[]).includes(v) ? (v as CampaignEmailType) : null
}
