import type { getDb } from '@/lib/get-db'
import { sendPushToUser } from '@/lib/push'

type Db = Awaited<ReturnType<typeof getDb>>

/**
 * A PR's approver is snapshotted from the requester's manager when it's filed
 * (PurchaseRequest.approverEmployeeId), so changing someone's "Reports To" afterwards left
 * their still-pending PRs waiting on the old manager. Called when an employee's manager
 * changes: moves those PRs to the new manager and tells them, the same way filing does.
 * Only PRs still sitting with the OLD manager move — one someone reassigned by hand stays put.
 * Skipped when the new manager has no login (nobody could approve it there).
 * Best-effort: never throws, so saving the employee never fails because of it.
 */
export async function reroutePendingPrApprovals(
  db: Db,
  employee: { id: string; userId: string | null; fullName: string },
  oldManagerId: string | null,
  newManagerId: string | null,
): Promise<number> {
  try {
    if (!oldManagerId || !newManagerId || oldManagerId === newManagerId) return 0
    const manager = await db.employee.findUnique({ where: { id: newManagerId }, select: { id: true, userId: true } })
    if (!manager?.userId) return 0

    const pending = await db.purchaseRequest.findMany({
      where: {
        status: 'PENDING_APPROVAL',
        approvedAt: null,
        approverEmployeeId: oldManagerId,
        OR: [
          { requestedByEmployeeId: employee.id },
          // Filed for themselves — no explicit requestedByEmployeeId, the creator is the requester.
          ...(employee.userId ? [{ requestedByEmployeeId: null, requestedById: employee.userId }] : []),
        ],
      },
      select: { id: true, prNumber: true, isUrgent: true, urgentReason: true },
    })

    for (const pr of pending) {
      await db.purchaseRequest.update({ where: { id: pr.id }, data: { approverEmployeeId: manager.id, updatedAt: new Date() } })
      const title = pr.isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval'
      const body = `${employee.fullName} — ${pr.prNumber} is waiting for your approval.`
      await db.notification.create({
        data: {
          userId: manager.userId,
          type: pr.isUrgent ? 'PR_APPROVAL_URGENT' : 'PR_APPROVAL_NEEDED',
          title,
          body: `${body}${pr.isUrgent && pr.urgentReason ? ` URGENT: ${pr.urgentReason}` : ''}`,
          requestId: pr.id,
        },
      }).catch(() => {})
      sendPushToUser(db, manager.userId, { title, body, url: '/' }).catch(() => {})
    }
    return pending.length
  } catch (e) {
    console.error('[reroutePendingPrApprovals]', (e as Error).message)
    return 0
  }
}
