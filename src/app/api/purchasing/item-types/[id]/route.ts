import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.purchaseItemTypeConfig.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { code, label, isActive } = body
  if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 })

  const data: { label: string; isActive?: boolean; code?: string } = {
    label: label.trim(),
  }
  if (isActive !== undefined) data.isActive = Boolean(isActive)

  if (code !== undefined) {
    const cleanCode = String(code).trim().toUpperCase().replace(/\s+/g, '_')
    if (cleanCode !== existing.code) {
      const inUse = await db.purchaseItem.findFirst({ where: { type: existing.code } })
      if (inUse) return NextResponse.json({ error: 'Code cannot be changed because items still use it' }, { status: 409 })
      if (!/^[A-Z0-9_]+$/.test(cleanCode)) return NextResponse.json({ error: 'code may only contain letters, numbers and underscores' }, { status: 400 })
      const conflict = await db.purchaseItemTypeConfig.findUnique({ where: { code: cleanCode } })
      if (conflict) return NextResponse.json({ error: `A type with code "${cleanCode}" already exists` }, { status: 409 })
      data.code = cleanCode
    }
  }

  const type = await db.purchaseItemTypeConfig.update({ where: { id }, data, include: { categories: true } })
  return NextResponse.json(type)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.purchaseItemTypeConfig.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.isLocked) return NextResponse.json({ error: 'Built-in system types cannot be deleted' }, { status: 409 })

  const inUse = await db.purchaseItem.findFirst({ where: { type: existing.code } })
  if (inUse) return NextResponse.json({ error: 'Type is still used by items and cannot be deleted' }, { status: 409 })

  await db.purchaseItemTypeConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
