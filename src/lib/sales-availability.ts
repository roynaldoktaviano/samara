import type { PrismaClient } from '@prisma/client'

// Who can take a new deal / chat right now (go-live parity B5: "round-robin, inactive members
// skipped"; "inactive owner → round-robin fallback"). A sales rep is unavailable when:
//  - their Leads Distribution "Away" switch is on (User.salesAway),
//  - their employee record is inactive / resigned (Employee.isActive = false or resignedAt passed),
//  - they are on approved LEAVE or SICK leave today (WITA calendar day). WFH still counts as working.
// A user with no employee record is treated as available (most sales logins have one, but the
// rule must not lock out an account HR hasn't set up).

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000

/** Start of `at`'s calendar day in WITA, as a UTC instant — leave dates are stored as that day's midnight. */
function witaDay(at: Date): { start: Date; end: Date } {
  const local = new Date(at.getTime() + WITA_OFFSET_MS)
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  return { start: new Date(startLocal - WITA_OFFSET_MS), end: new Date(startLocal - WITA_OFFSET_MS + 24 * 60 * 60 * 1000) }
}

/** The subset of `userIds` who are unavailable at `at`, with the reason (for logs / UI). */
export async function unavailableSalesUsers(db: PrismaClient, userIds: string[], at = new Date()): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return out
  const { start, end } = witaDay(at)
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, salesAway: true,
      employeeProfile: {
        select: {
          isActive: true, resignedAt: true,
          leaveRequests: {
            // Leave rows store whole days; any approved LEAVE/SICK whose range touches today counts.
            where: { status: 'APPROVED', type: { in: ['LEAVE', 'SICK'] }, startDate: { lt: end }, endDate: { gte: start } },
            select: { id: true }, take: 1,
          },
        },
      },
    },
  })
  const found = new Set(users.map(u => u.id))
  for (const id of ids) if (!found.has(id)) out.set(id, 'user not found')
  for (const u of users) {
    const emp = u.employeeProfile
    // Inactive first: a resigned rep who left "Away" on must still read as gone (isSalesUserStillEmployed).
    if (emp && (!emp.isActive || (emp.resignedAt && emp.resignedAt <= at))) { out.set(u.id, 'inactive'); continue }
    if (u.salesAway) { out.set(u.id, 'away'); continue }
    if (emp?.leaveRequests.length) out.set(u.id, 'on leave')
  }
  return out
}

export async function isSalesUserAvailable(db: PrismaClient, userId: string | null | undefined, at = new Date()): Promise<boolean> {
  if (!userId) return false
  return !(await unavailableSalesUsers(db, [userId], at)).has(userId)
}

/**
 * May `userId` keep owning a returning contact's new deal? Freshsales deal-maker rule (Marc, 14 Nov:
 * "NO active-owner check"): the contact owner always gets it — Away or on leave today does NOT move
 * the deal (relationship + parity with Freshsales). Only a gone owner (resigned / inactive employee /
 * deleted user, = a deactivated Freshsales user) falls back to round-robin.
 */
export async function isSalesUserStillEmployed(db: PrismaClient, userId: string | null | undefined, at = new Date()): Promise<boolean> {
  if (!userId) return false
  const why = (await unavailableSalesUsers(db, [userId], at)).get(userId)
  return why !== 'inactive' && why !== 'user not found'
}
