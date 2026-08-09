// Purchase value bands from Samara Group's Purchasing Approval Matrix (v1.0, 30 Jul 2026) —
// used here only to derive how many quotations a PurchaseRequestItem needs on file for
// KPI 5 (compliance/commercial discipline). The full multi-level approval routing the
// matrix also defines (Dept Head / Finance Director / Group CEO per band) is deliberately
// NOT implemented yet — deferred until the company's org structure is finalized. Bands
// C/D/E's extra paperwork (written recommendation, technical+commercial evaluation, formal
// business case) is likewise not modeled — only the 1/2/3 quotation count is tracked.

export type PurchaseBand = 'A' | 'B' | 'C' | 'D' | 'E'

export function getBand(value: number): PurchaseBand {
  if (value <= 2_000_000) return 'A'
  if (value <= 10_000_000) return 'B'
  if (value <= 50_000_000) return 'C'
  if (value <= 250_000_000) return 'D'
  return 'E'
}

export function requiredQuotationCount(band: PurchaseBand): number {
  if (band === 'A') return 1
  if (band === 'B') return 2
  return 3
}

// A supplier with this many (or more) non-cancelled past orders on file is treated as an
// established/recurring relationship — Purchasing no longer needs fresh quotations to prove
// the price is fair, per the Approval Matrix's "recurring supplier agreement" exemption.
export const RECURRING_SUPPLIER_ORDER_THRESHOLD = 3

export const BAND_LABEL: Record<PurchaseBand, string> = {
  A: 'Band A (up to Rp 2,000,000)',
  B: 'Band B (Rp 2,000,000 – 10,000,000)',
  C: 'Band C (Rp 10,000,000 – 50,000,000)',
  D: 'Band D (Rp 50,000,000 – 250,000,000)',
  E: 'Band E (above Rp 250,000,000)',
}
