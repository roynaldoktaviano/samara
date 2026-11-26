import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { requireMediaAccountAccess, MEDIA_ACCOUNT_SELECT, serializeMediaAccount } from '@/lib/media-accounts'

// PATCH — any of: profile fields, `active`, a new `password` (resets it and signs out
// existing sessions via portalPasswordSetAt), or `categoryIds` (null = unrestricted).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireMediaAccountAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const current = await db.mediaAccount.findUnique({ where: { id }, select: { id: true, name: true, email: true } })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    const changes: string[] = []
    if (typeof body.name === 'string') {
      if (!body.name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      data.name = body.name.trim()
    }
    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
      if (email !== current.email) {
        const clash = await db.mediaAccount.findUnique({ where: { email }, select: { id: true } })
        if (clash) return NextResponse.json({ error: 'A media account with this email already exists' }, { status: 409 })
      }
      data.email = email
    }
    if (body.organization !== undefined) data.organization = typeof body.organization === 'string' && body.organization.trim() ? body.organization.trim() : null
    if (body.note !== undefined) data.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
    if (typeof body.active === 'boolean') {
      data.portalActive = body.active
      changes.push(body.active ? 'activated' : 'deactivated')
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }
      data.portalPasswordHash = await bcrypt.hash(body.password, 12)
      data.portalPasswordSetAt = new Date()
      data.portalPasswordSetById = session.user.id
      data.portalActive = true
      changes.push('password reset')
    }

    const categoryIds: string[] | null | undefined = body.categoryIds === null
      ? null
      : Array.isArray(body.categoryIds) ? body.categoryIds.filter((v: unknown) => typeof v === 'string') : undefined

    const [account] = await db.$transaction([
      db.mediaAccount.update({ where: { id }, data, select: { id: true } }),
      ...(categoryIds !== undefined
        ? [
            db.mediaAccountVisibleCategory.deleteMany({ where: { mediaAccountId: id } }),
            ...(categoryIds && categoryIds.length > 0
              ? [db.mediaAccountVisibleCategory.createMany({ data: categoryIds.map(categoryId => ({ mediaAccountId: id, categoryId })) })]
              : []),
          ]
        : []),
    ])
    if (categoryIds !== undefined) changes.push('category access updated')

    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'MediaAccount', entityId: account.id,
      detail: `Updated media portal account ${current.name}${changes.length ? ` (${changes.join(', ')})` : ''}`,
    }, db).catch(() => {})

    const fresh = await db.mediaAccount.findUnique({ where: { id }, select: MEDIA_ACCOUNT_SELECT })
    return NextResponse.json(fresh ? serializeMediaAccount(fresh) : null)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to update media account' }, { status: 500 }) }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireMediaAccountAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const account = await db.mediaAccount.delete({ where: { id }, select: { name: true, email: true } })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'DELETE', entity: 'MediaAccount', entityId: id,
      detail: `Deleted media portal account: ${account.name} (${account.email})`,
    }, db).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete media account' }, { status: 500 }) }
}
