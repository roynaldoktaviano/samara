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

  const { type } = await req.json()
  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 })

  const campaign = await db.campaign.findUnique({ where: { id }, select: { id: true } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const channel = await db.campaignChannel.create({ data: { campaignId: id, type } })
  return NextResponse.json(channel, { status: 201 })
}
