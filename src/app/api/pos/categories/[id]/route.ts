import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, sortOrder, isActive } = body as { name?: string; sortOrder?: number; isActive?: boolean }

  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    const existing = await db.posCategory.findUnique({ where: { name: name.trim() } })
    if (existing && existing.id !== id) return NextResponse.json({ error: `Category "${name.trim()}" already exists` }, { status: 409 })
  }

  const category = await db.posCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    },
  })
  return NextResponse.json(category)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [menuItemCount, packageCount] = await Promise.all([
    db.posMenuItem.count({ where: { categoryId: id } }),
    db.posPackage.count({ where: { categoryId: id } }),
  ])
  if (menuItemCount > 0 || packageCount > 0) {
    return NextResponse.json({ error: 'Move or remove its products/packages before deleting this category' }, { status: 409 })
  }

  await db.posCategory.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
