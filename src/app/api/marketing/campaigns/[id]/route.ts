import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { renderBlocksToHtml, normalizeDesign } from '@/lib/email-builder'
import type { Prisma } from '@prisma/client'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Recipient table tabs — 'OPENED' is a subset of SENT (status stays SENT once
// opened; openedAt is what actually flags it), not its own recipient status.
type RecipientTab = 'ALL' | 'SENT' | 'OPENED' | 'PENDING' | 'BOUNCED' | 'FAILED' | 'UNSUBSCRIBED'

function whereForTab(campaignId: string, tab: RecipientTab, search: string): Prisma.CampaignRecipientWhereInput {
  const base: Prisma.CampaignRecipientWhereInput = { campaignId }
  if (search) base.email = { contains: search, mode: 'insensitive' }
  switch (tab) {
    case 'SENT': return { ...base, status: 'SENT' }
    case 'OPENED': return { ...base, status: 'SENT', openedAt: { not: null } }
    case 'PENDING': return { ...base, status: 'PENDING' }
    case 'BOUNCED': return { ...base, status: 'BOUNCED' }
    case 'FAILED': return { ...base, status: 'FAILED' }
    case 'UNSUBSCRIBED': return { ...base, status: 'SKIPPED_UNSUBSCRIBED' }
    default: return base
  }
}

// Newest-first by whatever's most relevant to the tab being viewed — most
// recent opens when reviewing engagement, most recent sends otherwise.
function orderByForTab(tab: RecipientTab): Prisma.CampaignRecipientOrderByWithRelationInput[] {
  if (tab === 'OPENED') return [{ openedAt: 'desc' }, { createdAt: 'desc' }]
  return [{ sentAt: 'desc' }, { createdAt: 'desc' }]
}

/**
 * Heuristic flag for automated engagement — corporate email-security scanners
 * (Microsoft Safe Links, Proofpoint, Mimecast, etc.) pre-fetch every link in an
 * email within seconds of delivery, before a human ever sees it. A real person
 * clicking several unrelated links back-to-back that fast is rare, so: 2+
 * clicks landing within a 30-second window are flagged as likely automated.
 * Not exact — a genuinely fast human could get flagged, a slower bot could
 * slip through — but it's a useful signal to separate raw vs. real engagement.
 */
function isLikelyAutomated(clicks: { clickedAt: Date }[]): boolean {
  if (clicks.length < 2) return false
  const times = clicks.map(c => c.clickedAt.getTime()).sort((a, b) => a - b)
  return times[times.length - 1] - times[0] <= 30_000
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const url = new URL(req.url)
  const tab = (url.searchParams.get('status') as RecipientTab) || 'SENT'
  const search = (url.searchParams.get('search') ?? '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50') || 50))

  const campaign = await db.emailCampaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const where = whereForTab(id, tab, search)

  const [recipients, totalCount, statusGroups, openedCount, chartRows, unsubscribedList] = await Promise.all([
    db.campaignRecipient.findMany({
      where,
      orderBy: orderByForTab(tab),
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clicks: { orderBy: { clickedAt: 'desc' } },
        opens: { orderBy: { openedAt: 'desc' } },
      },
    }),
    db.campaignRecipient.count({ where }),
    db.campaignRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: { id: true } }),
    db.campaignRecipient.count({ where: { campaignId: id, status: 'SENT', openedAt: { not: null } } }),
    // Lightweight rows (no email/name) for the trend/hour/link-performance charts —
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
    db.campaignRecipient.findMany({
      where: { campaignId: id, status: 'SKIPPED_UNSUBSCRIBED' },
      select: { id: true, name: true, email: true, unsubscribedAt: true },
      orderBy: { unsubscribedAt: 'desc' },
    }),
  ])

  const counts: Record<Exclude<RecipientTab, 'ALL'>, number> = {
    SENT: 0, PENDING: 0, BOUNCED: 0, FAILED: 0, UNSUBSCRIBED: 0, OPENED: openedCount,
  }
  for (const g of statusGroups) {
    if (g.status === 'SENT') counts.SENT = g._count.id
    else if (g.status === 'PENDING') counts.PENDING = g._count.id
    else if (g.status === 'BOUNCED') counts.BOUNCED = g._count.id
    else if (g.status === 'FAILED') counts.FAILED = g._count.id
    else if (g.status === 'SKIPPED_UNSUBSCRIBED') counts.UNSUBSCRIBED = g._count.id
  }

  // "Real" engagement — same counts, minus recipients whose only opens/clicks
  // look automated (see isLikelyAutomated above).
  let realOpened = 0
  let realClicked = 0
  for (const r of chartRows) {
    const automated = isLikelyAutomated(r.clicks)
    if (r.opens.length > 0 && !automated) realOpened++
    if (r.clicks.length > 0 && !automated) realClicked++
  }

  const recipientsWithFlag = recipients.map(r => ({ ...r, likelyAutomated: isLikelyAutomated(r.clicks) }))

  return NextResponse.json({
    ...campaign,
    recipients: recipientsWithFlag,
    recipientCounts: counts,
    engagementStats: { realOpened, realClicked },
    chartRows,
    unsubscribedList,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    totalCount,
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
