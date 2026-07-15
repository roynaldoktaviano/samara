import type { PrismaClient } from '@prisma/client'
import { renderBlocksToHtml, injectUnsubscribeUrl, injectPreviewText, type EmailBlock } from '@/lib/email-builder'
import { sendBulkEmail } from '@/lib/resend-mailer'

export interface AudienceSources {
  customers?: { search?: string } | boolean
  agents?: { search?: string } | boolean
  agentContacts?: { search?: string } | boolean
  manualEmails?: string[]
}

export interface AudienceMember {
  email: string
  name: string | null
  sourceType: 'CUSTOMER' | 'AGENT' | 'AGENT_CONTACT' | 'MANUAL'
  sourceId: string | null
}

/**
 * Resolves an audience spec into a deduplicated recipient list, excluding
 * anyone on the tenant's unsubscribe suppression list. First match wins on
 * duplicate emails across sources (customers > agents > agent contacts > manual).
 */
export async function resolveAudience(db: PrismaClient, sources: AudienceSources): Promise<AudienceMember[]> {
  const byEmail = new Map<string, AudienceMember>()

  const asFilter = (v: { search?: string } | boolean | undefined) =>
    v === true ? {} : (v && typeof v === 'object') ? v : null

  const customerFilter = asFilter(sources.customers)
  if (customerFilter) {
    const where: Record<string, unknown> = { deletedAt: null, email: { not: null } }
    if (customerFilter.search) {
      where.OR = [
        { name: { contains: customerFilter.search, mode: 'insensitive' } },
        { email: { contains: customerFilter.search, mode: 'insensitive' } },
      ]
    }
    const customers = await db.customer.findMany({ where, select: { id: true, name: true, email: true } })
    for (const c of customers) {
      if (c.email && !byEmail.has(c.email.toLowerCase())) {
        byEmail.set(c.email.toLowerCase(), { email: c.email, name: c.name, sourceType: 'CUSTOMER', sourceId: c.id })
      }
    }
  }

  const agentFilter = asFilter(sources.agents)
  if (agentFilter) {
    const where: Record<string, unknown> = { email: { not: null } }
    if (agentFilter.search) {
      where.OR = [
        { name: { contains: agentFilter.search, mode: 'insensitive' } },
        { email: { contains: agentFilter.search, mode: 'insensitive' } },
      ]
    }
    const agents = await db.agent.findMany({ where, select: { id: true, name: true, email: true } })
    for (const a of agents) {
      if (a.email && !byEmail.has(a.email.toLowerCase())) {
        byEmail.set(a.email.toLowerCase(), { email: a.email, name: a.name, sourceType: 'AGENT', sourceId: a.id })
      }
    }
  }

  const agentContactFilter = asFilter(sources.agentContacts)
  if (agentContactFilter) {
    const where: Record<string, unknown> = { email: { not: null } }
    if (agentContactFilter.search) {
      where.OR = [
        { name: { contains: agentContactFilter.search, mode: 'insensitive' } },
        { email: { contains: agentContactFilter.search, mode: 'insensitive' } },
      ]
    }
    const contacts = await db.agentContact.findMany({ where, select: { id: true, name: true, email: true } })
    for (const c of contacts) {
      if (c.email && !byEmail.has(c.email.toLowerCase())) {
        byEmail.set(c.email.toLowerCase(), { email: c.email, name: c.name, sourceType: 'AGENT_CONTACT', sourceId: c.id })
      }
    }
  }

  for (const raw of sources.manualEmails ?? []) {
    const email = raw.trim()
    if (email && !byEmail.has(email.toLowerCase())) {
      byEmail.set(email.toLowerCase(), { email, name: null, sourceType: 'MANUAL', sourceId: null })
    }
  }

  if (byEmail.size === 0) return []

  const unsubscribed = await db.emailUnsubscribe.findMany({
    where: { email: { in: [...byEmail.values()].map(m => m.email) } },
    select: { email: true },
  })
  const suppressed = new Set(unsubscribed.map(u => u.email.toLowerCase()))

  return [...byEmail.values()].filter(m => !suppressed.has(m.email.toLowerCase()))
}

/**
 * Sends (or re-sends failed recipients of) a campaign: creates CampaignRecipient
 * rows for its resolved audience, sends via Resend, and updates counts/status.
 * Shared by the immediate-send API route and the scheduled-dispatch cron route.
 */
export async function sendCampaign(db: PrismaClient, campaignId: string): Promise<void> {
  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status === 'SENT' || campaign.status === 'SENDING') return

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  await db.emailCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } })

  const audience = await resolveAudience(db, campaign.audienceSources as AudienceSources)

  // Upsert recipient rows (idempotent — re-running a partially-failed send won't duplicate rows)
  for (const member of audience) {
    await db.campaignRecipient.upsert({
      where: { campaignId_email: { campaignId, email: member.email } },
      update: {},
      create: {
        campaignId,
        email: member.email,
        name: member.name,
        sourceType: member.sourceType,
        sourceId: member.sourceId,
      },
    })
  }

  const pending = await db.campaignRecipient.findMany({
    where: { campaignId, status: 'PENDING' },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const result = await sendBulkEmail({
    apiKey,
    from: campaign.fromEmail,
    fromName: campaign.fromName ?? undefined,
    subject: campaign.subject,
    recipients: pending.map(r => {
      const unsubscribeUrl = `${appUrl}/unsubscribe?token=${r.unsubscribeToken}`
      let html = injectUnsubscribeUrl(campaign.bodyHtml, unsubscribeUrl)
      if (campaign.previewText) html = injectPreviewText(html, campaign.previewText)
      return {
        email: r.email,
        htmlFor: html,
        unsubscribeUrl,
      }
    }),
  })

  let sentCount = 0
  let failedCount = 0
  for (const r of pending) {
    const resendId = result.sentIds[r.email]
    const failure = result.failures[r.email]
    if (resendId) {
      sentCount += 1
      await db.campaignRecipient.update({
        where: { id: r.id },
        data: { status: 'SENT', resendId, sentAt: new Date() },
      })
    } else {
      failedCount += 1
      await db.campaignRecipient.update({
        where: { id: r.id },
        data: { status: 'FAILED', errorMessage: failure ?? 'unknown error' },
      })
    }
  }

  const totalSent = (campaign.sentCount ?? 0) + sentCount
  const totalFailed = (campaign.failedCount ?? 0) + failedCount

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: totalFailed > 0 && totalSent === 0 ? 'FAILED' : 'SENT',
      totalRecipients: audience.length,
      sentCount: totalSent,
      failedCount: totalFailed,
      sentAt: new Date(),
    },
  })
}

export function previewHtml(blocks: EmailBlock[]): string {
  return renderBlocksToHtml(blocks)
}
