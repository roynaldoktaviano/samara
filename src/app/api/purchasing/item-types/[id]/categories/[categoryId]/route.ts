import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; categoryId: string }> }) {
  const { categoryId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.purchaseItemCategory.findUnique({ where: { id: categoryId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, isActive, skuPrefix } = body

  const data: { name?: string; isActive?: boolean; skuPrefix?: string } = {}
  if (isActive !== undefined) data.isActive = Boolean(isActive)
  if (skuPrefix !== undefined) {
    if (!String(skuPrefix).trim()) return NextResponse.json({ error: 'SKU prefix tidak boleh kosong' }, { status: 400 })
    data.skuPrefix = String(skuPrefix).trim().toUpperCase()
  }

  if (name !== undefined) {
    const cleanName = String(name).trim()
    if (!cleanName) return NextResponse.json({ error: 'name tidak boleh kosong' }, { status: 400 })
    if (cleanName !== existing.name) {
      const inUse = await db.purchaseItem.findFirst({ where: { type: existing.typeCode, category: existing.name } })
      if (inUse) return NextResponse.json({ error: 'Nama kategori tidak bisa diubah karena masih dipakai oleh item' }, { status: 409 })
      const conflict = await db.purchaseItemCategory.findUnique({ where: { typeCode_name: { typeCode: existing.typeCode, name: cleanName } } })
      if (conflict) return NextResponse.json({ error: `Kategori "${cleanName}" sudah ada di tipe ini` }, { status: 409 })
      data.name = cleanName
    }
  }

  const category = await db.purchaseItemCategory.update({ where: { id: categoryId }, data })
  return NextResponse.json(category)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; categoryId: string }> }) {
  const { categoryId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.purchaseItemCategory.findUnique({ where: { id: categoryId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const inUse = await db.purchaseItem.findFirst({ where: { type: existing.typeCode, category: existing.name } })
  if (inUse) return NextResponse.json({ error: 'Kategori masih dipakai oleh item, tidak bisa dihapus' }, { status: 409 })

  await db.purchaseItemCategory.delete({ where: { id: categoryId } })
  return NextResponse.json({ ok: true })
}
