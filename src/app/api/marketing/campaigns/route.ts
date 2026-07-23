import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { renderBlocksToHtml, normalizeDesign } from '@/lib/email-builder'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaigns = await db.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, subject: true, status: true, fromEmail: true, fromName: true,
      scheduledAt: true, sentAt: true, totalRecipients: true, sentCount: true, failedCount: true,
      createdByName: true, createdAt: true, updatedAt: true,
      recipients: { select: { openedAt: true, clickedAt: true } },
    },
  })
  const withStats = campaigns.map(({ recipients, ...c }) => ({
    ...c,
    openedCount: recipients.filter(r => r.openedAt).length,
    clickedCount: recipients.filter(r => r.clickedAt).length,
  }))
  return NextResponse.json(withStats)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, subject, previewText, fromEmail, fromName, templateId, blocksJson, audienceSources } = await request.json()
  if (!name?.trim() || !subject?.trim() || !fromEmail?.trim() || !blocksJson) {
    return NextResponse.json({ error: 'name, subject, fromEmail, and blocksJson are required' }, { status: 400 })
  }
  const design = normalizeDesign(blocksJson)

  const campaign = await db.emailCampaign.create({
    data: {
      name: name.trim(),
      subject: subject.trim(),
      previewText: previewText?.trim() || null,
      fromEmail: fromEmail.trim(),
      fromName: fromName?.trim() || null,
      templateId: templateId || null,
      blocksJson: JSON.parse(JSON.stringify(design)),
      bodyHtml: renderBlocksToHtml(design.blocks, design.settings),
      audienceSources: audienceSources ?? {},
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
    },
  })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'CREATE', entity: 'EmailCampaign', entityId: campaign.id,
    detail: `Create campaign: ${campaign.name}`,
  }, db).catch(() => {})

  return NextResponse.json(campaign, { status: 201 })
}
