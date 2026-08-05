import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

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
      approvedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, standardCost: true } } },
        orderBy: { itemName: 'asc' },
      },
    },
  })
  if (!count) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  return NextResponse.json(count)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { items, status, notes, photoKey } = await req.json()

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (count.status === 'APPROVED') return NextResponse.json({ error: 'Opname yang sudah disetujui tidak bisa diubah' }, { status: 400 })

  // Validate photo required on approve
  const incomingPhoto = photoKey ?? count.photoKey
  if (status === 'APPROVED' && !incomingPhoto) {
    return NextResponse.json({ error: 'Foto wajib diupload sebelum approve' }, { status: 400 })
  }

  // Update each item's counted qty + reason
  if (items?.length) {
    await Promise.all(
      items.map((item: { id: string; countedQty: number; reason?: string }) =>
        db.stockCountItem.update({ where: { id: item.id }, data: { countedQty: item.countedQty, reason: item.reason ?? null } })
      )
    )
  }

  const updated = await db.stockCount.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(incomingPhoto ? { photoKey: incomingPhoto } : {}),
      ...(status === 'APPROVED' ? { approvedById: session.user.id, approvedAt: new Date() } : {}),
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, standardCost: true } } },
        orderBy: { itemName: 'asc' },
      },
    },
  })

  if (status === 'APPROVED') {
    for (const ci of updated.items) {
      const variance = ci.countedQty - ci.systemQty
      if (!ci.itemId) continue

      // Apply stock adjustment
      const existingLot = await db.stockLot.findFirst({ where: { itemId: ci.itemId, locationId: updated.locationId } })
      if (existingLot) {
        await db.stockLot.update({ where: { id: existingLot.id }, data: { quantity: ci.countedQty } })
      } else if (ci.countedQty > 0) {
        await db.stockLot.create({ data: { id: crypto.randomUUID(), itemId: ci.itemId, locationId: updated.locationId, quantity: ci.countedQty, costPerUnit: 0, updatedAt: new Date() } })
      }

      // Record movement
      if (variance !== 0) {
        await db.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            itemId: ci.itemId,
            toLocationId: variance > 0 ? updated.locationId : null,
            fromLocationId: variance < 0 ? updated.locationId : null,
            quantity: Math.abs(variance),
            type: 'ADJUSTMENT',
            referenceId: updated.id,
            referenceType: 'STOCK_COUNT',
            notes: `Opname ${updated.countNumber}`,
            createdById: session.user.id,
          },
        })

        // Auto-create Stock Count Variance exception
        const standardCost = ci.item?.standardCost ?? 0
        const varianceValue = Math.abs(variance) * standardCost
        await db.inventoryException.create({
          data: {
            id: crypto.randomUUID(),
            type: 'STOCK_COUNT_VARIANCE',
            itemId: ci.itemId,
            itemName: ci.itemName,
            locationId: updated.locationId,
            locationName: updated.location.name,
            qty: Math.abs(variance),
            value: varianceValue,
            reason: ci.reason ?? `Variance ${variance > 0 ? '+' : ''}${variance} ${ci.item?.baseUnit ?? ''} saat opname ${updated.countNumber}`,
            referenceId: updated.id,
            referenceType: 'StockCount',
            status: 'OPEN',
            updatedAt: new Date(),
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
  if (!count) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (count.status === 'APPROVED') return NextResponse.json({ error: 'Opname yang sudah disetujui tidak bisa dihapus' }, { status: 400 })

  await db.stockCount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
