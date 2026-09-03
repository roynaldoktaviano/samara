import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { mediaUrl, mediaType, note } = await req.json()
  if (!mediaUrl?.trim()) return NextResponse.json({ error: 'mediaUrl is required' }, { status: 400 })

  const existing = await db.contentItem.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const last = await db.contentVersion.findFirst({ where: { contentItemId: id }, orderBy: { versionNumber: 'desc' } })

  const version = await db.contentVersion.create({
    data: {
      contentItemId: id,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      mediaUrl: mediaUrl.trim(),
      mediaType: mediaType || null,
      note: note?.trim() || null,
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
    },
  })
  return NextResponse.json(version, { status: 201 })
}
