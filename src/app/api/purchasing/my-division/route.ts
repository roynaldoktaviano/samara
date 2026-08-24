import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// Self-lookup, not admin-gated (unlike GET /api/users) — lets RequestsPage.tsx default
// the logged-in Purchasing user's view to their own division without needing the full
// user-management permission.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { purchasingDivision: true } })
  return NextResponse.json({ purchasingDivision: me?.purchasingDivision ?? null })
}
