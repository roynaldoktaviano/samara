export type ValuationMethod = 'FIFO' | 'LIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD'

export interface ValuationLot {
  id: string
  locationId: string
  quantity: number
  costPerUnit: number
  createdAt: Date | string
  expiresAt?: Date | string | null
  batch?: string | null
}

export interface ConsumeLayer {
  lotId: string
  qty: number
  unitCost: number
}

export interface ConsumeResult {
  layers: ConsumeLayer[]
  totalCOGS: number
  avgUnitCost: number
  ok: boolean
  shortfall: number
}

/** Sort lots into the order they should be consumed, per valuation method. */
export function sortByMethod(lots: ValuationLot[], method: ValuationMethod): ValuationLot[] {
  const sorted = [...lots]
  if (method === 'FIFO') {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  } else if (method === 'LIFO') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  // WEIGHTED_AVERAGE and STANDARD don't need a specific lot order for selection
  return sorted
}

/**
 * Simulate consuming `qtyNeeded` units from `lots`, following the valuation method.
 * Does NOT mutate the input.
 *
 * For WEIGHTED_AVERAGE: blends all lot costs proportionally.
 * For STANDARD: uses `standardCost` for every unit.
 * For FIFO/LIFO: peels layers in date order.
 */
export function consumeLots(
  lots: ValuationLot[],
  qtyNeeded: number,
  method: ValuationMethod,
  standardCost = 0,
): ConsumeResult {
  const totalAvailable = lots.reduce((s, l) => s + l.quantity, 0)
  const shortfall = Math.max(0, qtyNeeded - totalAvailable)
  const canConsume = Math.min(qtyNeeded, totalAvailable)

  if (method === 'STANDARD') {
    return {
      layers: [{ lotId: 'STANDARD', qty: canConsume, unitCost: standardCost }],
      totalCOGS: canConsume * standardCost,
      avgUnitCost: standardCost,
      ok: shortfall === 0,
      shortfall,
    }
  }

  if (method === 'WEIGHTED_AVERAGE') {
    const totalValue = lots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0)
    const wa = totalAvailable > 0 ? totalValue / totalAvailable : 0
    return {
      layers: lots.map(l => ({ lotId: l.id, qty: Math.min(l.quantity, canConsume * (l.quantity / totalAvailable)), unitCost: wa })),
      totalCOGS: canConsume * wa,
      avgUnitCost: wa,
      ok: shortfall === 0,
      shortfall,
    }
  }

  // FIFO or LIFO — peel layers in order
  const ordered = sortByMethod(lots, method)
  const layers: ConsumeLayer[] = []
  let remaining = canConsume

  for (const lot of ordered) {
    if (remaining <= 0) break
    const take = Math.min(lot.quantity, remaining)
    layers.push({ lotId: lot.id, qty: take, unitCost: lot.costPerUnit })
    remaining -= take
  }

  const totalCOGS = layers.reduce((s, l) => s + l.qty * l.unitCost, 0)
  const consumed = layers.reduce((s, l) => s + l.qty, 0)

  return {
    layers,
    totalCOGS,
    avgUnitCost: consumed > 0 ? totalCOGS / consumed : 0,
    ok: shortfall === 0,
    shortfall,
  }
}

/** Compute total stock value for a set of lots using the specified method. */
export function computeStockValue(
  lots: ValuationLot[],
  method: ValuationMethod,
  standardCost = 0,
): number {
  if (method === 'STANDARD') {
    return lots.reduce((s, l) => s + l.quantity * standardCost, 0)
  }
  // FIFO, LIFO, and WEIGHTED_AVERAGE all use actual lot costs for valuation
  return lots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0)
}

export function methodLabel(method: ValuationMethod): string {
  const labels: Record<ValuationMethod, string> = {
    FIFO: 'First In, First Out',
    LIFO: 'Last In, First Out',
    WEIGHTED_AVERAGE: 'Weighted Average',
    STANDARD: 'Standard Cost',
  }
  return labels[method] ?? method
}
