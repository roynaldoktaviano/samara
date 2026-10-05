import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { OPNAME_ITEM_SELECT, parseOpnameItemForm } from '@/lib/purchasing/initialOpnameItem'
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

// Edit a row from the Initial Opname popup — same product form as Items & Pricing, so it
// updates the underlying catalog product. Qty is NOT changed here — it stays in the
// table and goes through the normal Simpan/Selesaikan PUT, which is what applies
// stock deltas on a completed opname.
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

  const body = await req.json()
  if (row.itemId) {
    const parsed = await parseOpnameItemForm(db, body, row.itemId)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    await db.purchaseItem.update({ where: { id: row.itemId }, data: { ...parsed.data, updatedAt: new Date() } })
  } else if (!String(body.name ?? '').trim()) {
    return NextResponse.json({ error: 'Nama produk wajib diisi' }, { status: 400 })
  }

  const updated = await db.stockCountItem.update({
    where: { id: itemId },
    data: { itemName: String(body.name).trim() },
    include: { item: { select: OPNAME_ITEM_SELECT } },
  })
  return NextResponse.json(updated)
}
