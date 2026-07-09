import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const type = await db.purchaseItemTypeConfig.findUnique({ where: { id } })
  if (!type) return NextResponse.json({ error: 'Tipe tidak ditemukan' }, { status: 404 })

  const body = await req.json()
  const { name, skuPrefix } = body
  if (!name || !name.trim()) return NextResponse.json({ error: 'name wajib diisi' }, { status: 400 })
  if (!skuPrefix || !skuPrefix.trim()) return NextResponse.json({ error: 'SKU prefix wajib diisi' }, { status: 400 })
  const cleanName = name.trim()

  const existing = await db.purchaseItemCategory.findUnique({ where: { typeCode_name: { typeCode: type.code, name: cleanName } } })
  if (existing) return NextResponse.json({ error: `Kategori "${cleanName}" sudah ada di tipe ini` }, { status: 409 })

  const category = await db.purchaseItemCategory.create({
    data: { typeCode: type.code, name: cleanName, skuPrefix: skuPrefix.trim().toUpperCase() },
  })
  return NextResponse.json(category, { status: 201 })
}
