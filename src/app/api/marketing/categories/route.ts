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

// GET — list Media Kit categories, marketing-managed (not a fixed enum)
export async function GET() {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const categories = await db.mediaCategory.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json(categories)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 }) }
}

// POST — create a new category, appended to the end of the tab order
export async function POST(request: NextRequest) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Category name is required' }, { status: 400 })

    const duplicate = await db.mediaCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    if (duplicate) return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })

    const maxSort = await db.mediaCategory.aggregate({ _max: { sortOrder: true } })
    const category = await db.mediaCategory.create({
      data: { name, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
    })
    return NextResponse.json(category, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to create category' }, { status: 500 }) }
}
