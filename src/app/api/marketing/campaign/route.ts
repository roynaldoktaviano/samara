import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaigns = await db.campaign.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      channels: { select: { id: true, type: true, status: true } },
      _count: { select: { contentItems: true, comments: true } },
    },
  })
  return NextResponse.json(campaigns)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const {
    name, brand, objective, targetResult, ownerName, startDate, endDate, plannedBudget, channelTypes,
    audienceSegments, markets, masterLanguage, additionalLanguages, exclusions,
  } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const campaign = await db.campaign.create({
    data: {
      name: name.trim(),
      brand: brand?.trim() || null,
      objective: objective?.trim() || null,
      targetResult: targetResult?.trim() || null,
      ownerName: ownerName?.trim() || session!.user.name || session!.user.email || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      plannedBudget: typeof plannedBudget === 'number' ? plannedBudget : null,
      audienceSegments: Array.isArray(audienceSegments) && audienceSegments.length ? audienceSegments : undefined,
      markets: Array.isArray(markets) && markets.length ? markets : undefined,
      masterLanguage: masterLanguage?.trim() || null,
      additionalLanguages: Array.isArray(additionalLanguages) && additionalLanguages.length ? additionalLanguages : undefined,
      exclusions: Array.isArray(exclusions) && exclusions.length ? exclusions : undefined,
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
      channels: {
        create: (Array.isArray(channelTypes) ? channelTypes : []).map((type: string) => ({ type: type as never })),
      },
    },
    include: { channels: true },
  })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'CREATE', entity: 'Campaign', entityId: campaign.id,
    detail: `Create campaign: ${campaign.name}`,
  }, db).catch(() => {})

  return NextResponse.json(campaign, { status: 201 })
}
