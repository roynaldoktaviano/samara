import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const item = await db.contentItem.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: 'desc' } },
      comments: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.contentItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { title, format, campaignId, campaignTag, caption, ownerName, dueDate } = await req.json()

  const item = await db.contentItem.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(format !== undefined && { format }),
      ...(campaignId !== undefined && { campaignId: campaignId || null }),
      ...(campaignTag !== undefined && { campaignTag: campaignTag?.trim() || null }),
      ...(caption !== undefined && { caption: caption?.trim() || null }),
      ...(ownerName !== undefined && { ownerName: ownerName?.trim() || null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
  })
  return NextResponse.json(item)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.contentItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.contentItem.delete({ where: { id } })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'DELETE', entity: 'ContentItem', entityId: id,
    detail: `Delete content: ${existing.title}`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true })
}
