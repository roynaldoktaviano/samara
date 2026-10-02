import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// Assignee picker for My Works — any logged-in user may assign to anyone, so this lists every
// account with just enough to show a name/avatar.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const users = await db.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({ users, meId: session.user.id })
}
