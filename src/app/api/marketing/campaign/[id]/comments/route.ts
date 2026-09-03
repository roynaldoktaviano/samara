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

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  const existing = await db.campaign.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comment = await db.campaignComment.create({
    data: {
      campaignId: id,
      authorUserId: session!.user.id,
      authorName: session!.user.name ?? session!.user.email ?? 'Unknown',
      text: text.trim(),
    },
  })
  return NextResponse.json(comment, { status: 201 })
}
