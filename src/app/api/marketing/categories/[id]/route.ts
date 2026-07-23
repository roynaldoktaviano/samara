import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

// PATCH — rename and/or reorder a category
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const data: { name?: string; sortOrder?: number } = {}

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
      const duplicate = await db.mediaCategory.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
      })
      if (duplicate) return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
      data.name = name
    }
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder

    const category = await db.mediaCategory.update({ where: { id }, data })
    return NextResponse.json(category)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to update category' }, { status: 500 }) }
}

// DELETE — only while empty, same rule already enforced for folders
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const category = await db.mediaCategory.findUnique({ where: { id } })
    if (!category) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [fileCount, folderCount] = await Promise.all([
      db.mediaFile.count({ where: { categoryId: id } }),
      db.mediaFolder.count({ where: { categoryId: id } }),
    ])
    if (fileCount > 0 || folderCount > 0) {
      return NextResponse.json({ error: 'Move or delete everything in this category first' }, { status: 409 })
    }

    await db.mediaCategory.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 }) }
}
