import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; channelId: string }> }) {
  const { id, channelId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.campaignChannel.findUnique({ where: { id: channelId } })
  if (!existing || existing.campaignId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { status, ownerName, notes, plannedBudget, actualSpend, emailCampaignId, unlinkEmail, externalUrl, externalCampaignName } = await req.json()

  if (emailCampaignId) {
    const target = await db.emailCampaign.findUnique({ where: { id: emailCampaignId }, select: { id: true, channel: { select: { id: true } } } })
    if (!target) return NextResponse.json({ error: 'Email campaign not found' }, { status: 404 })
    if (target.channel && target.channel.id !== channelId) return NextResponse.json({ error: 'That email campaign is already linked to another channel' }, { status: 409 })
  }

  const channel = await db.campaignChannel.update({
    where: { id: channelId },
    data: {
      ...(status !== undefined && { status }),
      ...(ownerName !== undefined && { ownerName: ownerName?.trim() || null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(plannedBudget !== undefined && { plannedBudget: typeof plannedBudget === 'number' ? plannedBudget : null }),
      ...(actualSpend !== undefined && { actualSpend: typeof actualSpend === 'number' ? actualSpend : null }),
      ...(emailCampaignId !== undefined && { emailCampaignId: emailCampaignId || null }),
      ...(unlinkEmail && { emailCampaignId: null }),
      ...(externalUrl !== undefined && { externalUrl: externalUrl?.trim() || null }),
      ...(externalCampaignName !== undefined && { externalCampaignName: externalCampaignName?.trim() || null }),
    },
    include: { emailCampaign: { select: { id: true, name: true, status: true, totalRecipients: true, sentCount: true, sentAt: true } } },
  })
  return NextResponse.json(channel)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; channelId: string }> }) {
  const { id, channelId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.campaignChannel.findUnique({ where: { id: channelId } })
  if (!existing || existing.campaignId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.campaignChannel.delete({ where: { id: channelId } })
  return NextResponse.json({ ok: true })
}
