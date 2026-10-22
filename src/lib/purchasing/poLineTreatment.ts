import type { getDb } from '@/lib/get-db'
import { effectiveTreatment, type Treatment } from '@/lib/purchasing/treatment'

/** Treatment for each PO line being created: the item master's for catalog lines, the line's
 * own pick for custom lines (default CONSUMABLE). See src/lib/purchasing/treatment.ts. */
export async function resolvePoLineTreatments(
  db: Pick<Awaited<ReturnType<typeof getDb>>, 'purchaseItem'>,
  lines: { itemId?: string | null; treatment?: string | null }[],
): Promise<Treatment[]> {
  const ids = [...new Set(lines.map(l => l.itemId).filter(Boolean) as string[])]
  const masters = ids.length ? await db.purchaseItem.findMany({ where: { id: { in: ids } }, select: { id: true, treatment: true } }) : []
  const map = new Map(masters.map(m => [m.id, m.treatment]))
  return lines.map(l => (l.itemId ? effectiveTreatment(null, map.get(l.itemId)) : effectiveTreatment(l.treatment, null)))
}
