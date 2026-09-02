import type { PrismaClient } from '@prisma/client'
import { renderBlocksToHtml, normalizeDesign, injectUnsubscribeUrl } from '@/lib/email-builder'
import { sendBulkEmail } from '@/lib/resend-mailer'

// Bookings in these statuses represent a real, paying trip — on_hold/pending/cancelled/
// pending_refund bookings never trigger a pre- or post-trip guest journey.
const TRIP_ACTIVE_STATUSES = ['confirmed', 'partially_paid', 'fully_paid', 'completed']

interface DueEntity {
  entityType: 'BOOKING' | 'CUSTOMER'
  entityId: string
  email: string
  name: string | null
}

// Local day-of-year math only — automations run relative to the tenant's own
// calendar day, not UTC instants, so this compares plain Y/M/D rather than epoch ms.
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

async function findDueEntities(db: PrismaClient, automation: { triggerType: string; offsetDays: number }, today: Date): Promise<DueEntity[]> {
  if (automation.triggerType === 'BEFORE_TRIP') {
    const bookings = await db.booking.findMany({
      where: { status: { in: TRIP_ACTIVE_STATUSES as any } },
      select: { id: true, startDate: true, customer: { select: { email: true, name: true } } },
    })
    return bookings
      .filter(b => isSameDay(addDays(b.startDate, -automation.offsetDays), today))
      .filter(b => !!b.customer.email)
      .map(b => ({ entityType: 'BOOKING', entityId: b.id, email: b.customer.email!, name: b.customer.name }))
  }

  if (automation.triggerType === 'AFTER_TRIP') {
    const bookings = await db.booking.findMany({
      where: { status: { in: TRIP_ACTIVE_STATUSES as any } },
      select: { id: true, endDate: true, customer: { select: { email: true, name: true } } },
    })
    return bookings
      .filter(b => isSameDay(addDays(b.endDate, automation.offsetDays), today))
      .filter(b => !!b.customer.email)
      .map(b => ({ entityType: 'BOOKING', entityId: b.id, email: b.customer.email!, name: b.customer.name }))
  }

  // GUEST_BIRTHDAY — yearly recurrence, so only month/day are compared (not year).
  const customers = await db.customer.findMany({
    where: { deletedAt: null, email: { not: null }, dateOfBirth: { not: null } },
    select: { id: true, dateOfBirth: true, email: true, name: true },
  })
  return customers
    .filter(c => {
      const target = addDays(c.dateOfBirth!, automation.offsetDays)
      return target.getMonth() === today.getMonth() && target.getDate() === today.getDate()
    })
    .map(c => ({ entityType: 'CUSTOMER', entityId: c.id, email: c.email!, name: c.name }))
}

/**
 * Evaluates every ACTIVE automation for one tenant: enrolls newly-due bookings/customers
 * (the unique constraint on AutomationEnrollment makes this idempotent — running the tick
 * twice on the same day never double-emails anyone), then sends to whatever is still
 * PENDING. Mirrors prepareCampaignSend + dispatchCampaignEmails in src/lib/marketing.ts,
 * collapsed into one pass since automation batches are small (one tenant-day at a time).
 */
export async function runAutomationsTick(db: PrismaClient, apiKey: string, appUrl: string): Promise<{ automationId: string; enrolled: number; sent: number; failed: number }[]> {
  const automations = await db.automation.findMany({ where: { status: 'ACTIVE' }, include: { template: true } })
  const today = new Date()
  const results: { automationId: string; enrolled: number; sent: number; failed: number }[] = []

  for (const automation of automations) {
    const due = await findDueEntities(db, automation, today)

    const alreadyEnrolled = due.length === 0 ? [] : await db.automationEnrollment.findMany({
      where: { automationId: automation.id, OR: due.map(e => ({ entityType: e.entityType, entityId: e.entityId })) },
      select: { entityType: true, entityId: true },
    })
    const alreadyEnrolledKeys = new Set(alreadyEnrolled.map(e => `${e.entityType}:${e.entityId}`))
    const newlyDue = due.filter(e => !alreadyEnrolledKeys.has(`${e.entityType}:${e.entityId}`))

    for (const entity of newlyDue) {
      await db.automationEnrollment.upsert({
        where: { automationId_entityType_entityId: { automationId: automation.id, entityType: entity.entityType, entityId: entity.entityId } },
        update: {},
        create: { automationId: automation.id, entityType: entity.entityType, entityId: entity.entityId, email: entity.email, name: entity.name },
      })
    }
    const enrolled = newlyDue.length

    const pending = await db.automationEnrollment.findMany({ where: { automationId: automation.id, status: 'PENDING' } })
    if (pending.length === 0) {
      results.push({ automationId: automation.id, enrolled, sent: 0, failed: 0 })
      continue
    }

    const unsubscribed = await db.emailUnsubscribe.findMany({
      where: { email: { in: pending.map(p => p.email) } }, select: { email: true },
    })
    const suppressed = new Set(unsubscribed.map(u => u.email.toLowerCase()))
    const toSkip = pending.filter(p => suppressed.has(p.email.toLowerCase()))
    const toSend = pending.filter(p => !suppressed.has(p.email.toLowerCase()))

    if (toSkip.length > 0) {
      await db.automationEnrollment.updateMany({ where: { id: { in: toSkip.map(s => s.id) } }, data: { status: 'SKIPPED_UNSUBSCRIBED' } })
    }
    if (toSend.length === 0) {
      results.push({ automationId: automation.id, enrolled, sent: 0, failed: 0 })
      continue
    }

    const design = normalizeDesign(automation.template.blocksJson)
    const baseHtml = renderBlocksToHtml(design.blocks, design.settings)

    const sendResult = await sendBulkEmail({
      apiKey,
      from: automation.fromEmail,
      fromName: automation.fromName ?? undefined,
      subject: automation.subject,
      recipients: toSend.map(r => {
        const unsubscribePageUrl = `${appUrl}/unsubscribe?token=${r.unsubscribeToken}`
        return {
          email: r.email,
          htmlFor: injectUnsubscribeUrl(baseHtml, unsubscribePageUrl),
          unsubscribeUrl: `${appUrl}/api/marketing/unsubscribe?token=${r.unsubscribeToken}`,
        }
      }),
      onSent: async (email, itemResult) => {
        const r = toSend.find(p => p.email === email)
        if (!r) return
        if (itemResult.resendId) {
          await db.automationEnrollment.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: new Date() } })
        } else {
          await db.automationEnrollment.update({ where: { id: r.id }, data: { status: 'FAILED', errorMessage: itemResult.error ?? 'unknown error' } })
        }
      },
    })

    results.push({
      automationId: automation.id,
      enrolled,
      sent: Object.keys(sendResult.sentIds).length,
      failed: Object.keys(sendResult.failures).length,
    })
  }

  return results
}
