import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { itemBaseCosts } from '@/lib/pos-recipe'

// ?ids=a,b → { [itemId]: cost per base unit } for the Menu form's live cost estimate.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ['ADMIN', 'SUPER_ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 100)
  return NextResponse.json(Object.fromEntries(await itemBaseCosts(db, ids)))
}
