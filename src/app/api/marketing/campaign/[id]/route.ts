import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { getCampaignAttribution, slugify } from '@/lib/campaign-attribution'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Moving a campaign OUT of the Approval stage is a sign-off, reserved for Marketing Director
// and above — plain MARKETING can move a campaign INTO Approval (submitting it) but not past it.
const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      channels: {
        orderBy: { createdAt: 'asc' },
        include: { emailCampaign: { select: { id: true, name: true, status: true, totalRecipients: true, sentCount: true, sentAt: true } } },
      },
      comments: { orderBy: { createdAt: 'asc' } },
      contentItems: {
        orderBy: { updatedAt: 'desc' },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, _count: { select: { comments: true } } },
      },
    },
  })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Real open/click rate per Email channel — the only channel type this app actually
  // tracks results for (no ad-platform API integration for Meta/Google/etc), so its
  // "Campaign components" row is the only one with a real result number instead of "—".
  const channels = await Promise.all(campaign.channels.map(async ch => {
    if (!ch.emailCampaign) return ch
    const [openedCount, clickedCount] = await Promise.all([
      db.campaignRecipient.count({ where: { campaignId: ch.emailCampaign.id, status: 'SENT', openedAt: { not: null } } }),
      db.campaignRecipient.count({ where: { campaignId: ch.emailCampaign.id, status: 'SENT', clickedAt: { not: null } } }),
    ])
    return { ...ch, emailCampaign: { ...ch.emailCampaign, openedCount, clickedCount } }
  }))

  const attribution = await getCampaignAttribution(db, campaign.utmSlug)
  return NextResponse.json({ ...campaign, channels, attribution })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.campaign.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const {
    name, brand, stage, objective, targetResult, promise, offer, startDate, endDate, plannedBudget,
    ownerName, audienceSegments, markets, masterLanguage, additionalLanguages, exclusions, utmSlug,
  } = body

  if (stage !== undefined && existing.stage === 'APPROVAL' && stage !== 'APPROVAL' && !roleMatches(role, APPROVER_ROLES)) {
    return NextResponse.json({ error: 'Only a Marketing Director can move a campaign out of Approval' }, { status: 403 })
  }

  let cleanUtmSlug: string | null | undefined
  if (utmSlug !== undefined) {
    cleanUtmSlug = utmSlug?.trim() ? slugify(utmSlug.trim()) : null
    if (cleanUtmSlug) {
      const clash = await db.campaign.findUnique({ where: { utmSlug: cleanUtmSlug }, select: { id: true } })
      if (clash && clash.id !== id) return NextResponse.json({ error: `"${cleanUtmSlug}" is already used by another campaign` }, { status: 400 })
    }
  }

  const campaign = await db.campaign.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(brand !== undefined && { brand: brand?.trim() || null }),
      ...(stage !== undefined && { stage }),
      ...(objective !== undefined && { objective: objective?.trim() || null }),
      ...(targetResult !== undefined && { targetResult: targetResult?.trim() || null }),
      ...(promise !== undefined && { promise: promise?.trim() || null }),
      ...(offer !== undefined && { offer: offer?.trim() || null }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(plannedBudget !== undefined && { plannedBudget: typeof plannedBudget === 'number' ? plannedBudget : null }),
      ...(ownerName !== undefined && { ownerName: ownerName?.trim() || null }),
      ...(audienceSegments !== undefined && { audienceSegments }),
      ...(markets !== undefined && { markets }),
      ...(masterLanguage !== undefined && { masterLanguage: masterLanguage?.trim() || null }),
      ...(additionalLanguages !== undefined && { additionalLanguages }),
      ...(exclusions !== undefined && { exclusions }),
      ...(cleanUtmSlug !== undefined && { utmSlug: cleanUtmSlug }),
    },
  })
  return NextResponse.json(campaign)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.campaign.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.campaign.delete({ where: { id } })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'DELETE', entity: 'Campaign', entityId: id,
    detail: `Delete campaign: ${existing.name}`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true })
}
