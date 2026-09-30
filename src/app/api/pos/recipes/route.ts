import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { parseRecipeLines, RECIPE_INCLUDE, withRecipeCost } from '@/lib/pos-recipe'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

// Same scoping as packages: a yacht's Menu is Global ∪ its own.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const yachtId = searchParams.get('yachtId')
  const where = yachtId === 'global' ? { yachtId: null } : yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : {}

  const rows = await db.posRecipe.findMany({ where, include: RECIPE_INCLUDE, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  return NextResponse.json(await withRecipeCost(db, rows))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { name, description, categoryId, yachtId, price, imageKey, lines } = await req.json() as {
    name?: string; description?: string; categoryId?: string; yachtId?: string | null; price?: number; imageKey?: string | null; lines?: unknown
  }

  if (!name?.trim()) return NextResponse.json({ error: 'Menu name is required' }, { status: 400 })
  if (!categoryId) return NextResponse.json({ error: 'Please pick a category' }, { status: 400 })
  if (price === undefined || price === null || Number(price) < 0) return NextResponse.json({ error: 'Please set a price' }, { status: 400 })
  const parsed = parseRecipeLines(lines)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const category = await db.posCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const recipe = await db.posRecipe.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      categoryId,
      yachtId: yachtId || null,
      price: Number(price),
      imageKey: imageKey || null,
      lines: { create: parsed.lines },
    },
    include: RECIPE_INCLUDE,
  })
  const [out] = await withRecipeCost(db, [recipe])
  return NextResponse.json(out, { status: 201 })
}
