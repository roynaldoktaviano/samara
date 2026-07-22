import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { renderBlocksToHtml, normalizeDesign } from '@/lib/email-builder'
import { isLikelyAutomated, UNSUBSCRIBE_URL_MARKER, type RecipientTab } from '@/lib/campaign-recipients'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Campaign-wide data that doesn't depend on the recipient-table tab/page/search --
// fetched once per page load. The tab-scoped recipient list (including the
// "Unsubscribed" tab, which also surfaces unsubscribe-link clicks that never got
// confirmed) lives at GET /api/marketing/campaigns/[id]/recipients so switching
// tabs doesn't re-run the heavy chart queries below on every click.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaign = await db.emailCampaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [statusGroups, openedCount, unsubscribedCount, pendingUnsubscribeCount, chartRows] = await Promise.all([
    db.campaignRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: { id: true } }),
    db.campaignRecipient.count({ where: { campaignId: id, status: 'SENT', openedAt: { not: null } } }),
    db.campaignRecipient.count({
      where: {
        campaignId: id,
        OR: [
          { status: 'SKIPPED_UNSUBSCRIBED' },
          { clicks: { some: { url: { contains: UNSUBSCRIBE_URL_MARKER } } } },
        ],
      },
    }),
    // Clicked the unsubscribe link but the status update never landed -- how many
    // the "Unsubscribe all" bulk action on the Unsubscribed tab would sweep up.
    db.campaignRecipient.count({
      where: { campaignId: id, status: { not: 'SKIPPED_UNSUBSCRIBED' }, clicks: { some: { url: { contains: UNSUBSCRIBE_URL_MARKER } } } },
    }),
    // Lightweight rows (no email/name) for the trend/hour/link-performance charts --
    // pulled from every non-pending recipient rather than just the current table
    // page, since pending recipients can never have sends/opens/clicks anyway.
    // Also used to compute "real" (bot-filtered) engagement counts below.
    db.campaignRecipient.findMany({
      where: { campaignId: id, status: { not: 'PENDING' } },
      select: {
        id: true,
        sentAt: true,
        opens: { select: { openedAt: true } },
        clicks: { select: { url: true, clickedAt: true } },
      },
    }),
  ])

  const counts: Record<Exclude<RecipientTab, 'ALL'>, number> = {
    SENT: 0, PENDING: 0, BOUNCED: 0, FAILED: 0, UNSUBSCRIBED: unsubscribedCount, OPENED: openedCount,
  }
  for (const g of statusGroups) {
    if (g.status === 'SENT') counts.SENT = g._count.id
    else if (g.status === 'PENDING') counts.PENDING = g._count.id
    else if (g.status === 'BOUNCED') counts.BOUNCED = g._count.id
    else if (g.status === 'FAILED') counts.FAILED = g._count.id
  }

  // "Real" engagement -- same counts, minus recipients whose only opens/clicks
  // look automated (see isLikelyAutomated above).
  let realOpened = 0
  let realClicked = 0
  for (const r of chartRows) {
    const automated = isLikelyAutomated(r.clicks)
    if (r.opens.length > 0 && !automated) realOpened++
    if (r.clicks.length > 0 && !automated) realClicked++
  }

  return NextResponse.json({
    ...campaign,
    recipientCounts: counts,
    engagementStats: { realOpened, realClicked },
    pendingUnsubscribeCount,
    chartRows,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.emailCampaign.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'SENT' || existing.status === 'SENDING' || existing.status === 'PAUSED') {
    return NextResponse.json({ error: 'Cannot edit a campaign that has been sent' }, { status: 409 })
  }

  const { name, subject, previewText, fromEmail, fromName, templateId, blocksJson, audienceSources, status, scheduledAt } = await req.json()
  const design = blocksJson ? normalizeDesign(blocksJson) : null

  const campaign = await db.emailCampaign.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(subject !== undefined && { subject: subject.trim() }),
      ...(previewText !== undefined && { previewText: previewText?.trim() || null }),
      ...(fromEmail !== undefined && { fromEmail: fromEmail.trim() }),
      ...(fromName !== undefined && { fromName: fromName?.trim() || null }),
      ...(templateId !== undefined && { templateId: templateId || null }),
      ...(design && { blocksJson: JSON.parse(JSON.stringify(design)), bodyHtml: renderBlocksToHtml(design.blocks, design.settings) }),
      ...(audienceSources !== undefined && { audienceSources }),
      ...(status === 'CANCELED' && { status: 'CANCELED' as const, scheduledAt: null }),
      ...(scheduledAt !== undefined && status !== 'CANCELED' && {
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? ('SCHEDULED' as const) : ('DRAFT' as const),
      }),
    },
  })
  return NextResponse.json(campaign)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.emailCampaign.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'SENDING') return NextResponse.json({ error: 'Cannot delete while sending' }, { status: 409 })

  await db.emailCampaign.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
