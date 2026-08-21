import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [categories, counts] = await Promise.all([
    db.posCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.posMenuItem.groupBy({ by: ['categoryId'], _count: true }),
  ])
  const countMap = new Map(counts.map(c => [c.categoryId, c._count]))
  return NextResponse.json(categories.map(c => ({ ...c, itemCount: countMap.get(c.id) ?? 0 })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, sortOrder } = body as { name?: string; sortOrder?: number }
  if (!name?.trim()) return NextResponse.json({ error: 'Category name is required' }, { status: 400 })

  const existing = await db.posCategory.findUnique({ where: { name: name.trim() } })
  if (existing) return NextResponse.json({ error: `Category "${name.trim()}" already exists` }, { status: 409 })

  const category = await db.posCategory.create({
    data: { name: name.trim(), sortOrder: sortOrder ?? 0 },
  })
  return NextResponse.json(category, { status: 201 })
}
