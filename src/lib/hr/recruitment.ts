import type { Prisma, PrismaClient } from '@prisma/client'
import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'

export const RECRUITMENT_REASONS = ['New Position', 'Replacement'] as const
export const RECRUITMENT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

// Logins that may raise Recruitment Requests even without direct reports in the Employee
// tree. Everyone else still needs direct reports (i.e. is an HOD/Supervisor).
const RECRUITMENT_EXTRA_REQUESTER_EMAILS = [
  // Owners — permanent.
  'marc@samarayachting.com',
  'fresa@samarayachting.com',
  // Developer test access — TEMPORARY, remove once recruitment testing is done.
  'roy@samarayachting.com',
]

/** Supervisors/heads (anyone with direct reports), the HR role (raises requests on behalf of
 *  others too), plus the owner/developer logins above. */
export function canRaiseRecruitmentRequest(email: string | null | undefined, directReports: number, role?: string | null): boolean {
  if (directReports > 0) return true
  if (roleMatches(role, ['HR'])) return true
  return !!email && RECRUITMENT_EXTRA_REQUESTER_EMAILS.includes(email.trim().toLowerCase())
}

// SystemSetting row holding the extra people (JSON array of User ids) told about every new
// Recruitment Request on top of HR — management who want to know what's being hired for.
// Edited from HR › Recruitment › Notification Recipients.
export const RECRUITMENT_NOTIFY_KEY = 'recruitment_notify_user_ids'

export async function getRecruitmentNotifyUserIds(db: PrismaClient): Promise<string[]> {
  return readUserIdListSetting(db, RECRUITMENT_NOTIFY_KEY)
}

// SystemSetting row holding the approver chain (JSON array of User ids). When non-empty,
// a new request starts AWAITING_APPROVAL and must be approved by EVERY one of them (from
// their My Approvals page) before it reaches HR as PENDING. Edited from HR › Recruitment ›
// Approvers; snapshotted onto each request at creation, so later edits don't move
// requests already in flight.
export const RECRUITMENT_APPROVERS_KEY = 'recruitment_approver_user_ids'

async function readUserIdListSetting(db: PrismaClient, key: string): Promise<string[]> {
  const row = await db.systemSetting.findUnique({ where: { key } }).catch(() => null)
  if (!row?.textValue) return []
  try {
    const ids = JSON.parse(row.textValue)
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Configured approvers that still exist as users. */
export async function getRecruitmentApproverIds(db: PrismaClient): Promise<string[]> {
  const ids = await readUserIdListSetting(db, RECRUITMENT_APPROVERS_KEY)
  if (!ids.length) return []
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })
  const existing = new Set(users.map(u => u.id))
  return ids.filter(id => existing.has(id))
}

// Who hears about a new request: every HR user (they process it) plus the configured
// recipients. Only if both are empty does it fall back to Admins, so a request never
// lands unseen.
export async function getNewRequestRecipientIds(db: PrismaClient): Promise<string[]> {
  const [hrUsers, extra] = await Promise.all([
    db.user.findMany({ where: { role: 'HR' }, select: { id: true } }),
    getRecruitmentNotifyUserIds(db),
  ])
  const ids = new Set([...hrUsers.map(u => u.id), ...extra])
  if (ids.size === 0) {
    const admins = await db.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })
    admins.forEach(u => ids.add(u.id))
  }
  return [...ids]
}

// The Recruitment Request shape both the HR screen and the requester's own screen read.
export const RECRUITMENT_REQUEST_INCLUDE = {
  role: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  requesterEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
  replacementEmployee: { select: { id: true, fullName: true, employeeNumber: true, role: { select: { title: true } } } },
  decidedBy: { select: { id: true, name: true } },
  approvals: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, decision: true, decidedAt: true, note: true, approver: { select: { id: true, name: true } } },
  },
} satisfies Prisma.RecruitmentRequestInclude

// Candidates the requester gets to see on their own request: only the ones HR has moved
// into (or past) the User Interview round — earlier screening stays HR-internal.
export const REQUESTER_VISIBLE_CANDIDATE: Prisma.CandidateWhereInput = {
  OR: [
    { status: { in: ['USER_INTERVIEW', 'OFFER', 'HIRED'] } },
    { userInterviewScheduledAt: { not: null } },
  ],
}

/** One-line summary used in every recruitment notification: "Name (Dept) requested to hire 2× Chef — Replacement." */
export function recruitmentRequestSummary(r: {
  headcount: number; reason: string; requesterDepartment: string | null
  role: { title: string }
  requesterEmployee: { fullName: string } | null
  requestedBy: { name: string | null }
}): string {
  const name = r.requesterEmployee?.fullName ?? r.requestedBy.name ?? 'Someone'
  const dept = r.requesterDepartment?.trim() ? ` (${r.requesterDepartment.trim()})` : ''
  return `${name}${dept} requested to hire ${r.headcount}× ${r.role.title} — ${r.reason}.`
}

async function notifyUsers(db: PrismaClient, userIds: string[], type: string, title: string, body: string) {
  if (!userIds.length) return
  await db.notification.createMany({ data: userIds.map(userId => ({ userId, type, title, body })) }).catch(() => {})
  sendPushToUsers(db, userIds, { title, body }).catch(() => {})
}

/** A request just reached HR (PENDING) — tell HR + the configured notification recipients. */
export async function notifyRecruitmentReachedHr(
  db: PrismaClient,
  r: Parameters<typeof recruitmentRequestSummary>[0] & { priority: string },
  excludeUserId?: string,
) {
  const ids = (await getNewRequestRecipientIds(db)).filter(id => id !== excludeUserId)
  const title = r.priority === 'HIGH' ? 'New recruitment request — High priority' : 'New recruitment request'
  await notifyUsers(db, ids, 'RECRUITMENT_REQUESTED', title, recruitmentRequestSummary(r))
}

/** A request is waiting on these approvers — tell them it's in their My Approvals. */
export async function notifyRecruitmentApprovers(
  db: PrismaClient,
  r: Parameters<typeof recruitmentRequestSummary>[0] & { priority: string },
  approverIds: string[],
) {
  const title = r.priority === 'HIGH' ? 'Recruitment request needs your approval — High priority' : 'Recruitment request needs your approval'
  await notifyUsers(db, approverIds, 'RECRUITMENT_APPROVAL_NEEDED', title, `${recruitmentRequestSummary(r)} Review it in My Approvals.`)
}

/** Tell the requester about an approval-chain or HR decision. */
export async function notifyRecruitmentRequester(db: PrismaClient, requesterId: string, title: string, body: string) {
  await notifyUsers(db, [requesterId], 'RECRUITMENT_REQUEST_DECIDED', title, body)
}
