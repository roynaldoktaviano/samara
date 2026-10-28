import type { getDb } from '@/lib/get-db'
import { notifyByRoleForRequest, notifyPurchasingForRequest } from '@/lib/notify-purchasing'

// A PR item with `itemId: null` is a "custom request" — not tied to any catalog/stock
// item, so Warehouse has nothing to physically check for it (see warehouse-forward's own
// `undecided` filter, which already excludes these). When every item on a PR is custom,
// the whole "Cek Gudang" stage is pointless and the PR should go straight to Purchasing.
export function allItemsCustom(items: { itemId: string | null }[]): boolean {
  return items.length > 0 && items.every(i => !i.itemId)
}

// ── Routing: Warehouse first, or straight to Purchasing ──
// A line goes through Warehouse's stock check when the PR is headed to a ship (VESSEL — the
// yacht itself or its Galley/Bar) and it's a catalog item, non-stock ones included: nothing is
// bought straight to a ship — it's restocked into the warehouse and shipped from there. Only
// custom lines (no catalog item) go straight to Purchasing. Anything for a warehouse, an
// office/site (Office Bali, Bira) or with no destination goes straight to Purchasing — Warehouse
// isn't involved at all. A PR holding both kinds runs in parallel — see
// PurchaseRequest.warehouseDoneAt. This is the one place that decides the route.
export async function routePrLines(
  db: Pick<Awaited<ReturnType<typeof getDb>>, 'stockLocation'>,
  deliveryLocationId: string | null,
  lines: { itemId?: string | null }[],
): Promise<boolean[]> {
  const loc = deliveryLocationId
    ? await db.stockLocation.findUnique({ where: { id: deliveryLocationId }, select: { type: true } })
    : null
  if (loc?.type !== 'VESSEL') return lines.map(() => false)
  return lines.map(l => !!l.itemId)
}

/** Status a PR enters once submitted/approved: DRAFT (Warehouse) only when every line needs
 * Warehouse; any direct line puts it ON_PROCESS right away so Purchasing can start on those. */
export function initialPrStatus(viaWarehouse: boolean[]): 'DRAFT' | 'ON_PROCESS' {
  return viaWarehouse.length > 0 && viaWarehouse.every(Boolean) ? 'DRAFT' : 'ON_PROCESS'
}

const WAREHOUSE_ROLES = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

/** Tell each side about its share of a newly submitted/approved PR — Purchasing about the
 * direct lines, Warehouse about the lines waiting for a stock check. Best-effort. */
export async function notifyPrRouted(
  db: Awaited<ReturnType<typeof getDb>>,
  pr: { id: string; prNumber: string; division: string | null },
  viaWarehouse: boolean[],
  opts: { type: string; skipPurchasing?: boolean; skipWarehouse?: boolean },
) {
  const toWarehouse = viaWarehouse.filter(Boolean).length
  const direct = viaWarehouse.length - toWarehouse
  const n = (k: number) => `${k} item${k === 1 ? '' : 's'}`
  try {
    if (direct > 0 && !opts.skipPurchasing) {
      await notifyPurchasingForRequest(
        db, pr.division, opts.type, 'New purchase request',
        `${pr.prNumber} — ${n(direct)} go straight to Purchasing${toWarehouse ? `; ${n(toWarehouse)} are being stock-checked by Warehouse in parallel` : ''}.`,
        pr.id,
      )
    }
    if (toWarehouse > 0 && !opts.skipWarehouse) {
      await notifyByRoleForRequest(
        db, WAREHOUSE_ROLES, opts.type, 'Purchase request needs a stock check',
        `${pr.prNumber} — ${n(toWarehouse)} waiting for a stock check.`,
        pr.id,
      )
    }
  } catch (e) {
    console.error('notifyPrRouted failed', e)
  }
}
