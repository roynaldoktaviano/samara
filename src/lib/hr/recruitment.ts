import type { Prisma, PrismaClient } from '@prisma/client'

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

/** Supervisors/heads (anyone with direct reports) — plus the owner/developer logins above. */
export function canRaiseRecruitmentRequest(email: string | null | undefined, directReports: number): boolean {
  if (directReports > 0) return true
  return !!email && RECRUITMENT_EXTRA_REQUESTER_EMAILS.includes(email.trim().toLowerCase())
}

// SystemSetting row holding the extra people (JSON array of User ids) told about every new
// Recruitment Request on top of HR — management who want to know what's being hired for.
// Edited from HR › Recruitment › Notification Recipients.
export const RECRUITMENT_NOTIFY_KEY = 'recruitment_notify_user_ids'

export async function getRecruitmentNotifyUserIds(db: PrismaClient): Promise<string[]> {
  const row = await db.systemSetting.findUnique({ where: { key: RECRUITMENT_NOTIFY_KEY } }).catch(() => null)
  if (!row?.textValue) return []
  try {
    const ids = JSON.parse(row.textValue)
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
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
} satisfies Prisma.RecruitmentRequestInclude

// Candidates the requester gets to see on their own request: only the ones HR has moved
// into (or past) the User Interview round — earlier screening stays HR-internal.
export const REQUESTER_VISIBLE_CANDIDATE: Prisma.CandidateWhereInput = {
  OR: [
    { status: { in: ['USER_INTERVIEW', 'OFFER', 'HIRED'] } },
    { userInterviewScheduledAt: { not: null } },
  ],
}
