import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { canUseInitialOpname } from '@/lib/purchasing/initialOpnameScope'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR', 'WAREHOUSE']

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
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

  const item = await db.stockCountItem.findUnique({ where: { id: itemId } })
  if (!item || item.countId !== id) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  await db.stockCountItem.delete({ where: { id: itemId } })
  return NextResponse.json({ ok: true })
}

// Edit a row from the Initial Opname popup — fixes the underlying catalog product's
// basic fields (name/category/units). Qty is NOT changed here — it stays in the
// table and goes through the normal Simpan/Selesaikan PUT, which is what applies
// stock deltas on a completed opname. The rest of the product stays in Items & Pricing.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
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

  const row = await db.stockCountItem.findUnique({ where: { id: itemId } })
  if (!row || row.countId !== id) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  const { name, category, baseUnit, purchaseUnit } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Nama produk wajib diisi' }, { status: 400 })

  if (row.itemId) {
    if (!category?.trim() || !baseUnit?.trim() || !purchaseUnit?.trim()) {
      return NextResponse.json({ error: 'Nama, kategori, purchase unit, dan base unit wajib diisi' }, { status: 400 })
    }
    await db.purchaseItem.update({
      where: { id: row.itemId },
      data: { name: name.trim(), category: category.trim(), baseUnit: baseUnit.trim(), purchaseUnit: purchaseUnit.trim(), updatedAt: new Date() },
    })
  }

  const updated = await db.stockCountItem.update({
    where: { id: itemId },
    data: { itemName: name.trim() },
    include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, category: true } } },
  })
  return NextResponse.json(updated)
}
