import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { canUseInitialOpname } from '@/lib/purchasing/initialOpnameScope'
import { parseOpnameItemForm } from '@/lib/purchasing/initialOpnameItem'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR', 'WAREHOUSE']

// Converts a Non-Stock row of a Stock Opname Awal into a Stock Item, using the same
// form as Items & Pricing' Add Item. Non-stock rows are either a legacy PurchaseItem with
// isStockTracked=false, or a non-catalog lot (itemId null, just an itemName).
//
// Non-catalog lots at this location carrying that name (one per PO receipt) are folded
// into ONE catalog lot for the item — catalog stock is one running balance per
// item+location — so the qty isn't counted twice; the emptied lots stay for PO
// traceability. Sibling opname rows of the same name collapse into this one, and the
// usual Simpan/Selesaikan then sets the counted qty against that lot.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  if (!(await canUseInitialOpname(db, role, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (count.status === 'COMPLETED' && count.countedById !== session.user.id) {
    return NextResponse.json({ error: 'Hanya orang yang melakukan opname ini yang bisa mengoreksi' }, { status: 403 })
  }

  const row = await db.stockCountItem.findUnique({ where: { id: itemId }, include: { item: { select: { id: true, name: true, isStockTracked: true } } } })
  if (!row || row.countId !== id) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (row.item?.isStockTracked) return NextResponse.json({ error: 'Produk ini sudah Stock Item' }, { status: 409 })

  const body = await req.json()
  const parsed = await parseOpnameItemForm(db, body, row.itemId ?? undefined)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const sourceName = (row.item?.name ?? row.itemName).trim()

  await db.$transaction(async tx => {
    const item = row.itemId
      ? await tx.purchaseItem.update({
          where: { id: row.itemId },
          data: { ...parsed.data, isStockTracked: true, currentLocationId: null, updatedAt: new Date() },
        })
      : await tx.purchaseItem.create({
          data: { id: crypto.randomUUID(), ...parsed.data, isStockTracked: true, updatedAt: new Date() },
        })

    const looseLots = await tx.stockLot.findMany({
      where: { itemId: null, locationId: count.locationId, itemName: { equals: sourceName, mode: 'insensitive' }, quantity: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    })
    const looseQty = looseLots.reduce((s, l) => s + l.quantity, 0)
    let systemQty = 0

    const catalogLot = await tx.stockLot.findFirst({ where: { itemId: item.id, locationId: count.locationId } })
    if (looseQty > 0) {
      const looseValue = looseLots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0)
      const baseQty = catalogLot?.quantity ?? 0
      const totalQty = baseQty + looseQty
      const avgCost = (baseQty * (catalogLot?.costPerUnit ?? 0) + looseValue) / totalQty
      if (catalogLot) {
        await tx.stockLot.update({ where: { id: catalogLot.id }, data: { quantity: totalQty, costPerUnit: avgCost } })
      } else {
        await tx.stockLot.create({
          data: { id: crypto.randomUUID(), itemId: item.id, locationId: count.locationId, quantity: totalQty, costPerUnit: avgCost, updatedAt: new Date() },
        })
      }
      await tx.stockLot.updateMany({ where: { id: { in: looseLots.map(l => l.id) } }, data: { quantity: 0 } })
      systemQty = totalQty
    } else {
      systemQty = catalogLot?.quantity ?? 0
    }

    // Collapse other non-stock rows of the same name in this opname into this row.
    const siblings = await tx.stockCountItem.findMany({
      where: { countId: id, id: { not: row.id }, itemId: null, itemName: { equals: sourceName, mode: 'insensitive' } },
      select: { id: true, countedQty: true },
    })
    if (siblings.length) await tx.stockCountItem.deleteMany({ where: { id: { in: siblings.map(s => s.id) } } })

    const qty = body.qty !== undefined && body.qty !== '' ? Number(body.qty) || 0 : row.countedQty + siblings.reduce((s, r) => s + r.countedQty, 0)
    await tx.stockCountItem.update({
      where: { id: row.id },
      data: { itemId: item.id, itemName: item.name, systemQty, countedQty: qty },
    })
  })

  return NextResponse.json({ ok: true })
}
