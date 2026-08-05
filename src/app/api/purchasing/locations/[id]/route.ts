import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, type, yachtId, parentId, manager, storageClass, managedBy, isActive } = body
  if (!name?.trim() || !type) return NextResponse.json({ error: 'name dan type wajib diisi' }, { status: 400 })
  if (type === 'VESSEL' && !yachtId) return NextResponse.json({ error: 'Pilih kapal untuk lokasi tipe Kapal' }, { status: 400 })
  const location = await db.stockLocation.update({
    where: { id },
    data: {
      name: name.trim(),
      type,
      yachtId: type === 'VESSEL' ? yachtId : null,
      parentId: parentId || null,
      manager: manager?.trim() || null,
      storageClass: storageClass || null,
      ...(managedBy && { managedBy }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
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
