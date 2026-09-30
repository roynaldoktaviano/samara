import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { parseRecipeLines, RECIPE_INCLUDE, withRecipeCost } from '@/lib/pos-recipe'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { name, description, categoryId, price, imageKey, isActive, sortOrder, lines } = await req.json() as {
    name?: string; description?: string; categoryId?: string; price?: number; imageKey?: string | null
    isActive?: boolean; sortOrder?: number; lines?: unknown
  }

  if (name !== undefined && !name.trim()) return NextResponse.json({ error: 'Menu name is required' }, { status: 400 })
  if (price !== undefined && Number(price) < 0) return NextResponse.json({ error: 'Price cannot be negative' }, { status: 400 })
  let parsedLines: { itemId: string; qty: number }[] | undefined
  if (lines !== undefined) {
    const parsed = parseRecipeLines(lines)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    parsedLines = parsed.lines
  }
  if (categoryId) {
    const category = await db.posCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const recipe = await db.$transaction(async tx => {
    if (parsedLines) await tx.posRecipeLine.deleteMany({ where: { recipeId: id } })
    return tx.posRecipe.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(categoryId !== undefined && { categoryId }),
        ...(price !== undefined && { price: Number(price) }),
        ...(imageKey !== undefined && { imageKey: imageKey || null }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(parsedLines && { lines: { create: parsedLines } }),
      },
      include: RECIPE_INCLUDE,
    })
  })
  const [out] = await withRecipeCost(db, [recipe])
  return NextResponse.json(out)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  await db.posRecipe.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
