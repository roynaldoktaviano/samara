import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { CONSUMPTION_MODES } from '@/lib/purchasing/consumptionMode'
import type { StockConsumptionMode } from '@prisma/client'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, type, yachtId, parentId, manager, address, storageClass, managedBy, isActive, consumptionMode, isPosBar } = body
  if (!name?.trim() || !type) return NextResponse.json({ error: 'name dan type wajib diisi' }, { status: 400 })
  if (type === 'VESSEL' && !yachtId) return NextResponse.json({ error: 'Pilih kapal untuk lokasi tipe Kapal' }, { status: 400 })
  if (consumptionMode && !CONSUMPTION_MODES.includes(consumptionMode)) return NextResponse.json({ error: 'Invalid consumption mode' }, { status: 400 })
  // Both fields are optional on PUT (e.g. the active toggle doesn't send them) — only touched when sent.
  // A non-VESSEL location can never be a POS bar.
  const posBar = isPosBar === undefined ? (type === 'VESSEL' ? undefined : false) : type === 'VESSEL' && Boolean(isPosBar)
  const location = await db.$transaction(async (tx) => {
    if (posBar) await tx.stockLocation.updateMany({ where: { yachtId, isPosBar: true, id: { not: id } }, data: { isPosBar: false } })
    return tx.stockLocation.update({
      where: { id },
      data: {
        name: name.trim(),
        type,
        yachtId: type === 'VESSEL' ? yachtId : null,
        parentId: parentId || null,
        manager: manager?.trim() || null,
        address: address?.trim() || null,
        storageClass: storageClass || null,
        ...(managedBy && { managedBy }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(consumptionMode !== undefined && { consumptionMode: (consumptionMode || null) as StockConsumptionMode | null }),
        ...(posBar !== undefined && { isPosBar: posBar }),
      },
    })
  })
  return NextResponse.json(location)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const inUse = await db.stockLot.findFirst({ where: { locationId: id, quantity: { gt: 0 } } })
  if (inUse) return NextResponse.json({ error: 'Lokasi masih memiliki stok, tidak bisa dihapus' }, { status: 409 })
  await db.stockLocation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
