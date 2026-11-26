import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { requireMediaAccountAccess, MEDIA_ACCOUNT_SELECT, serializeMediaAccount } from '@/lib/media-accounts'

export async function GET() {
  const session = await requireMediaAccountAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const accounts = await db.mediaAccount.findMany({ select: MEDIA_ACCOUNT_SELECT, orderBy: { createdAt: 'desc' } })
    return NextResponse.json(accounts.map(serializeMediaAccount))
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch media accounts' }, { status: 500 }) }
}

// POST — create an account with its first password; it's active straight away.
export async function POST(request: NextRequest) {
  const session = await requireMediaAccountAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!name || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const existing = await db.mediaAccount.findUnique({ where: { email }, select: { id: true } })
    if (existing) return NextResponse.json({ error: 'A media account with this email already exists' }, { status: 409 })

    const account = await db.mediaAccount.create({
      data: {
        name, email,
        organization: typeof body.organization === 'string' && body.organization.trim() ? body.organization.trim() : null,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        portalPasswordHash: await bcrypt.hash(password, 12),
        portalPasswordSetAt: new Date(),
        portalPasswordSetById: session.user.id,
        portalActive: true,
        createdById: session.user.id,
      },
      select: MEDIA_ACCOUNT_SELECT,
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'CREATE', entity: 'MediaAccount', entityId: account.id,
      detail: `Created media portal account: ${name} (${email})`,
    }, db).catch(() => {})
    return NextResponse.json(serializeMediaAccount(account), { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to create media account' }, { status: 500 }) }
}
