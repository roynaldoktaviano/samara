import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

// GET — list every promo draft across every scope (General + each yacht). Small table —
// the admin UI fetches all of them once and filters client-side by the selected yacht scope.
export async function GET() {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const promos = await db.promo.findMany({
      include: { yacht: { select: { id: true, name: true } } },
      orderBy: [{ yachtId: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json(promos)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch promos' }, { status: 500 }) }
}

// POST — create a new promo draft in a scope (yachtId, or null for General). Always starts
// inactive — activating it (making it the one shown in the Agent Portal) is a separate action.
export async function POST(request: NextRequest) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json().catch(() => ({}))
    const { yachtId, title, description, imageUrl, ctaLabel, ctaUrl } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const promo = await db.promo.create({
      data: {
        yachtId: yachtId || null,
        title: title.trim(),
        description: description || null,
        imageUrl: imageUrl || null,
        ctaLabel: ctaLabel || null,
        ctaUrl: ctaUrl || null,
        isActive: false,
        createdById: session.user.id,
      },
      include: { yacht: { select: { id: true, name: true } } },
    })

    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'CREATE', entity: 'Promo', entityId: promo.id,
      detail: `Create promo: ${promo.title} (${promo.yacht?.name ?? 'General'})`,
    }, db).catch(() => {})

    return NextResponse.json(promo, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to save promo' }, { status: 500 }) }
}
