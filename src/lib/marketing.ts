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
 * Fast, synchronous phase of sending: validates the campaign, flips it to SENDING,
 * resolves the audience, and upserts a PENDING CampaignRecipient row per recipient
 * (idempotent — re-running a partially-failed send won't duplicate rows). Safe to
 * await from an HTTP handler since it does no outbound email calls itself — the
 * actual dispatch (the slow part) is a separate step, see `dispatchCampaignEmails`.
 */
export async function prepareCampaignSend(db: PrismaClient, campaignId: string, apiKey: string): Promise<{ totalRecipients: number }> {
  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status === 'SENT' || campaign.status === 'SENDING') throw new Error('Campaign already sent')

  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  await db.emailCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } })

  const audience = await resolveAudience(db, campaign.audienceSources as AudienceSources)

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

  return { totalRecipients: audience.length }
}

/**
 * Slow phase: actually sends via Resend, updating each CampaignRecipient's status
 * the moment its send resolves (so a poller can show live progress), then rolls up
 * final counts onto the campaign. Meant to be called after `prepareCampaignSend` —
 * split out so the API route can respond to the browser as soon as prepare finishes
 * and let this run in the background rather than holding the request open for the
 * whole batch (which, at Resend's ~2 req/s rate limit, can take minutes for a large
 * audience).
 */
export async function dispatchCampaignEmails(db: PrismaClient, campaignId: string, apiKey: string): Promise<void> {
  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')

  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  const pending = await db.campaignRecipient.findMany({ where: { campaignId, status: 'PENDING' } })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  await sendBulkEmail({
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
    onSent: async (email, itemResult) => {
      const r = pending.find(p => p.email === email)
      if (!r) return
      if (itemResult.resendId) {
        await db.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'SENT', resendId: itemResult.resendId, sentAt: new Date() },
        })
      } else {
        await db.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'FAILED', errorMessage: itemResult.error ?? 'unknown error' },
        })
      }
    },
  })

  const [totalSent, totalFailed, totalRecipients] = await Promise.all([
    db.campaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
    db.campaignRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    db.campaignRecipient.count({ where: { campaignId } }),
  ])

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: totalFailed > 0 && totalSent === 0 ? 'FAILED' : 'SENT',
      totalRecipients,
      sentCount: totalSent,
      failedCount: totalFailed,
      sentAt: new Date(),
    },
  })
}

/**
 * Convenience wrapper that runs both phases back-to-back and awaits full
 * completion — used by the scheduled-dispatch cron route, which isn't blocking
 * a browser request and so has no reason to split the phases apart.
 */
export async function sendCampaign(db: PrismaClient, campaignId: string, apiKey: string): Promise<void> {
  await prepareCampaignSend(db, campaignId, apiKey)
  await dispatchCampaignEmails(db, campaignId, apiKey)
}

export function previewHtml(blocks: EmailBlock[]): string {
  return renderBlocksToHtml(blocks)
}
