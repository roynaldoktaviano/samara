// Where an inquiry "came in from" — the raw source ('CF7' / 'META_LEAD_AD') plus its
// UTM / click-id attribution boiled down to one readable channel, e.g. a CF7 submission
// with a gclid → "Google Ads". Used for the Leads → Inquiry History label and the
// Leads "Origin" filter, so both always agree.

export const LEAD_ORIGINS = [
  'GOOGLE_ADS',
  'META_ADS',
  'META_LEAD_AD',
  'PAID_OTHER',
  'ORGANIC_SEARCH',
  'ORGANIC_SOCIAL',
  'AI_ASSISTANT',
  'EMAIL',
  'REFERRAL',
  'DIRECT',
  'UNKNOWN',
] as const
export type LeadOrigin = typeof LEAD_ORIGINS[number]

export const LEAD_ORIGIN_LABEL: Record<LeadOrigin, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads (FB/IG)',
  META_LEAD_AD: 'Meta Lead Ads Form',
  PAID_OTHER: 'Other Paid Ads',
  ORGANIC_SEARCH: 'Organic Search',
  ORGANIC_SOCIAL: 'Organic Social',
  AI_ASSISTANT: 'AI Assistant (ChatGPT etc.)',
  EMAIL: 'Email',
  REFERRAL: 'Referral',
  DIRECT: 'Direct',
  UNKNOWN: 'No Tracking Data',
}

export const LEAD_ORIGIN_COLOR: Record<LeadOrigin, string> = {
  GOOGLE_ADS: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  META_ADS: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  META_LEAD_AD: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  PAID_OTHER: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  ORGANIC_SEARCH: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  ORGANIC_SOCIAL: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200',
  AI_ASSISTANT: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  EMAIL: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  REFERRAL: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  DIRECT: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  UNKNOWN: 'bg-muted text-muted-foreground',
}

export const INQUIRY_FORM_LABEL: Record<string, string> = {
  CF7: 'Website Form',
  META_LEAD_AD: 'Meta Instant Form',
  freshsales: 'Freshsales Import',
}

// Only the fields the classifier reads — select exactly these when classifying in bulk.
export const LEAD_ORIGIN_SELECT = {
  source: true,
  utmSource: true, utmMedium: true, gclid: true, gbraid: true, wbraid: true, fbclid: true,
  lastSource: true, lastMedium: true, lastGclid: true, lastGbraid: true, lastWbraid: true, lastFbclid: true,
} as const

export interface LeadOriginInput {
  source: string
  utmSource?: string | null
  utmMedium?: string | null
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  fbclid?: string | null
  lastSource?: string | null
  lastMedium?: string | null
  lastGclid?: string | null
  lastGbraid?: string | null
  lastWbraid?: string | null
  lastFbclid?: string | null
}

interface Touch { source: string; medium: string; googleClick: boolean; metaClick: boolean }

const GOOGLE_SOURCES = /^(google|goolge|gads|google-ads|goolge-ads|adwords)/
const META_SOURCES = /^(fb|ig|an|msg|facebook|instagram|meta|threads)\b/
const SEARCH_ENGINES = /(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|naver)/
const AI_SOURCES = /(chatgpt|openai|perplexity|gemini|claude|copilot|bard)/
const PAID_MEDIUMS = /^(cpc|ppc|paid|paid[-_ ]?social|paidsocial|cpm|display|ads?|lead-google|google)$|^\d{6,}$/

function classifyTouch(t: Touch): LeadOrigin | null {
  const { source, medium } = t
  if (!source && !medium) {
    if (t.googleClick) return 'GOOGLE_ADS'
    if (t.metaClick) return 'ORGANIC_SOCIAL'
    return null
  }
  const paid = PAID_MEDIUMS.test(medium)
  if (t.googleClick && !META_SOURCES.test(source)) return 'GOOGLE_ADS'
  if (GOOGLE_SOURCES.test(source) && (paid || !medium || medium.includes('cpc'))) return 'GOOGLE_ADS'
  if (META_SOURCES.test(source)) return paid ? 'META_ADS' : 'ORGANIC_SOCIAL'
  if (AI_SOURCES.test(source)) return 'AI_ASSISTANT'
  if (paid) return 'PAID_OTHER'
  if (medium.includes('organic search') || medium === 'organic' || SEARCH_ENGINES.test(source)) return 'ORGANIC_SEARCH'
  if (medium.includes('social')) return 'ORGANIC_SOCIAL'
  if (medium.includes('email') || medium.includes('newsletter') || source.includes('newsletter')) return 'EMAIL'
  if (source === 'direct' || medium.includes('direct') || medium === '(none)') return 'DIRECT'
  return 'REFERRAL'
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

// utm_source values the ad team has used for Google Ads over time — "google-ads",
// "googleads", the "goolge-ads" typo, campaign-suffixed ones ("google-ads-manta-season",
// "google-sla-sc-private-leads") and "sitelink-google-ads-diving". Plain "google" is left
// alone since it's also what organic search traffic reports.
const GOOGLE_ADS_SOURCE = /(^|[-_ ])(google|goolge)[-_ ]?ads\b|^(google|goolge)[-_]/

/** Display/grouping label for a raw utm_source — collapses Google Ads spellings into one. */
export function sourceLabel(raw: string): string {
  const s = raw.trim()
  return GOOGLE_ADS_SOURCE.test(s.toLowerCase()) ? 'Google Ads' : s
}

/** First touch (how the visitor originally found us) wins; falls back to this
 *  submission's own last touch when the first-touch fields are empty. */
export function classifyLeadOrigin(inq: LeadOriginInput): LeadOrigin {
  if (inq.source === 'META_LEAD_AD') return 'META_LEAD_AD'
  const first = classifyTouch({
    source: norm(inq.utmSource), medium: norm(inq.utmMedium),
    googleClick: !!(inq.gclid || inq.gbraid || inq.wbraid), metaClick: !!inq.fbclid,
  })
  if (first) return first
  const last = classifyTouch({
    source: norm(inq.lastSource), medium: norm(inq.lastMedium),
    googleClick: !!(inq.lastGclid || inq.lastGbraid || inq.lastWbraid), metaClick: !!inq.lastFbclid,
  })
  return last ?? 'UNKNOWN'
}

/** "samaraliveaboard.com/contact" — the form page without protocol/trailing slash/query. */
export function formPageLabel(url: string | null | undefined, website?: string | null): string | null {
  if (url) {
    try {
      const u = new URL(url)
      let path = decodeURIComponent(u.pathname).replace(/\/+$/, '')
      if (path.length > 60) path = path.slice(0, 57) + '…'
      return u.host.replace(/^www\./, '') + path
    } catch { /* fall through */ }
  }
  return website ?? null
}
