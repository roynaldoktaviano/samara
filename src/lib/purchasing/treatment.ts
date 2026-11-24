// An item's "Type" in the UI (PurchaseItem.treatment / PurchaseOrderItem.treatment) — how it is
// treated once it reaches a ship. Client-safe — no server imports — so forms can share the labels.
//   TRADING    → bought to resell (bar beverages) → same flow as CONSUMABLE; the bar/POS location
//                rules (HOLD_AS_STOCK) decide whether it is held as stock or used up
//   CONSUMABLE → used up on board → trip usage (SHIP_USAGE), charged to the trip
//   ASSET      → durable equipment → becomes an InventoryItem in the PO line's Room/Category,
//                never a trip cost
// SPARE_PART is a retired value (merged into CONSUMABLE 2026-11-16). It stays in the DB enum so
// old rows / un-migrated tenants never break, and is read as CONSUMABLE everywhere.
//
// NB: the UI labels shifted at the same time — PurchaseItem.type (Beverage, Food…) is shown as
// "Category" and PurchaseItem.category (Champagne, Red Wine…) as "Sub-Category".

export type Treatment = 'TRADING' | 'CONSUMABLE' | 'ASSET'

export const TREATMENTS: { value: Treatment; label: string; hint: string }[] = [
  { value: 'TRADING', label: 'Trading', hint: 'Bought to resell (e.g. bar beverages)' },
  { value: 'CONSUMABLE', label: 'Consumable', hint: 'Used up on board — counted as trip usage' },
  { value: 'ASSET', label: 'Asset', hint: 'Durable equipment — added to the ship Inventory, not a trip cost' },
]
export const TREATMENT_LABEL: Record<Treatment, string> = Object.fromEntries(TREATMENTS.map(t => [t.value, t.label])) as Record<Treatment, string>

/** Normalise any stored value (incl. legacy SPARE_PART / null) to a current Treatment. */
export function normalizeTreatment(t: string | null | undefined): Treatment | null {
  if (t === 'TRADING' || t === 'CONSUMABLE' || t === 'ASSET') return t
  if (t === 'SPARE_PART') return 'CONSUMABLE'
  return null
}

/** Starting value for a new item of this Category (PurchaseItem.type) — editable afterwards. */
export function defaultTreatmentForType(type: string | null | undefined): Treatment {
  if (type === 'BEVERAGE') return 'TRADING'
  if (type === 'ASSET') return 'ASSET'
  return 'CONSUMABLE'
}

/** A PO line's effective treatment: its own snapshot, else the item master's, else CONSUMABLE. */
export function effectiveTreatment(line: string | null | undefined, master: string | null | undefined): Treatment {
  return normalizeTreatment(line) ?? normalizeTreatment(master) ?? 'CONSUMABLE'
}

/** Usage ledger type for goods of this treatment arriving on a ship. ASSET → none (it's Inventory). */
export function usageTypeForTreatment(t: Treatment): 'SHIP_USAGE' | null {
  return t === 'ASSET' ? null : 'SHIP_USAGE'
}
