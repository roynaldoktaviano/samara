import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR']

function slugify(name: string) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'ITEM'
}

// Auto-generates a unique SKU for items created on the fly during Initial Stock
// Opname — supplier/full purchasing detail is filled in later via Items & Pricing,
// so this only needs to be unique, not meaningful.
async function generateSku(db: Awaited<ReturnType<typeof getDb>>, name: string) {
  const base = slugify(name)
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? `INIT-${base}` : `INIT-${base}-${i}`
    const exists = await db.purchaseItem.findUnique({ where: { sku: candidate }, select: { id: true } })
    if (!exists) return candidate
  }
  return `INIT-${base}-${crypto.randomUUID().slice(0, 6)}`
}

async function getDefaultTypeCode(db: Awaited<ReturnType<typeof getDb>>) {
  const preferred = await db.purchaseItemTypeConfig.findFirst({ where: { code: 'MAINTENANCE', isActive: true } })
  if (preferred) return preferred.code
  const any = await db.purchaseItemTypeConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  return any?.code ?? null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  if (count.status === 'COMPLETED' && count.countedById !== session.user.id) {
    return NextResponse.json({ error: 'Hanya orang yang melakukan opname ini yang bisa mengoreksi' }, { status: 403 })
  }

  const body = await req.json()
  const qty = Number(body.qty) || 0

  if (body.itemId) {
    // Adding an existing catalog item that wasn't already pre-filled (e.g. it has
    // no stock at this location yet).
    const already = await db.stockCountItem.findFirst({ where: { countId: id, itemId: body.itemId } })
    if (already) return NextResponse.json({ error: 'Produk ini sudah ada di daftar' }, { status: 409 })
    const item = await db.purchaseItem.findUnique({ where: { id: body.itemId } })
    if (!item) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    const lot = await db.stockLot.findFirst({ where: { itemId: item.id, locationId: count.locationId } })
    const created = await db.stockCountItem.create({
      data: { id: crypto.randomUUID(), countId: id, itemId: item.id, itemName: item.name, systemQty: lot?.quantity ?? 0, countedQty: qty },
      include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, category: true } } },
    })
    return NextResponse.json(created, { status: 201 })
  }

  // Brand new product, created on the fly — minimal fields only, rest (supplier,
  // pricing, etc.) gets filled in later via Items & Pricing.
  const { name, category, baseUnit, purchaseUnit } = body
  if (!name?.trim() || !category?.trim() || !baseUnit?.trim() || !purchaseUnit?.trim()) {
    return NextResponse.json({ error: 'Nama, kategori, purchase unit, dan base unit wajib diisi' }, { status: 400 })
  }

  const typeCode = await getDefaultTypeCode(db)
  if (!typeCode) return NextResponse.json({ error: 'Belum ada Item Type aktif — buat dulu di menu Item Types' }, { status: 400 })

  const sku = await generateSku(db, name)
  const item = await db.purchaseItem.create({
    data: {
      id: crypto.randomUUID(),
      sku,
      name: name.trim(),
      type: typeCode,
      category: category.trim(),
      baseUnit: baseUnit.trim(),
      purchaseUnit: purchaseUnit.trim(),
      updatedAt: new Date(),
    },
  })

  const created = await db.stockCountItem.create({
    data: { id: crypto.randomUUID(), countId: id, itemId: item.id, itemName: item.name, systemQty: 0, countedQty: qty },
    include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, category: true } } },
  })
  return NextResponse.json(created, { status: 201 })
}
