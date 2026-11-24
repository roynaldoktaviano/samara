// Touches — one visit's source / medium / campaign / click ids / landing page / time — and the
// UTM normalisation every enquiry goes through (marketing audit 2026-11-24). Shared by
// src/lib/contact-attribution.ts (per enquiry) and src/lib/deal-attribution.ts (per deal).
import type { Prisma, WhatsappBrand } from '@prisma/client'
import { adNetworkOf, adNetworkOfUrl, type AdNetwork } from '@/lib/deal-quality'

// ─── UTM normalisation ──────────────────────────────────────────────────────

// Google ads spellings: google-ads / goolge-ads / lead-google / lead-google-ads-* / google-sla-… + cpc-…
const GOOGLE_PAID_SOURCE = /^(google[-_ ]?ads?\b|goolge[-_ ]?ads?\b|goolge$|lead[-_]google|gads$|adwords$|google[-_]cpc$)/
const GOOGLE_PAID_MEDIUM = /^(cpc|ppc|paid|paid[-_ ]?search|sem$|ads?$|leads?$|google[-_ ]?ads|goolge[-_ ]?ads|lead[-_])/
// Meta ads spellings: fb / ig / meta / meta-ads (+ facebook-ads, meta-ads-<campaign> …) — paid unless the
// medium says organic. Meta's {{site_source_name}} an / msg / wa only count with a paid medium.
const META_STRONG_SOURCE = /^(fb|ig|meta)$|^(meta|fb|ig|facebook|instagram)[-_ ]?ads?\b/
const META_WEAK_SOURCE = /^(an|msg|wa)$/
const META_SOURCE = /^(facebook|instagram|messenger)$/
const META_PAID_MEDIUM = /^(cpc|ppc|paid|paid[-_ ]?social|social[-_ ]?paid|paidsocial|ads?$|leads?$|meta[-_ ]?ads?|fb[-_ ]?ads?|ig[-_ ]?ads?|lead[-_]meta|\d{6,})/
const ORGANIC_MEDIUM = /organic|^social$|bio|profile|post|story|referral|share/
// A medium that is a plain channel word (vs. a campaign / ad set name typed into the medium slot)
const PLAIN_MEDIUM = /^(cpc|ppc|paid|paid[-_ ]?(search|social)|social[-_ ]?paid|paidsocial|sem|ads?|leads?|google[-_ ]?ads|goolge[-_ ]?ads|lead[-_]google|null|none)$/i

export interface NormalizedUtm { source: string | null; medium: string | null; campaignFromMedium: string | null }

/**
 * Canonical source / medium for the many spellings old links still carry:
 * google-ads / goolge-ads / lead-google / lead-google-ads-* → google / cpc;
 * fb / ig / meta-ads (an / msg / wa with a paid medium) → facebook / instagram / meta … + paid_social.
 * Anything else is only trimmed; an explicit organic medium is never turned into paid. When the old
 * medium was really a campaign / ad set name ("GOOGLE|SLA|SC|…", "lead-google-ads-mischief",
 * "120251262448460511"), it comes back as campaignFromMedium so the caller can keep it as the campaign.
 */
export function normalizeUtm(source: string | null | undefined, medium: string | null | undefined): NormalizedUtm {
  const src = source?.trim() || null
  const med = medium?.trim() || null
  const s = (src ?? '').toLowerCase(), m = (med ?? '').toLowerCase()
  const keep = (n: { source: string | null; medium: string | null }): NormalizedUtm =>
    ({ ...n, campaignFromMedium: med && n.medium !== med && !PLAIN_MEDIUM.test(med) && !ORGANIC_MEDIUM.test(m) ? med : null })
  if (GOOGLE_PAID_SOURCE.test(s) || (/^(google|goolge)\b/.test(s) && GOOGLE_PAID_MEDIUM.test(m)) || (!s && /^(google[-_ ]?ads|goolge[-_ ]?ads|lead[-_]google)/.test(m))) {
    return keep({ source: 'google', medium: 'cpc' })
  }
  const strong = META_STRONG_SOURCE.test(s), weak = META_WEAK_SOURCE.test(s)
  if (strong || weak || META_SOURCE.test(s)) {
    const canonical = /^(ig|instagram)/.test(s) ? 'instagram' : /^(fb|facebook)/.test(s) ? 'facebook'
      : /^(messenger|msg)/.test(s) ? 'messenger' : s === 'wa' ? 'whatsapp' : 'meta'
    const paid = META_PAID_MEDIUM.test(m) || (strong && !ORGANIC_MEDIUM.test(m))
    if (paid) return keep({ source: canonical, medium: 'paid_social' })
    return { source: strong ? canonical : src, medium: med, campaignFromMedium: null }
  }
  return { source: src, medium: med, campaignFromMedium: null }
}

// ─── touches ────────────────────────────────────────────────────────────────

export interface Touch {
  source: string | null; medium: string | null; campaign: string | null; term: string | null; content: string | null
  landingUrl: string | null; referrer: string | null
  gclid: string | null; gbraid: string | null; wbraid: string | null; fbclid: string | null; ctwaClid?: string | null
  brand: WhatsappBrand | null; at: Date; origin: string
}

export function paidNetworkOf(t: Pick<Touch, 'source' | 'medium' | 'gclid' | 'gbraid' | 'wbraid' | 'ctwaClid' | 'landingUrl'>): AdNetwork | null {
  return adNetworkOf(t.source, t.medium, { gclid: !!(t.gclid || t.gbraid || t.wbraid) })
    ?? (t.ctwaClid ? 'Meta Ads' : null)
    ?? adNetworkOfUrl(t.landingUrl)
}

export const INQUIRY_SELECT = {
  id: true, source: true, leadId: true, customerId: true, createdAt: true, website: true, url: true, tripType: true,
  brand: true, tripTypeStd: true, firstTouchAt: true, whatsappConversationId: true,
  utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true,
  gclid: true, gbraid: true, wbraid: true, fbclid: true,
  lastSource: true, lastMedium: true, lastCampaign: true, lastTerm: true, lastContent: true,
  lastGclid: true, lastGbraid: true, lastWbraid: true, lastFbclid: true,
  latestSource: true, latestMedium: true, latestCampaign: true,
  firstLandingUrl: true, landingUrl: true, firstReferrer: true, referrer: true, ctwaClid: true,
} satisfies Prisma.InquirySelect
export type InquiryRow = Prisma.InquiryGetPayload<{ select: typeof INQUIRY_SELECT }>

/** The inquiry's first-touch visit (utm* / gclid … are the visitor's first visit). */
export function firstTouchOfInquiry(i: InquiryRow): Touch {
  return {
    source: i.utmSource, medium: i.utmMedium, campaign: i.utmCampaign, term: i.utmTerm, content: i.utmContent,
    landingUrl: i.firstLandingUrl ?? i.landingUrl ?? i.url, referrer: i.firstReferrer ?? i.referrer,
    gclid: i.gclid, gbraid: i.gbraid, wbraid: i.wbraid, fbclid: i.fbclid, ctwaClid: i.ctwaClid,
    brand: i.brand, at: i.firstTouchAt ?? i.createdAt, origin: i.source,
  }
}

/** The visit that sent this enquiry. */
export function currentTouchOfInquiry(i: InquiryRow): Touch {
  return {
    source: i.lastSource, medium: i.lastMedium, campaign: i.lastCampaign, term: i.lastTerm, content: i.lastContent,
    landingUrl: i.landingUrl ?? i.url, referrer: i.referrer,
    gclid: i.lastGclid, gbraid: i.lastGbraid, wbraid: i.lastWbraid, fbclid: i.lastFbclid, ctwaClid: i.ctwaClid,
    brand: i.brand, at: i.createdAt, origin: i.source,
  }
}

/** Inquiry source / medium / campaign column triples that get normalised. */
export const UTM_PAIRS = [['utmSource', 'utmMedium', 'utmCampaign'], ['lastSource', 'lastMedium', 'lastCampaign'], ['latestSource', 'latestMedium', 'latestCampaign']] as const
