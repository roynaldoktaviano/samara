// Ad-cookie consent captured on the website forms (Complianz banner → snippet 62 hidden
// fields `ad_consent` / `consent_region` → CF7 webhook → Inquiry.adConsent/consentRegion).
//
// Consent never decides what we STORE (every click ID is kept), only what we SEND to ad
// platforms. The upload rule mirrors the marketing bots' consent_rule.py so ERP exports and
// the bots' Google Sheets feeds agree:
//   1. denied on any inquiry          → never sent
//   2. EU / EEA / UK / CH visitor     → sent only with a real banner "granted" from that region
//   3. anyone else (granted, unknown, not_required, no data) → sent

export type AdConsent = 'granted' | 'denied' | 'unknown' | 'not_required'

const AD_CONSENT_VALUES: readonly AdConsent[] = ['granted', 'denied', 'unknown', 'not_required']

// consent_region values that mean the visitor saw (or should have seen) the opt-in banner.
export const CONSENT_BANNER_REGIONS = new Set(['eu', 'eea', 'uk', 'ch'])

// EU-27 + Iceland/Liechtenstein/Norway + UK + Switzerland, spelled as in src/lib/nationalities.ts.
const EEA_UK_CH_NATIONALITIES = new Set([
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'Estonia',
  'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania',
  'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia',
  'Spain', 'Sweden', 'Iceland', 'Liechtenstein', 'Norway', 'United Kingdom', 'Switzerland',
])

// Before this moment (15 Nov 2026 12:41 WITA) the site wrote "granted" for visitors who never
// saw a banner (non-EU). Those rows are really "not_required".
export const NO_BANNER_FIX_AT = new Date('2026-11-15T04:41:00Z')

export function normalizeAdConsent(raw: unknown): AdConsent | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return (AD_CONSENT_VALUES as readonly string[]).includes(v) ? (v as AdConsent) : null
}

export function normalizeConsentRegion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  return /^[a-z_]{1,16}$/.test(v) ? v : null
}

/** Applies the pre-15-Nov "granted without a banner" correction. */
export function correctLegacyConsent(consent: AdConsent | null, region: string | null, createdAt: Date): AdConsent | null {
  if (consent === 'granted' && createdAt < NO_BANNER_FIX_AT && !(region && CONSENT_BANNER_REGIONS.has(region))) {
    return 'not_required'
  }
  return consent
}

export function isEeaUkChNationality(nationality: string | null | undefined): boolean {
  return !!nationality && EEA_UK_CH_NATIONALITIES.has(nationality.trim())
}

export interface ConsentInquiry {
  adConsent: string | null
  consentRegion: string | null
}

export type AdUploadDecision =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'eea_without_consent' }

/** Whether this person's data may be sent to Google/Meta, from all of their inquiries. */
export function adUploadDecision(inquiries: ConsentInquiry[], nationality?: string | null): AdUploadDecision {
  if (inquiries.some(i => i.adConsent === 'denied')) return { ok: false, reason: 'denied' }
  const isEea = isEeaUkChNationality(nationality)
    || inquiries.some(i => i.consentRegion && CONSENT_BANNER_REGIONS.has(i.consentRegion))
  if (isEea) {
    const realGrant = inquiries.some(i => i.adConsent === 'granted' && i.consentRegion && CONSENT_BANNER_REGIONS.has(i.consentRegion))
    if (!realGrant) return { ok: false, reason: 'eea_without_consent' }
  }
  return { ok: true }
}

/**
 * A WhatsApp chat timing-matched with LOW confidence to a website tap (src/lib/wa-tap.ts) may
 * belong to someone else's click — its click IDs are never sent until sales raise it to
 * Medium/Confident. Form inquiries have no confidence and always pass.
 */
export function isUploadableMatch(matchConfidence: string | null | undefined): boolean {
  return matchConfidence !== 'LOW'
}

/** Prisma filter: inquiries whose click IDs may be uploaded (not a LOW WhatsApp match). */
export const UPLOADABLE_MATCH_WHERE = { OR: [{ matchConfidence: null }, { matchConfidence: { not: 'LOW' } }] }

// ── UI ────────────────────────────────────────────────────────────────────────
export const AD_CONSENT_LABEL: Record<AdConsent, string> = {
  granted: 'Accepted',
  denied: 'Declined',
  unknown: 'Unknown',
  not_required: 'Not asked',
}

export const AD_CONSENT_COLOR: Record<AdConsent, string> = {
  granted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  denied: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  unknown: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  not_required: 'bg-muted text-muted-foreground',
}

export function consentRegionLabel(region: string | null | undefined): string | null {
  if (!region || region === 'none') return null
  if (CONSENT_BANNER_REGIONS.has(region)) return region === 'eea' ? 'EEA' : region.toUpperCase()
  return region.toUpperCase()
}
