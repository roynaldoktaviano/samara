import type { PrismaClient } from '@prisma/client'

export interface ChannelBreakdown { channel: string; count: number }
export interface RevenueByChannel { channel: string; revenue: number }

export interface MarketingPerformanceSnapshot {
  campaigns: {
    statusCounts: Record<string, number>
    totalSentRecipients: number
    totalOpened: number
    totalClicked: number
    openRate: number
    clickRate: number
    recent: { id: string; name: string; status: string; sentAt: string | null; totalRecipients: number; openedCount: number; clickedCount: number }[]
  }
  automations: {
    active: number
    paused: number
    totalSent: number
    totalPending: number
    totalFailed: number
    list: { id: string; name: string; status: string; sentCount: number; pendingCount: number; failedCount: number }[]
  }
  audiences: { count: number }
  inquiries: {
    periodDays: number
    totalInPeriod: number
    bySource: ChannelBreakdown[]
  }
  revenue: {
    totalConfirmed: number
    byChannel: RevenueByChannel[]
  }
}

/**
 * Rolls up marketing performance from data that's actually flowing in production —
 * email campaigns, automations, CF7 form inquiries (with UTM first-touch), and booking
 * payments. Deliberately does NOT touch PageView: the pageview webhook and retroactive
 * lead-linking are fully built (see src/app/api/webhooks/pageview), but no tracking
 * script has ever been installed on the live site, so that table is empty in production.
 * Revenue attribution below uses each customer's earliest Inquiry as their acquisition
 * channel — a first-touch model, consistent with how Inquiry.utmSource itself is captured.
 */
export async function getMarketingPerformanceSnapshot(db: PrismaClient, periodDays = 180): Promise<MarketingPerformanceSnapshot> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  const [
    campaignStatusRows,
    totalSentRecipients,
    totalOpened,
    totalClicked,
    recentCampaigns,
    automations,
    audienceCount,
    periodInquiries,
    allInquiriesForAttribution,
    bookings,
  ] = await Promise.all([
    db.emailCampaign.groupBy({ by: ['status'], _count: { id: true } }),
    db.campaignRecipient.count({ where: { status: 'SENT' } }),
    db.campaignRecipient.count({ where: { status: 'SENT', openedAt: { not: null } } }),
    db.campaignRecipient.count({ where: { status: 'SENT', clickedAt: { not: null } } }),
    db.emailCampaign.findMany({
      where: { sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      take: 5,
      select: { id: true, name: true, status: true, sentAt: true, totalRecipients: true, recipients: { select: { openedAt: true, clickedAt: true } } },
    }),
    db.automation.findMany({ select: { id: true, name: true, status: true, enrollments: { select: { status: true } } } }),
    db.audienceSegment.count(),
    db.inquiry.findMany({ where: { createdAt: { gte: since } }, select: { utmSource: true, source: true } }),
    db.inquiry.findMany({ where: { customerId: { not: null } }, orderBy: { createdAt: 'asc' }, select: { customerId: true, utmSource: true, source: true } }),
    db.booking.findMany({ where: { status: { not: 'cancelled' } }, select: { customerId: true, payments: { where: { status: 'confirmed' }, select: { amount: true } } } }),
  ])

  const campaignStatusCounts = Object.fromEntries(campaignStatusRows.map(r => [r.status, r._count.id]))

  const recent = recentCampaigns.map(c => ({
    id: c.id, name: c.name, status: c.status, sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    totalRecipients: c.totalRecipients,
    openedCount: c.recipients.filter(r => r.openedAt).length,
    clickedCount: c.recipients.filter(r => r.clickedAt).length,
  }))

  const automationList = automations.map(a => ({
    id: a.id, name: a.name, status: a.status,
    sentCount: a.enrollments.filter(e => e.status === 'SENT').length,
    pendingCount: a.enrollments.filter(e => e.status === 'PENDING').length,
    failedCount: a.enrollments.filter(e => e.status === 'FAILED').length,
  }))

  const bySourceMap = new Map<string, number>()
  for (const inq of periodInquiries) {
    const key = inq.utmSource || inq.source || 'Direct / Unknown'
    bySourceMap.set(key, (bySourceMap.get(key) ?? 0) + 1)
  }
  const bySource = [...bySourceMap.entries()].sort((a, b) => b[1] - a[1]).map(([channel, count]) => ({ channel, count }))

  // First inquiry per customer, in chronological order — that's their acquisition channel.
  const firstChannelByCustomer = new Map<string, string>()
  for (const inq of allInquiriesForAttribution) {
    if (!inq.customerId || firstChannelByCustomer.has(inq.customerId)) continue
    firstChannelByCustomer.set(inq.customerId, inq.utmSource || inq.source || 'Direct / Unknown')
  }

  const revenueByChannelMap = new Map<string, number>()
  let totalConfirmed = 0
  for (const b of bookings) {
    const amount = b.payments.reduce((s, p) => s + p.amount, 0)
    if (amount === 0) continue
    totalConfirmed += amount
    const channel = (b.customerId && firstChannelByCustomer.get(b.customerId)) || 'Direct / Unknown'
    revenueByChannelMap.set(channel, (revenueByChannelMap.get(channel) ?? 0) + amount)
  }
  const byChannel = [...revenueByChannelMap.entries()].sort((a, b) => b[1] - a[1]).map(([channel, revenue]) => ({ channel, revenue }))

  return {
    campaigns: {
      statusCounts: campaignStatusCounts,
      totalSentRecipients, totalOpened, totalClicked,
      openRate: totalSentRecipients ? totalOpened / totalSentRecipients : 0,
      clickRate: totalSentRecipients ? totalClicked / totalSentRecipients : 0,
      recent,
    },
    automations: {
      active: automationList.filter(a => a.status === 'ACTIVE').length,
      paused: automationList.filter(a => a.status === 'PAUSED').length,
      totalSent: automationList.reduce((s, a) => s + a.sentCount, 0),
      totalPending: automationList.reduce((s, a) => s + a.pendingCount, 0),
      totalFailed: automationList.reduce((s, a) => s + a.failedCount, 0),
      list: automationList,
    },
    audiences: { count: audienceCount },
    inquiries: { periodDays, totalInPeriod: periodInquiries.length, bySource },
    revenue: { totalConfirmed, byChannel },
  }
}
