import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { del } from '@vercel/blob'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

// PATCH — edit a promo's content, and/or (de)activate it. Activating one promo (isActive:
// true) deactivates every other draft in the same scope in the same transaction, since at
// most one draft per scope may be live at a time — enforced here, not by a DB constraint,
// because Postgres unique indexes can't express "only one row where isActive = true".
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const existing = await db.promo.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const { title, description, imageUrl, imageSizeBytes, imageMimeType, ctaLabel, ctaUrl, isActive } = body

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const contentData = {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
      ...(imageSizeBytes !== undefined ? { imageSizeBytes: typeof imageSizeBytes === 'number' ? imageSizeBytes : null } : {}),
      ...(imageMimeType !== undefined ? { imageMimeType: imageMimeType || null } : {}),
      ...(ctaLabel !== undefined ? { ctaLabel: ctaLabel || null } : {}),
      ...(ctaUrl !== undefined ? { ctaUrl: ctaUrl || null } : {}),
    }

    let promo
    if (isActive === true) {
      const [, updated] = await db.$transaction([
        db.promo.updateMany({ where: { yachtId: existing.yachtId, NOT: { id } }, data: { isActive: false } }),
        db.promo.update({ where: { id }, data: { ...contentData, isActive: true }, include: { yacht: { select: { id: true, name: true } } } }),
      ])
      promo = updated
    } else {
      promo = await db.promo.update({
        where: { id },
        data: { ...contentData, ...(isActive === false ? { isActive: false } : {}) },
        include: { yacht: { select: { id: true, name: true } } },
      })
    }

    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Promo', entityId: promo.id,
      detail: isActive === true
        ? `Activate promo: ${promo.title} (${promo.yacht?.name ?? 'General'})`
        : `Update promo: ${promo.title} (${promo.yacht?.name ?? 'General'})`,
    }, db).catch(() => {})

    return NextResponse.json(promo)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to update promo' }, { status: 500 }) }
}

// DELETE — remove a promo draft, and its Blob image if it has one.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const promo = await db.promo.findUnique({ where: { id } })
    if (!promo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (promo.imageUrl) {
      await del(promo.imageUrl).catch(e => console.error('[marketing/promos] blob delete failed:', e))
    }

    await db.promo.delete({ where: { id } })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'DELETE', entity: 'Promo', entityId: id,
      detail: `Delete promo: ${promo.title}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete promo' }, { status: 500 }) }
}
