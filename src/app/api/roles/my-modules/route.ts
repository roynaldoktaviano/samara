import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getEffectiveModules } from '@/lib/role-permissions'
import type { Role } from '@prisma/client'

// Used by the sidebar (src/app/page.tsx) to filter which modules the logged-in user's
// role can see — reads live from the DB rather than the session/JWT so a permission
// change an admin just saved shows up on the next page load, not after token refresh.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role as Role | undefined
  if (!role) return NextResponse.json({ modules: [] })

  const db = await getDb(session)
  const modules = await getEffectiveModules(db, role)
  return NextResponse.json({ modules })
}
