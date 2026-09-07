import type { PrismaClient, PurchaseOrderStatus } from '@prisma/client'
import { sendPushToUsers } from '@/lib/push'
import { resolveQuotationApproverId } from '@/lib/purchasing/quotationApproval'

// A PO still in one of these statuses hasn't reached a terminal state (RECEIVED/CANCELLED)
// yet, so "no movement" for it is actionable — nobody needs nagging about a closed PO.
const ACTIVE_STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']

const REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000
const ESCALATION_AFTER_MS = 5 * 24 * 60 * 60 * 1000
// Re-nag the PIC at most once per this window so a check that runs every few hours
// doesn't spam the same person — same convention as the other reminders in
// src/app/api/notifications/reminders/route.ts.
const RENOTIFY_AFTER_MS = 20 * 60 * 60 * 1000

const PURCHASING_ROLES = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

/**
 * Nags whoever created a PO (the Purchasing staffer handling it) once it's gone
 * REMINDER_AFTER_MS with no movement, and escalates to that staffer's manager (walking
 * Employee.managerId, same chain as resolveQuotationApproverId) once it's gone
 * ESCALATION_AFTER_MS. "Movement" means either the PO row itself changing (updatedAt)
 * or a follow-up note being logged against it (PurchaseFollowUp) — chasing a supplier
 * and logging it counts as progress even though the PO's own fields didn't change.
 *
 * Called from src/app/api/purchasing/orders/stagnant-check/route.ts, which is polled by
 * the in-process scheduler in src/instrumentation-node.ts (this app isn't deployed on
 * Vercel, so there's no platform cron — see that file for how scheduling actually works
 * here).
 */
export async function runStagnantPOCheck(db: PrismaClient) {
  const now = Date.now()
  const reminderCutoff = new Date(now - REMINDER_AFTER_MS)

  const candidates = await db.purchaseOrder.findMany({
    where: { status: { in: ACTIVE_STATUSES }, updatedAt: { lte: reminderCutoff } },
    select: {
      id: true,
      poNumber: true,
      status: true,
      updatedAt: true,
      createdById: true,
      createdBy: { select: { name: true } },
      followUps: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  })
  if (candidates.length === 0) return { reminded: 0, escalated: 0 }

  const stale = candidates
    .map(po => {
      const latestFollowUpAt = po.followUps[0]?.createdAt
      const lastActivity = latestFollowUpAt && latestFollowUpAt > po.updatedAt ? latestFollowUpAt : po.updatedAt
      return { ...po, lastActivity }
    })
    .filter(po => po.lastActivity.getTime() <= reminderCutoff.getTime())
  if (stale.length === 0) return { reminded: 0, escalated: 0 }

  const renotifyCutoff = new Date(now - RENOTIFY_AFTER_MS)
  const recentReminders = await db.notification.findMany({
    where: { type: 'PO_STAGNANT_REMINDER', orderId: { in: stale.map(po => po.id) }, createdAt: { gte: renotifyCutoff } },
    select: { orderId: true },
  })
  const recentlyReminded = new Set(recentReminders.map(n => n.orderId))
  const dueForReminder = stale.filter(po => !recentlyReminded.has(po.id))

  // Escalate once per stall — dedup by checking whether an escalation already went out
  // *since this PO's last activity*, so a PO that moves and later re-stalls escalates
  // again instead of staying silenced forever by an old escalation.
  const escalationCandidates = stale.filter(po => po.lastActivity.getTime() <= now - ESCALATION_AFTER_MS)
  let dueForEscalation: typeof escalationCandidates = []
  if (escalationCandidates.length > 0) {
    const existingEscalations = await db.notification.findMany({
      where: { type: 'PO_STAGNANT_ESCALATION', orderId: { in: escalationCandidates.map(po => po.id) } },
      select: { orderId: true, createdAt: true },
    })
    const lastEscalatedAt = new Map<string, Date>()
    for (const e of existingEscalations) {
      if (!e.orderId) continue
      const prev = lastEscalatedAt.get(e.orderId)
      if (!prev || e.createdAt > prev) lastEscalatedAt.set(e.orderId, e.createdAt)
    }
    dueForEscalation = escalationCandidates.filter(po => {
      const prev = lastEscalatedAt.get(po.id)
      return !prev || prev < po.lastActivity
    })
  }

  // Fallback audience when a PO has no createdById (legacy data, or the creator's
  // account was since deleted) — nag the whole Purchasing team instead of nobody.
  const purchasingFallback = dueForReminder.some(po => !po.createdById)
    ? await db.user.findMany({ where: { role: { in: PURCHASING_ROLES as never[] } }, select: { id: true } })
    : []

  const reminderRecords: { userId: string; type: string; title: string; body: string; orderId: string }[] = []
  for (const po of dueForReminder) {
    const daysStale = Math.floor((now - po.lastActivity.getTime()) / 86400000)
    const title = `PO ${po.poNumber} belum bergerak (${daysStale} hari)`
    const body = `${po.poNumber} masih di status ${po.status} tanpa perubahan selama ${daysStale} hari. Segera ditindaklanjuti.`
    const targets = po.createdById ? [po.createdById] : purchasingFallback.map(u => u.id)
    for (const userId of targets) reminderRecords.push({ userId, type: 'PO_STAGNANT_REMINDER', title, body, orderId: po.id })
  }
  if (reminderRecords.length > 0) {
    await db.notification.createMany({ data: reminderRecords })
    sendPushToUsers(db, [...new Set(reminderRecords.map(r => r.userId))], {
      title: 'PO belum bergerak',
      body: `${dueForReminder.length} PO butuh tindak lanjut.`,
    }).catch(console.error)
  }

  const escalationRecords: { userId: string; type: string; title: string; body: string; orderId: string }[] = []
  for (const po of dueForEscalation) {
    const daysStale = Math.floor((now - po.lastActivity.getTime()) / 86400000)
    const managerUserId = po.createdById ? await resolveQuotationApproverId(db, po.createdById) : null
    if (!managerUserId) continue
    const picName = po.createdBy?.name ?? 'Purchasing'
    const title = `PO ${po.poNumber} stuck ${daysStale} hari — perlu perhatian`
    const body = `${po.poNumber} ditangani ${picName}, masih di status ${po.status} selama ${daysStale} hari tanpa tindak lanjut.`
    escalationRecords.push({ userId: managerUserId, type: 'PO_STAGNANT_ESCALATION', title, body, orderId: po.id })
  }
  if (escalationRecords.length > 0) {
    await db.notification.createMany({ data: escalationRecords })
    sendPushToUsers(db, [...new Set(escalationRecords.map(r => r.userId))], {
      title: 'PO stuck perlu eskalasi',
      body: `${dueForEscalation.length} PO perlu perhatian atasan.`,
    }).catch(console.error)
  }

  return { reminded: reminderRecords.length, escalated: escalationRecords.length }
}
