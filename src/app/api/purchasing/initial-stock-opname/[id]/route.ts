import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const count = await db.stockCount.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, category: true } } },
        orderBy: { itemName: 'asc' },
      },
    },
  })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  return NextResponse.json(count)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { items, notes, status } = await req.json()

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  // Once finalized, only the person who did the opname can correct it — not any
  // Admin/Finance Director who happens to have access to this menu.
  const isCorrection = count.status === 'COMPLETED'
  if (isCorrection && count.countedById !== session.user.id) {
    return NextResponse.json({ error: 'Hanya orang yang melakukan opname ini yang bisa mengoreksi' }, { status: 403 })
  }

  if (items?.length) {
    await Promise.all(
      items.map((item: { id: string; countedQty: number }) =>
        db.stockCountItem.update({ where: { id: item.id }, data: { countedQty: item.countedQty } })
      )
    )
  }

  const updated = await db.stockCount.update({
    where: { id },
    data: {
      ...(notes !== undefined ? { notes } : {}),
      ...(status === 'COMPLETED' ? { status: 'COMPLETED', approvedById: session.user.id, approvedAt: new Date() } : {}),
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, category: true } } },
        orderBy: { itemName: 'asc' },
      },
    },
  })

  if (status === 'COMPLETED') {
    const movementType = isCorrection ? 'INITIAL_CORRECTION' : 'INITIAL'
    for (const ci of updated.items) {
      if (!ci.itemId) continue

      const existingLot = await db.stockLot.findFirst({ where: { itemId: ci.itemId, locationId: updated.locationId } })
      const previousQty = existingLot?.quantity ?? 0
      const variance = ci.countedQty - previousQty
      if (variance === 0 && existingLot) continue

      if (existingLot) {
        await db.stockLot.update({ where: { id: existingLot.id }, data: { quantity: ci.countedQty } })
      } else if (ci.countedQty > 0) {
        await db.stockLot.create({ data: { id: crypto.randomUUID(), itemId: ci.itemId, locationId: updated.locationId, quantity: ci.countedQty, costPerUnit: 0, updatedAt: new Date() } })
      }

      if (variance !== 0) {
        await db.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            itemId: ci.itemId,
            toLocationId: variance > 0 ? updated.locationId : null,
            fromLocationId: variance < 0 ? updated.locationId : null,
            quantity: Math.abs(variance),
            type: movementType,
            referenceId: updated.id,
            referenceType: 'STOCK_COUNT',
            notes: `Stock Opname Awal ${updated.countNumber}`,
            createdById: session.user.id,
          },
        })
      }
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (count.status === 'COMPLETED') return NextResponse.json({ error: 'Opname yang sudah selesai tidak bisa dihapus' }, { status: 400 })

  await db.stockCount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
