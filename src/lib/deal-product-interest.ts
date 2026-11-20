import type { TripType, WhatsappBrand } from '@prisma/client'

// Deal "Product Interest" = which yacht the enquiry is for. Freshsales stores it as "<type> / <yacht>"
// ("PC / S2", "OT / S1", "SV / Otium" …); the ERP keeps the two halves apart: PC / OT in Deal.tripType,
// the yacht in Deal.productInterest — same vocabulary as Lead.productInterest (the Yachts list:
// "Samara I", "Samara II", "Otium", "Mischief"), so reports can split S1 / S2 / Otium / Mischief.
// Inference ported from Freshsales snippet 92 (gb_fs_product_interest / gb_dm_pi_from_page).

export const YACHT_S1 = 'Samara I'
export const YACHT_S2 = 'Samara II'
export const YACHT_OTIUM = 'Otium'
export const YACHT_MISCHIEF = 'Mischief'
export const YACHT_S1_S2 = 'Samara I + Samara II'

/** Yacht named in free text (form trip type, Meta form "vessel", a Freshsales value). Null = not named. */
export function yachtFromText(text: string | null | undefined): string | null {
  const t = (text ?? '').toLowerCase()
  if (!t.trim()) return null
  if (/mischief/.test(t)) return YACHT_MISCHIEF
  if (/otium/.test(t)) return YACHT_OTIUM
  const s2 = /samara\s*(ii|2)\b|\bs2\b/.test(t)
  const s1 = /samara\s*(i|1)\b|\bs1\b/.test(t)
  if (s1 && s2) return YACHT_S1_S2
  if (s2) return YACHT_S2
  if (s1) return YACHT_S1
  return null
}

/** Yacht from the page the guest was on (form page / WhatsApp tap page). */
export function yachtFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let host = '', path = ''
  try { const u = new URL(url); host = u.hostname.toLowerCase(); path = u.pathname.toLowerCase() } catch { return null }
  if (/otium/.test(host) || /\/yacht\/otium(\/|$)/.test(path)) return YACHT_OTIUM
  if (/mischief/.test(host) || /\/yacht\/mischief(\/|$)/.test(path)) return YACHT_MISCHIEF
  if (/samara-ii/.test(path)) return YACHT_S2
  if (/samara-i(-|\/|$)/.test(path)) return YACHT_S1
  // Samara's open trips run on Samara I (snippet 92: shared-trip / open-trip / thankyou-ot → "OT / S1")
  if (/\/(shared-trip|open-trip|thankyou-ot)(\/|$)/.test(path)) return YACHT_S1
  return null
}

/**
 * Best guess for a new enquiry's yacht: what the guest typed / picked, else the page, else the brand
 * (Otium / Mischief are one yacht each), else a Samara open trip = Samara I. Null when unknown —
 * sales pick it on the deal.
 */
export function inferDealYacht(p: { text?: string | null; url?: string | null; brand?: WhatsappBrand | null; tripType?: TripType | null }): string | null {
  return yachtFromText(p.text) ?? yachtFromUrl(p.url)
    ?? (p.brand === 'OTIUM' ? YACHT_OTIUM : p.brand === 'MISCHIEF' ? YACHT_MISCHIEF : null)
    ?? (p.tripType === 'OPEN_TRIP' && (p.brand ?? 'SAMARA') === 'SAMARA' && !/samara\s*(ii|2)\b|\bs2\b/i.test(p.text ?? '') ? YACHT_S1 : null)
}

/** Freshsales cf_product_interest → ERP yacht ("PC / S2" → "Samara II"). Old / "do not use" values → null. */
export function yachtFromFreshsales(pi: string | null | undefined): string | null {
  const t = (pi ?? '').trim()
  if (!t || /do not use|^tp\b/i.test(t)) return null
  return yachtFromText(t)
}
