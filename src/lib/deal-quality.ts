// Data-quality rules from the marketing won-deal audit (2026-11-24):
//  - test deals (Abel, Ursula Wastian, "Test" …) stay out of every report, upload and migration;
//  - agent bookings are told apart from direct ones so agent revenue never counts toward ad ROAS;
//  - the real Won date is when the deal entered a Won stage (Freshsales "closed date" is typed by
//    hand — some are earlier than the contact itself);
//  - per DEAL, an ad either ACQUIRED it or only ASSISTED it — src/lib/deal-attribution.ts.
// Freshsales is never written to: per-deal corrections live in FreshsalesDealFix.
import type { PrismaClient } from '@prisma/client'

// ─── test deals ─────────────────────────────────────────────────────────────

// Word-bounded so "Isabel" / "Contest" don't match; "Abel" is the ERP developer's test name.
export const TEST_NAME_RE = /\b(test|testing|tester|dummy)\b|ursula wastian|\babel\b/i

export function looksLikeTest(...names: (string | null | undefined)[]): boolean {
  return names.some(n => !!n && TEST_NAME_RE.test(n))
}

// ─── agent bookings ─────────────────────────────────────────────────────────

// Freshsales deal-name code "<yacht>-A:" in its many spellings: "S1-A:", "S1 - A :", "MI – A:", "M-A:".
export const AGENT_CODE_RE = /^\s*[a-z0-9]{1,3}\s*[-–]\s*a\s*:/i

// ─── ad network of a touch ──────────────────────────────────────────────────

export type AdNetwork = 'Google Ads' | 'Meta Ads'

const GOOGLE_RE = /google|goolge|gads|adwords/
const SOCIAL_RE = /facebook|instagram|\bfb\b|\big\b|meta|\bwa\b/
const PAID_RE = /cpc|ppc|paid|\bads?\b|-ads|ads-|adwords|display|\bsem\b|lead-google/

/**
 * The paid network a source / medium pair (or click id) belongs to, null when it isn't a paid
 * click. Covers the old link spellings (google-ads, goolge-ads, lead-google, lead-google-ads-*,
 * fb / ig / meta-ads). A bare fbclid is not counted — Facebook adds it to organic shares too.
 */
export function adNetworkOf(source: string | null | undefined, medium: string | null | undefined, ids: { gclid?: boolean } = {}): AdNetwork | null {
  const src = (source ?? '').toLowerCase().trim()
  const med = (medium ?? '').toLowerCase().trim()
  const both = `${src} ${med}`
  if (SOCIAL_RE.test(both) && PAID_RE.test(both)) return 'Meta Ads'
  if (GOOGLE_RE.test(both) && PAID_RE.test(both)) return 'Google Ads'
  if (ids.gclid) return 'Google Ads'
  return null
}

/** Paid network of a visited URL from its utm_* / gclid / gbraid / wbraid query params. */
export function adNetworkOfUrl(url: string | null | undefined): AdNetwork | null {
  if (!url) return null
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : ''
  if (!q) return null
  let params: URLSearchParams
  try { params = new URLSearchParams(q) } catch { return null }
  const clickId = !!(params.get('gclid') || params.get('gbraid') || params.get('wbraid') || params.get('gad_source'))
  return adNetworkOf(params.get('utm_source'), params.get('utm_medium'), { gclid: clickId })
}

// ─── acquired vs assisted ───────────────────────────────────────────────────

export type AdRole = 'acquired' | 'assisted' | 'none'
export interface AdRoleResult { role: AdRole; network: AdNetwork | null; evidence: string | null }
export interface PaidVisit { at: Date; network: AdNetwork; url?: string }

// Freshworks web tracking stamps page views with the visitor's device clock and posts them late, so
// the ad landing of the very visit that submitted the form often shows up minutes AFTER the contact
// was created (Robby Weatherley: gclid landing + thank-you page 2 min after; Beulen Delphine 7 min).
// Across all won deals the first ad visit clusters at 0–15 min after the lead, then goes quiet —
// so anything within 15 min still counts as the visit that brought the lead in.
export const SAME_VISIT_MS = 15 * 60 * 1000

export function gap(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} days`
}

export const AD_ROLE_LABEL: Record<AdRole, string> = { acquired: 'Acquired by ad', assisted: 'Assisted by ad', none: 'No ad' }

// ─── Freshsales archive helpers ─────────────────────────────────────────────

export async function loadDealFixes(db: PrismaClient) {
  const rows = await db.freshsalesDealFix.findMany()
  return new Map(rows.map(r => [r.dealId, r]))
}

/**
 * Per Freshsales deal: when it first entered a Won stage (deal CREATE / STAGE_CHANGE timeline
 * events), and per contact: paid page visits (Freshworks web tracking keeps the full landing URL).
 */
export async function loadFreshsalesTimelineFacts(db: PrismaClient, dealIds: string[], contactIds: string[], wonStageIds: string[]) {
  const wonAt = new Map<string, Date>()
  const visits = new Map<string, PaidVisit[]>()
  if (dealIds.length && wonStageIds.length) {
    const rows = await db.$queryRaw<{ deal: string; at: Date }[]>`
      SELECT "targetFsId" AS deal, min("occurredAt") AS at FROM "FreshsalesTimelineEvent"
      WHERE "targetType" = 'Deal' AND "targetFsId" = ANY(${dealIds}) AND "actionType" IN ('CREATE', 'STAGE_CHANGE')
        AND "actionData"->>'stage_id' = ANY(${wonStageIds})
      GROUP BY "targetFsId"`
    for (const r of rows) wonAt.set(r.deal, r.at)
  }
  if (contactIds.length) {
    const rows = await db.$queryRaw<{ contact: string; at: Date; url: string }[]>`
      SELECT "contactFsId" AS contact, "occurredAt" AS at, "actionData"->>'property_value' AS url FROM "FreshsalesTimelineEvent"
      WHERE "contactFsId" = ANY(${contactIds}) AND "actionType" = 'FM_PAGE_VIEWS'
        AND "actionData"->>'property_value' ~* '(gclid|gbraid|wbraid|gad_source|utm_medium=|utm_source=)'`
    for (const r of rows) {
      const network = adNetworkOfUrl(r.url)
      if (!network) continue
      const list = visits.get(r.contact) ?? []
      list.push({ at: r.at, network, url: r.url })
      visits.set(r.contact, list)
    }
  }
  return { wonAt, visits }
}
