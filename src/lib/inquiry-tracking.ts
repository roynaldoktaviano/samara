import type { Prisma } from '@prisma/client'
import { CONSENT_BANNER_REGIONS, consentRegionFrom, normalizeAdConsent } from '@/lib/ad-consent'
import { isHttpUrl } from '@/lib/url-safety'

// Everything the website sends about where a visitor came from, read off a raw form/tap payload
// into Inquiry columns. "Store-all" rule (Marc, 15 Nov): click IDs, cookies, landing pages,
// referrer, IP, UA and session attributes are kept for EVERY lead — consent only decides what
// is later sent to Google/Meta (src/lib/ad-consent.ts). One exception, same as the website and
// the Freshsales deal maker: Meta's _fbc/_fbp are not kept when the visitor DENIED ad cookies
// in the EU/UK/CH or with no region at all.

// The site's JS writes the literal strings "undefined"/"null" into hidden inputs that never got
// a value — those are blanks, not data.
const BLANK = new Set(['undefined', 'null', 'none', '(not set)', '(none)', 'nan'])

export function cleanValue(v: unknown, max = 1000): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || BLANK.has(s.toLowerCase())) return null
  return s.slice(0, max)
}

/** First non-blank of the given keys. */
export function pickClean(data: Record<string, unknown>, keys: string[], max = 1000): string | null {
  for (const k of keys) {
    const v = cleanValue(data[k], max)
    if (v) return v
  }
  return null
}

const url = (data: Record<string, unknown>, keys: string[]) => {
  const v = pickClean(data, keys, 2000)
  return v && isHttpUrl(v) ? v : null
}

/** True when Meta cookies must NOT be stored for this visitor. */
export function dropMetaCookies(adConsent: string | null, consentRegion: string | null): boolean {
  return adConsent === 'denied' && (!consentRegion || consentRegion === 'none' || CONSENT_BANNER_REGIONS.has(consentRegion))
}

// Every spelling the website / snippet 63 / the plugin uses for Meta's two cookies (not fbclid —
// that's a URL click ID, not a cookie).
const META_COOKIE_KEY = /^(ft_)?_?(meta_)?fb[cp]$/i

/**
 * Copy of a raw payload without Meta's _fbc/_fbp when `drop` — the raw audit copy (Inquiry /
 * WaTap rawPayload, webhook failure log) must follow the same rule as the columns (handover §2).
 */
export function stripMetaCookies<T extends Record<string, unknown>>(data: T, drop: boolean): T {
  if (!drop) return data
  return Object.fromEntries(Object.entries(data).filter(([k]) => !META_COOKIE_KEY.test(k))) as T
}

/** Same, deciding from the payload's own consent fields (website form / tap). */
export function withoutDeniedMetaCookies<T extends Record<string, unknown>>(data: T): T {
  const adConsent = normalizeAdConsent(pickClean(data, ['ad_consent', 'consent']))
  const consentRegion = consentRegionFrom(data, ['consent_region', 'region'])
  return stripMetaCookies(data, dropMetaCookies(adConsent, consentRegion))
}

export type InquiryTracking = Pick<Prisma.InquiryUncheckedCreateInput,
  | 'adConsent' | 'consentRegion' | 'msclkid' | 'lastMsclkid' | 'fbc' | 'fbp'
  | 'firstLandingUrl' | 'landingUrl' | 'firstReferrer' | 'referrer'
  | 'ipAddress' | 'userAgent' | 'sessionAttributes'>

/**
 * The extra tracking columns from a website payload (CF7 hidden fields + what the
 * samara-erp-tracking plugin adds server-side). `fallback` = request-level values (IP/UA)
 * used when the payload doesn't carry them.
 */
export function trackingFromPayload(data: Record<string, unknown>, fallback: { ip?: string | null; userAgent?: string | null } = {}): InquiryTracking {
  const adConsent = normalizeAdConsent(pickClean(data, ['ad_consent']))
  const consentRegion = consentRegionFrom(data, ['consent_region'])
  const dropMeta = dropMetaCookies(adConsent, consentRegion)
  const ftMsclkid = pickClean(data, ['ft_msclkid'], 500)
  const msclkid = pickClean(data, ['msclkid'], 500)
  return {
    adConsent,
    consentRegion,
    msclkid: ftMsclkid ?? msclkid,
    lastMsclkid: msclkid,
    fbc: dropMeta ? null : pickClean(data, ['_fbc', 'fbc', 'meta_fbc'], 500),
    fbp: dropMeta ? null : pickClean(data, ['_fbp', 'fbp', 'meta_fbp'], 500),
    // ft_landing_url keeps the query string (UTMs); first_landing_url is the stripped copy.
    firstLandingUrl: url(data, ['ft_landing_url', 'first_landing_url']),
    landingUrl: url(data, ['landing_url']),
    firstReferrer: pickClean(data, ['ft_referrer'], 2000),
    referrer: pickClean(data, ['referrer', 'http_referer'], 2000),
    ipAddress: pickClean(data, ['visitor_ip', 'ip', 'ip_address'], 64) ?? cleanValue(fallback.ip ?? null, 64),
    userAgent: pickClean(data, ['user_agent', 'visitor_user_agent', 'ua'], 1000) ?? cleanValue(fallback.userAgent ?? null, 1000),
    sessionAttributes: pickClean(data, ['session_attributes', 'google_session_attributes', 'gsa'], 8000),
  }
}

/** Fills only the still-empty tracking columns of an existing inquiry (never overwrites). */
export function missingTracking(existing: Record<string, unknown>, incoming: InquiryTracking): Partial<InquiryTracking> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (v != null && (existing[k] == null || existing[k] === '')) out[k] = v
  }
  return out as Partial<InquiryTracking>
}
