import type { PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'stockLot' | 'purchaseItem'>

/**
 * Current cost per base unit of each item, for recipe cost estimates: the weighted average of
 * its costed lots across all locations (the moving-average cost), falling back to the item's
 * last purchase cost when no lot carries a cost yet.
 */
export async function itemBaseCosts(db: Db, itemIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(itemIds)]
  if (!ids.length) return new Map()
  const [lots, items] = await Promise.all([
    db.stockLot.findMany({ where: { itemId: { in: ids }, quantity: { gt: 0 }, costPerUnit: { gt: 0 } }, select: { itemId: true, quantity: true, costPerUnit: true } }),
    db.purchaseItem.findMany({ where: { id: { in: ids } }, select: { id: true, standardCost: true } }),
  ])
  const agg = new Map<string, { qty: number; value: number }>()
  for (const l of lots) {
    const a = agg.get(l.itemId!) ?? { qty: 0, value: 0 }
    a.qty += l.quantity
    a.value += l.quantity * l.costPerUnit
    agg.set(l.itemId!, a)
  }
  const out = new Map<string, number>()
  for (const it of items) {
    const a = agg.get(it.id)
    out.set(it.id, a && a.qty > 0 ? a.value / a.qty : it.standardCost ?? 0)
  }
  return out
}

export const RECIPE_INCLUDE = {
  category: { select: { id: true, name: true } },
  yacht: { select: { id: true, name: true } },
  lines: { include: { item: { select: { id: true, sku: true, name: true, baseUnit: true } } } },
} as const

/** Adds the estimated ingredient cost (current moving-average cost) to each recipe line and total. */
export async function withRecipeCost<T extends { lines: { itemId: string; qty: number }[] }>(db: Db, recipes: T[]) {
  const costs = await itemBaseCosts(db, recipes.flatMap(r => r.lines.map(l => l.itemId)))
  return recipes.map(r => {
    const lines = r.lines.map(l => ({ ...l, unitCost: costs.get(l.itemId) ?? 0, cost: (costs.get(l.itemId) ?? 0) * l.qty }))
    return { ...r, lines, cost: lines.reduce((s, l) => s + l.cost, 0) }
  })
}

export interface RecipeLineInput { itemId: string; qty: number }

/** Validates recipe lines: at least one, each with an item and a positive qty, no duplicates. */
export function parseRecipeLines(lines: unknown): { ok: true; lines: RecipeLineInput[] } | { ok: false; error: string } {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: 'Add at least one ingredient' }
  const out: RecipeLineInput[] = []
  const seen = new Set<string>()
  for (const l of lines as { itemId?: string; qty?: number }[]) {
    const qty = Number(l?.qty)
    if (!l?.itemId) return { ok: false, error: 'Every ingredient needs an item' }
    if (!(qty > 0)) return { ok: false, error: 'Every ingredient needs a quantity above 0' }
    if (seen.has(l.itemId)) return { ok: false, error: 'The same item is listed twice' }
    seen.add(l.itemId)
    out.push({ itemId: l.itemId, qty })
  }
  return { ok: true, lines: out }
}
