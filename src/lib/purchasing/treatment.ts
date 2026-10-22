// How an item is treated once it reaches a ship (PurchaseItem.treatment / PurchaseOrderItem.treatment).
// Client-safe — no server imports — so forms can share the labels and defaults.
//   CONSUMABLE → used up on board → trip usage (SHIP_USAGE), charged to the trip
//   ASSET      → durable equipment → becomes an InventoryItem in the PO line's Room/Category,
//                never a trip cost
//   SPARE_PART → ship upkeep → usage type MAINTENANCE, reported per ship, never a trip cost

export type Treatment = 'CONSUMABLE' | 'ASSET' | 'SPARE_PART'

export const TREATMENTS: { value: Treatment; label: string; hint: string }[] = [
  { value: 'CONSUMABLE', label: 'Consumable', hint: 'Used up on board — counted as trip usage' },
  { value: 'ASSET', label: 'Asset', hint: 'Durable equipment — added to the ship Inventory, not a trip cost' },
  { value: 'SPARE_PART', label: 'Spare part', hint: 'Ship maintenance cost — not charged to a trip' },
]
export const TREATMENT_LABEL: Record<Treatment, string> = Object.fromEntries(TREATMENTS.map(t => [t.value, t.label])) as Record<Treatment, string>

/** Starting value for a new item of this Item Type — editable on the item afterwards. */
export function defaultTreatmentForType(type: string | null | undefined): Treatment {
  return type === 'MAINTENANCE' ? 'SPARE_PART' : 'CONSUMABLE'
}

/** A PO line's effective treatment: its own snapshot, else the item master's, else CONSUMABLE. */
export function effectiveTreatment(line: string | null | undefined, master: string | null | undefined): Treatment {
  return ((line ?? master) as Treatment | null | undefined) ?? 'CONSUMABLE'
}

/** Usage ledger type for goods of this treatment arriving on a ship. ASSET → none (it's Inventory). */
export function usageTypeForTreatment(t: Treatment): 'SHIP_USAGE' | 'MAINTENANCE' | null {
  return t === 'ASSET' ? null : t === 'SPARE_PART' ? 'MAINTENANCE' : 'SHIP_USAGE'
}
