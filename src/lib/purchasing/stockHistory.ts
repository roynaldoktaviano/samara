import type { getDb } from '@/lib/get-db'
import { toBaseQty } from '@/lib/purchasing/transferActions'
import { computeWarehousePositions, positionKey } from '@/lib/purchasing/warehousePosition'
import { warehouseHomeLocationId } from '@/lib/purchasing/warehouseHome'

type Db = Awaited<ReturnType<typeof getDb>>
const CLOSED_PR = ['CANCELLED', 'REJECTED'] as const

// Item by Location → row detail: the SAME columns as the table (Min · Current · PR · Reserve ·
// Ending · Ordered · PO · Pending · GR) for every document, all dates. Base units throughout.
//
//   Ship PR       a vessel PR taking this item from this warehouse. PR (requested) is ONE merged
//                 cell over its batches (user: "kayak merge cell"):
//                   batch 1 = the warehouse check  — Reserve sent from stock then
//                   batch n = each restock arrival that shipped part of its backorder
//                 per batch: Current = previous row's Ending + stock in/out since (a running
//                            ledger of free stock), Reserve = that batch, Ending = Current − Reserve
//                 Ordered (its To Be Order: restock lines to this warehouse + its own line when
//                 bought direct) and its PO / Pending / GR split sit on batch 1.
//   Warehouse PR  a PR delivered to this warehouse (Create Purchase Request on this page)
//   PO            a PO to this warehouse no PR line above accounts for
//
//   e.g. Min 3, PR 4:  batch 1  Current 2 · Reserve 2 · Ending 0 · Ordered 5 (→ GR 5)
//                      batch 2  Current 5 · Reserve 2 · Ending 3
//   The ledger starts from free stock before the first row (on hand then — today's stock walked
//   back through the movements since — minus pending transfers out at that moment).
export interface StockHistoryBatch {
  date: string
  /** "Warehouse check", "Restock arrived · PO-…", "Waiting warehouse check"… */
  label: string
  current: number | null
  reserve: number
  ending: number | null
  /** Stock movements this line stands for (GR / a single movement) — applied ON this line. */
  moves?: string[]
}
export interface StockHistoryRow {
  key: string
  /** MOVEMENT = stock in/out with no PR / PO (transfer, adjustment, opname, CariStok sync…). */
  kind: 'SHIP_PR' | 'WAREHOUSE_PR' | 'PO' | 'MOVEMENT'
  date: string
  doc: { id: string; number: string; status: string }
  /** Ship PR: the vessel it goes to. */
  destination: string | null
  /** Where the line is in the flow, e.g. "Waiting warehouse check", "Backorder 2 pcs". */
  stage: string
  minStock: number
  pr: number
  /** ≥ 1 — the PR cell spans them all. */
  batches: StockHistoryBatch[]
  ordered: number
  po: number
  pending: number
  gr: number
  /** MOVEMENT: signed qty in (+) / out (−). */
  change?: number
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
type Split = { ordered: number; po: number; pending: number; gr: number }
const emptySplit = (): Split => ({ ordered: 0, po: 0, pending: 0, gr: 0 })

/** null = item / location not found. */
export async function computeStockHistory(db: Db, itemId: string, locationId: string): Promise<{ rows: StockHistoryRow[]; totalStock: number } | null> {
  const [item, location] = await Promise.all([
    db.purchaseItem.findUnique({ where: { id: itemId }, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }),
    db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true, type: true } }),
  ])
  if (!item || !location) return null
  if (location.type !== 'WAREHOUSE') return { rows: [], totalStock: 0 }
  const conv = item.conversionFactor || 1

  const poSelect = { id: true, poNumber: true, status: true, items: { where: { itemId }, select: { orderedQty: true, receivedQty: true } } } as const
  const [shipLines, toWarehouseLines, poLines, lots, movements, { lineSource, positions }, homeId, warehouseCount, transfersOut, receipts] = await Promise.all([
    // Vessel PR lines that go through the warehouse check.
    db.purchaseRequestItem.findMany({
      where: { itemId, viaWarehouse: true, restockLocationId: null, verifyRejectedAt: null, request: { status: { notIn: [...CLOSED_PR] } } },
      select: {
        id: true, quantity: true, unit: true, warehouseDecision: true, warehouseApprovedAt: true, warehouseReserveQty: true,
        warehouseFromLocationId: true, backorderQty: true, backorderLocationId: true, convertedAt: true, warehouseCheckedAt: true,
        convertedPo: { select: poSelect },
        reservations: { select: { locationId: true, reservedQty: true, stockQty: true, source: true, poNumber: true, transferNumber: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        request: {
          select: {
            id: true, prNumber: true, status: true, createdAt: true, deliveryLocation: { select: { name: true } },
            transfers: { where: { status: { not: 'CANCELLED' } }, select: { fromLocationId: true, items: { where: { itemId }, select: { requestedQty: true } } } },
          },
        },
      },
    }),
    // Lines bought INTO this warehouse: restock lines riding on a vessel PR, or a PR delivered here.
    db.purchaseRequestItem.findMany({
      where: {
        itemId, verifyRejectedAt: null, request: { status: { notIn: [...CLOSED_PR] } },
        OR: [{ restockLocationId: locationId }, { restockLocationId: null, viaWarehouse: false, request: { deliveryLocationId: locationId } }],
      },
      select: {
        quantity: true, unit: true, convertedAt: true, restockLocationId: true,
        convertedPo: { select: poSelect },
        request: { select: { id: true, prNumber: true, status: true, createdAt: true, restockForRequestId: true } },
      },
    }),
    db.purchaseOrderItem.findMany({
      where: { itemId, order: { deliveryLocationId: locationId, status: { not: 'CANCELLED' } } },
      select: { orderedQty: true, receivedQty: true, order: { select: { id: true, poNumber: true, status: true, createdAt: true } } },
    }),
    db.stockLot.findMany({ where: { itemId, locationId, quantity: { gt: 0 } }, select: { quantity: true } }),
    db.stockMovement.findMany({
      where: { itemId, OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] },
      select: { id: true, fromLocationId: true, toLocationId: true, quantity: true, createdAt: true, type: true, referenceId: true, referenceType: true, notes: true },
      orderBy: { createdAt: 'desc' },
    }),
    computeWarehousePositions(db, { itemIds: [itemId] }),
    warehouseHomeLocationId(db),
    db.stockLocation.count({ where: { type: 'WAREHOUSE', isActive: true } }),
    db.stockTransfer.findMany({
      where: { fromLocationId: locationId, items: { some: { itemId } } },
      select: { id: true, status: true, createdAt: true, dispatchedAt: true, purchaseRequestId: true, items: { where: { itemId }, select: { requestedQty: true } } },
    }),
    // Goods receipts of this item into here — each one a "GR" line under its PR / PO.
    db.goodsReceipt.findMany({
      where: { locationId, items: { some: { itemId } } },
      select: { id: true, grNumber: true, orderId: true, receivedAt: true, order: { select: { poNumber: true } } },
    }),
  ])

  // What one movement did to THIS warehouse's on-hand. A transfer writes two rows that both carry
  // from = source, to = destination: TRANSFER_OUT (dispatch) moves the source, TRANSFER_IN
  // (receipt) moves the destination — never count a side twice.
  const effect = (m: { type: string; fromLocationId: string | null; toLocationId: string | null; quantity: number }) => {
    if (m.type === 'TRANSFER_OUT') return m.fromLocationId === locationId ? -m.quantity : 0
    if (m.type === 'TRANSFER_IN') return m.toLocationId === locationId ? m.quantity : 0
    return (m.toLocationId === locationId ? m.quantity : 0) - (m.fromLocationId === locationId ? m.quantity : 0)
  }
  // Stock on hand at a moment = today's stock minus every movement in/out of here since then.
  const stockNow = lots.reduce((s, l) => s + l.quantity, 0)
  const stockAt = (at: Date) => {
    let qty = stockNow
    for (const m of movements) {
      if (m.createdAt <= at) break
      qty -= effect(m)
    }
    return Math.max(0, Math.round(qty * 1000) / 1000)
  }

  // A PO line's arrived part is GR, the rest PO (purchase units → base, like receiveGoods()).
  const poSplit = (po: { id?: string; status: string; items: { orderedQty: number; receivedQty: number }[] } | null, qty: number, s: Split, row?: StockHistoryRow) => {
    s.ordered += qty
    if (!po) { s.pending += qty; return }
    if (po.id && row && !poRow.has(po.id)) poRow.set(po.id, row)
    const got = ['RECEIVED', 'COMPLETED'].includes(po.status) ? qty : Math.min(qty, po.items.reduce((t, i) => t + i.receivedQty, 0) * conv)
    s.gr += got
    s.po += qty - got
  }
  const usedPoIds = new Set<string>()
  // PO id → the row its receipts belong under.
  const poRow = new Map<string, StockHistoryRow>()
  const rows = new Map<string, StockHistoryRow & { _split: Split }>()
  const fmt = (n: number) => `${Math.round(n * 1000) / 1000} ${item.baseUnit}`
  const single = (at: Date, label: string): StockHistoryBatch[] => [{ date: at.toISOString(), label, current: stockAt(at), reserve: 0, ending: null }]

  // ── Ship PRs taking this item from here ─────────────────────────────────────────────────
  for (const l of shipLines) {
    const tr = l.request.transfers.find(t => t.items.length > 0)
    const source = l.warehouseFromLocationId ?? l.reservations[0]?.locationId ?? l.backorderLocationId ?? tr?.fromLocationId
      ?? lineSource.get(l.id) ?? (warehouseCount === 1 || homeId === locationId ? locationId : null)
    if (source !== locationId) continue
    const key = `PR:${l.request.id}`
    let row = rows.get(key)
    if (!row) {
      row = {
        key, kind: 'SHIP_PR', date: l.request.createdAt.toISOString(),
        doc: { id: l.request.id, number: l.request.prNumber, status: l.request.status },
        destination: l.request.deliveryLocation?.name ?? null, stage: '',
        minStock: item.minStock, pr: 0, batches: [],
        ordered: 0, po: 0, pending: 0, gr: 0, _split: emptySplit(),
      }
      rows.set(key, row)
    }
    const requested = toBaseQty(l.quantity, l.unit, item)
    row.pr += requested
    const processed = !!l.warehouseDecision || !!l.convertedAt
    if (processed) {
      const log = l.reservations.filter(r => r.locationId === locationId)
      if (log.length) {
        for (const r of log) row.batches.push({
          date: r.createdAt.toISOString(),
          label: r.source === 'BACKORDER' ? `Restock arrived${r.poNumber ? ` · ${r.poNumber}` : ''}` : 'Warehouse check',
          current: r.stockQty, reserve: r.reservedQty, ending: null,
        })
      } else {
        // Processed before the reservation log existed (or bought direct): one batch.
        const at = l.warehouseCheckedAt ?? l.request.createdAt
        const fromTr = l.request.transfers.filter(t => t.fromLocationId === locationId).flatMap(t => t.items).reduce((s, i) => s + i.requestedQty, 0)
        row.batches.push({ date: at.toISOString(), label: 'Warehouse check', current: stockAt(at), reserve: Math.min(requested, fromTr), ending: null })
      }
      if (l.warehouseDecision === 'PURCHASE') {
        // Bought straight to the ship — still this PR's To Be Order.
        if (l.convertedAt) { poSplit(l.convertedPo, requested, row._split); if (l.convertedPo) usedPoIds.add(l.convertedPo.id) }
        else { row._split.ordered += requested; row._split.pending += requested }
      }
      row.stage = l.backorderQty > 0 ? `Backorder ${fmt(l.backorderQty)} waiting restock` : l.warehouseDecision === 'PURCHASE' ? 'Bought direct' : 'Sent from stock'
    } else {
      const reserve = l.warehouseApprovedAt ? Math.min(requested, l.warehouseReserveQty ?? 0) : 0
      row.batches.push({
        date: (l.warehouseApprovedAt ?? l.request.createdAt).toISOString(),
        label: l.warehouseApprovedAt ? 'Approved — waiting Process' : 'Waiting warehouse check',
        // Free stock now — what the check would see (on hand − other holds), plus this line's own hold.
        current: Math.max(0, round3(stockNow - (positions.get(positionKey(itemId, locationId))?.reserve ?? 0) + reserve)), reserve, ending: null,
      })
      row.stage = l.warehouseApprovedAt ? 'Approved — waiting Process' : 'Waiting warehouse check'
    }
  }

  // ── Bought into this warehouse ──────────────────────────────────────────────────────────
  for (const l of toWarehouseLines) {
    const qty = toBaseQty(l.quantity, l.unit, item)
    // A restock line belongs to its vessel PR's row (same PR, or the legacy Restock PR's parent).
    const parent = rows.get(`PR:${l.request.id}`) ?? (l.request.restockForRequestId ? rows.get(`PR:${l.request.restockForRequestId}`) : undefined)
    let row = parent
    if (!row) {
      const key = `WPR:${l.request.id}`
      row = rows.get(key)
      if (!row) {
        row = {
          key, kind: 'WAREHOUSE_PR', date: l.request.createdAt.toISOString(),
          doc: { id: l.request.id, number: l.request.prNumber, status: l.request.status },
          destination: null, stage: l.restockLocationId ? 'Restock' : 'Restock for the warehouse',
          minStock: item.minStock, pr: 0, batches: single(l.request.createdAt, 'PR raised'),
          ordered: 0, po: 0, pending: 0, gr: 0, _split: emptySplit(),
        }
        rows.set(key, row)
      }
    }
    if (l.convertedAt && l.convertedPo) usedPoIds.add(l.convertedPo.id)
    if (l.convertedAt) poSplit(l.convertedPo, qty, row._split, row)
    else { row._split.ordered += qty; row._split.pending += qty }
  }

  // ── POs to this warehouse no PR line above accounts for ─────────────────────────────────
  for (const l of poLines) {
    if (usedPoIds.has(l.order.id)) continue
    const key = `PO:${l.order.id}`
    let row = rows.get(key)
    if (!row) {
      row = {
        key, kind: 'PO', date: l.order.createdAt.toISOString(),
        doc: { id: l.order.id, number: l.order.poNumber, status: l.order.status },
        destination: null, stage: 'Purchase order',
        minStock: item.minStock, pr: 0, batches: single(l.order.createdAt, 'PO created'),
        ordered: 0, po: 0, pending: 0, gr: 0, _split: emptySplit(),
      }
      rows.set(key, row)
    }
    poSplit({ id: l.order.id, status: l.order.status, items: [{ orderedQty: l.orderedQty, receivedQty: l.receivedQty }] }, l.orderedQty * conv, row._split, row)
  }

  // ── Each goods receipt = its own line under the PR / PO it arrived on (user: after GR the next
  // line shows the stock AFTER receiving, no PR on it). Current = Ending above + what arrived,
  // Reserve 0. A ship PR's backorder arrival already has its "Restock arrived" line — skip it there.
  // Receipts shown (or covered by "Restock arrived") under a PR / PO — never again as a movement line.
  const docMoveIds = new Set<string>()
  for (const gr of receipts) {
    const row = poRow.get(gr.orderId)
    if (!row) continue
    const mv = movements.filter(m => m.type === 'RECEIPT' && m.referenceId === gr.id)
    if (!mv.length) continue
    for (const m of mv) docMoveIds.add(m.id)
    const poNo = gr.order?.poNumber
    if (poNo && row.batches.some(b => b.label.startsWith('Restock arrived') && b.label.includes(poNo))) continue
    // The stock movement's time, not receivedAt — the ledger below walks movements.
    const at = mv.reduce((d, m) => m.createdAt > d ? m.createdAt : d, mv[0].createdAt)
    row.batches.push({ date: at.toISOString(), label: `Goods received · ${gr.grNumber}`, current: null, reserve: 0, ending: null, moves: mv.map(m => m.id) })
  }

  const round = (n: number) => Math.round(n * 1000) / 1000
  const folded: StockHistoryRow[] = [...rows.values()]
    .map(({ _split, ...r }) => ({
      ...r,
      pr: round(r.pr),
      // Several lines of the same item on one PR: batches on the same moment fold together.
      batches: r.batches
        .sort((a, b) => a.date.localeCompare(b.date))
        .reduce<StockHistoryBatch[]>((acc, b) => {
          const same = acc.find(x => x.date === b.date && x.label === b.label)
          if (same) { same.reserve += b.reserve; if (b.moves) same.moves = [...(same.moves ?? []), ...b.moves] } else acc.push({ ...b })
          return acc
        }, [])
        // Never below 0 — a shortage is what Ordered covers, not a negative stock.
        .map(b => ({ ...b, reserve: round(b.reserve), ending: b.current === null ? null : Math.max(0, round(b.current - b.reserve)) })),
      ordered: round(_split.ordered), po: round(_split.po), pending: round(_split.pending), gr: round(_split.gr),
    }))

  // ── Current / Ending as one running ledger of FREE stock (user: Current must follow on from the
  // Ending above it) ─────────────────────────────────────────────────────────────────────────
  //   Current = previous Ending + whatever came in / went out in between (GR, opname, usage…)
  //   Ending  = Current − Reserve
  // Sending out stock a PR already reserved doesn't move free stock (the Reserve already took it),
  // so those TRANSFER_OUTs are skipped; transfers without a PR still count as stock going out.
  const prTransferIds = new Set(transfersOut.filter(t => t.purchaseRequestId).map(t => t.id))
  const changes = movements
    .filter(m => !(m.type === 'TRANSFER_OUT' && m.referenceId && prTransferIds.has(m.referenceId)))
    .map(m => ({ m, id: m.id, at: m.createdAt.getTime(), qty: effect(m) }))
    .filter(c => c.qty !== 0)
    .sort((a, b) => a.at - b.at)

  // ── Stock in / out with no PR / PO since the first document — each its own line, so every
  // Ending runs on into the next and the last one lands on Total Stock (user: "21 → 11?").
  const docBatches = folded.flatMap(r => r.batches)
  const firstDoc = docBatches.reduce<number | null>((min, b) => { const t = new Date(b.date).getTime(); return min === null || t < min ? t : min }, null)
  if (firstDoc !== null) {
    const loose = changes.filter(c => c.at >= firstDoc && !docMoveIds.has(c.id))
    const locIds = [...new Set(loose.flatMap(c => [c.m.fromLocationId, c.m.toLocationId]).filter((x): x is string => !!x && x !== locationId))]
    const locName = new Map((locIds.length ? await db.stockLocation.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }) : []).map(l => [l.id, l.name]))
    for (const c of loose) {
      const { m } = c
      const label = movementLabel(m, n => locName.get(n) ?? null)
      folded.push({
        key: `MV:${m.id}`, kind: 'MOVEMENT', date: m.createdAt.toISOString(),
        doc: { id: m.id, number: label, status: m.type }, destination: null,
        stage: m.referenceType === 'CariStokImport' ? '' : (m.notes ?? ''),
        minStock: item.minStock, pr: 0,
        batches: [{ date: m.createdAt.toISOString(), label, current: null, reserve: 0, ending: null, moves: [m.id] }],
        ordered: 0, po: 0, pending: 0, gr: 0, change: round(c.qty),
      })
    }
  }

  const batches = folded.flatMap(r => r.batches).sort((a, b) => a.date.localeCompare(b.date))
  // A line's own movements land ON it (its Current already includes them); everything else is
  // picked up by the next line after it happened.
  const owned = new Set(batches.flatMap(b => b.moves ?? []))
  if (batches.length) {
    const t0 = new Date(new Date(batches[0].date).getTime() - 1)
    // Free at the start = on hand then − what pending transfers out were still holding then.
    const held = transfersOut
      .filter(t => t.status !== 'CANCELLED' && t.createdAt <= t0 && (!t.dispatchedAt || t.dispatchedAt > t0))
      .reduce((s, t) => s + t.items.reduce((u, i) => u + i.requestedQty, 0), 0)
    let free = Math.max(0, stockAt(t0) - held)
    let at = t0.getTime()
    for (const b of batches) {
      const until = new Date(b.date).getTime()
      for (const c of changes) if (c.at > at && c.at <= until && !owned.has(c.id)) free += c.qty
      if (b.moves) for (const c of changes) if (b.moves.includes(c.id)) free += c.qty
      at = until
      b.current = round(Math.max(0, free))
      b.ending = round(Math.max(0, b.current - b.reserve))
      free = b.ending
    }
  }

  // Oldest first (user) — each document a block, its batches in date order.
  // Total Stock = what's physically here now. Not the last Ending: usage / transfers after the
  // last document (e.g. after a GR) would otherwise be missing from it.
  const rowsOut = folded
    .map(r => ({ ...r, batches: r.batches.map(({ moves: _m, ...b }) => b) }))
    .sort((a, b) => a.batches[0].date.localeCompare(b.batches[0].date))
  return { rows: rowsOut, totalStock: round(stockNow) }
}

/** "Transfer out → Mischief", "Stock count", "CariStok sync"… for a movement with no PR / PO. */
function movementLabel(
  m: { type: string; referenceType: string | null; fromLocationId: string | null; toLocationId: string | null; notes: string | null },
  name: (id: string) => string | null,
): string {
  const to = m.toLocationId ? name(m.toLocationId) : null
  const from = m.fromLocationId ? name(m.fromLocationId) : null
  // Imported sheet rows carry what actually happened in their note ("CariStok keluar row 12: Transfer ke kapal · Otium").
  if (m.referenceType === 'CariStokImport') { const t = m.notes?.split(': ').slice(1).join(': ').trim(); if (t) return t }
  switch (m.referenceType) {
    case 'StockCount': return 'Stock count'
    case 'CariStokSync': return 'CariStok sync'
    case 'ItemImport': return 'Import adjustment'
    case 'CashierSale': return 'Cashier sale'
    case 'ConvertToStock': return 'Converted to stock'
  }
  switch (m.type) {
    case 'TRANSFER_OUT': return to ? `Transfer out → ${to}` : 'Transfer out'
    case 'TRANSFER_IN': return from ? `Transfer in ← ${from}` : 'Transfer in'
    case 'RECEIPT': return m.referenceType === 'GoodsReceipt' ? 'Goods received' : 'Stock in'
    case 'INITIAL': return 'Initial stock'
    case 'ADJUSTMENT': return 'Adjustment'
    default: return m.type.charAt(0) + m.type.slice(1).toLowerCase().replace(/_/g, ' ')
  }
}
