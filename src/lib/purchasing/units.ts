import { formatNumber } from '@/lib/format'

// Display rules for item quantities. Client-safe (no server imports).
//
// Stock is always STORED in the item's base unit — for drinks that's ml, so a POS recipe can deduct
// 45 ml of rum. But the warehouse and purchasing think in bottles: whenever an item has a real
// purchase unit (1 pcs = 750 ml, 1 carton = 24 pcs), quantities are SHOWN in the purchase unit with
// the base amount as a small subtitle ("2.8 pcs · 2100 ml").

export type UnitInfo = { baseUnit?: string | null; purchaseUnit?: string | null; conversionFactor?: number | null }

const MEASURE_UNITS = new Set(['ml', 'cl', 'l', 'liter', 'litre', 'g', 'gr', 'gram', 'kg'])

/** Volume/weight units — only meaningful for POS recipes, never for counting stock by hand. */
export function isMeasureUnit(unit: string | null | undefined) {
  return !!unit && MEASURE_UNITS.has(unit.trim().toLowerCase())
}

export function hasPurchaseUnit(u: UnitInfo) {
  return !!(u.purchaseUnit && u.baseUnit && u.purchaseUnit !== u.baseUnit && (u.conversionFactor ?? 1) > 1)
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Base-unit quantity → what to show: the purchase-unit amount, plus the base amount when converted. */
export function displayQty(u: UnitInfo, baseQty: number): { qty: number; unit: string; baseQty: number | null; baseUnit: string } {
  const baseUnit = u.baseUnit ?? ''
  if (!hasPurchaseUnit(u)) return { qty: round3(baseQty), unit: baseUnit, baseQty: null, baseUnit }
  return { qty: round3(baseQty / (u.conversionFactor as number)), unit: u.purchaseUnit as string, baseQty: round3(baseQty), baseUnit }
}

/** Like displayQty, but a countable base unit (pcs) stays as is unless it makes whole purchase
 *  units — 2 cans of a 6-can box read "2 pcs", not "0.33 box". Volume/weight (ml) always goes to
 *  the purchase unit (bottles). */
export function naturalQty(u: UnitInfo, baseQty: number) {
  if (hasPurchaseUnit(u) && !isMeasureUnit(u.baseUnit) && round3(baseQty / (u.conversionFactor as number)) % 1 !== 0) {
    return displayQty({ baseUnit: u.baseUnit }, baseQty)
  }
  return displayQty(u, baseQty)
}

/** Cost per base unit → cost per displayed unit. */
export function displayUnitCost(u: UnitInfo, costPerBase: number) {
  return hasPurchaseUnit(u) ? costPerBase * (u.conversionFactor as number) : costPerBase
}

/** One-line label, e.g. "2.8 pcs (2100 ml)" or "12 pcs". */
export function qtyLabel(u: UnitInfo, baseQty: number) {
  const d = displayQty(u, baseQty)
  const f = (n: number) => formatNumber(n, { decimals: 3 })
  return d.baseQty === null ? `${f(d.qty)} ${d.unit}`.trim() : `${f(d.qty)} ${d.unit} (${f(d.baseQty)} ${d.baseUnit})`
}
