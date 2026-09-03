import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaignId = req.nextUrl.searchParams.get('campaignId')

  const items = await db.contentItem.findMany({
    where: campaignId ? { campaignId } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, _count: { select: { comments: true } } },
  })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { title, format, campaignId, campaignTag, caption, ownerName, dueDate } = await request.json()
  if (!title?.trim() || !format) {
    return NextResponse.json({ error: 'title and format are required' }, { status: 400 })
  }

  const item = await db.contentItem.create({
    data: {
      title: title.trim(),
      format,
      campaignId: campaignId || null,
      campaignTag: campaignTag?.trim() || null,
      caption: caption?.trim() || null,
      ownerName: ownerName?.trim() || session!.user.name || session!.user.email || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
    },
  })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'CREATE', entity: 'ContentItem', entityId: item.id,
    detail: `Create content: ${item.title}`,
  }, db).catch(() => {})

  return NextResponse.json(item, { status: 201 })
}
