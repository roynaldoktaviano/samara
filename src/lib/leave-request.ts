// Shared validation for LeaveRequest.freelanceRecommendations — an optional array of
// { id, name, phone } contacts the requester knows of who could freelance-cover their
// trips while they're on leave. Used by both the HR-filed and self-service submit routes.

import type { PrismaClient } from '@prisma/client'
import { sendPushToUsers } from '@/lib/push'
import { matchEmployeesToYachts } from '@/lib/payroll'

export type LeaveType = 'LEAVE' | 'WFH' | 'SICK'

/** Title-case label for notification titles / badges. */
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { LEAVE: 'Leave', WFH: 'WFH', SICK: 'Sick leave' }
/** Lower-case noun for sentences: "your sick leave request". */
export const leaveKind = (t: LeaveType) => (t === 'LEAVE' ? 'leave' : t === 'WFH' ? 'WFH' : 'sick leave')
/** "requested 2 days off / WFH / sick leave". */
export const leaveOffLabel = (t: LeaveType) => (t === 'LEAVE' ? 'off' : leaveKind(t))
export function parseLeaveType(v: unknown): LeaveType {
  return v === 'WFH' || v === 'SICK' ? v : 'LEAVE'
}
/** Only LEAVE (annual leave) is capped by / deducted from Employee.leaveBalance. */
export const usesLeaveBalance = (t: LeaveType) => t === 'LEAVE'

export const SICK_LETTER_MAX_FILES = 5
/** Doctor's letter uploads: image/PDF data URLs, ~10 MB each, at most SICK_LETTER_MAX_FILES. */
export function sanitizeLeaveAttachments(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((v): v is string => typeof v === 'string'
      && /^data:(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf);base64,/.test(v)
      && v.length <= 14_000_000)
    .slice(0, SICK_LETTER_MAX_FILES)
}

export interface FreelanceRecommendation {
  id: string
  name: string
  phone: string
}

export function sanitizeFreelanceRecommendations(input: unknown): FreelanceRecommendation[] {
  if (!Array.isArray(input)) return []
  return (input as Record<string, unknown>[])
    .map(item => ({
      id: typeof item?.id === 'string' && item.id ? item.id : crypto.randomUUID(),
      name: typeof item?.name === 'string' ? item.name.trim() : '',
      phone: typeof item?.phone === 'string' ? item.phone.trim() : '',
    }))
    .filter(r => r.name || r.phone)
}

// Direct supervisors who are only *notified* of their reports' leave/sick/WFH requests,
// never asked to approve — HR alone decides those (2026-11-23: Marc). Matched by login
// email so it's a no-op on tenants where the account doesn't exist. Replaces the old
// role-based Sales skip, which existed only because the Sales team reports to Marc.
export const LEAVE_NOTIFY_ONLY_MANAGER_EMAILS = ['marc@samarayachting.com']

// Inclusive calendar-day count between two dates. Crew (Work Location matches a Yacht
// name — see matchEmployeesToYachts) work every day including weekends, so every day of
// their leave counts; everyone else skips Sat/Sun since those were never working days to
// begin with (mirrors the Attendance Recap weekend rule).
export function countLeaveDays(start: Date, end: Date, isCrew: boolean): number {
  if (isCrew) return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  let count = 0
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

// Resolves the single crew-leave approver for a yacht: prefers the CRUISE_DIRECTOR user
// assigned to it (User.assignedYachtId), falls back to a BOAT_CAPTAIN if no CD is
// assigned there — exactly one, never both ("salah satu aja"). Returns null if neither
// role has been assigned to that yacht yet, meaning the request skips straight to HR
// (see LeaveRequest.requiresCrewApproval).
// LEGACY single-step resolver — only still used for crew rows created before the
// Captain → CD split (requiresCrewApproval without the sub-flags). New code uses resolveYachtCrewApprovers.
export async function resolveCrewLeaveApprover(db: PrismaClient, yachtId: string): Promise<{ id: string; name: string | null; role: string } | null> {
  const users = await db.user.findMany({
    where: { role: { in: ['CRUISE_DIRECTOR', 'BOAT_CAPTAIN'] as never[] }, assignedYachtId: yachtId },
    select: { id: true, name: true, role: true },
  })
  return users.find(u => u.role === 'CRUISE_DIRECTOR') ?? users.find(u => u.role === 'BOAT_CAPTAIN') ?? null
}

// Both crew-leave approvers for a yacht (User.assignedYachtId): its BOAT_CAPTAIN (stage
// 1) and its CRUISE_DIRECTOR (stage 2). Either can be null — only Otium/Mischief have a
// CD; neither → the request skips straight to HR.
export async function resolveYachtCrewApprovers(db: PrismaClient, yachtId: string): Promise<{
  captain: { id: string; name: string | null } | null
  cd: { id: string; name: string | null } | null
}> {
  const users = await db.user.findMany({
    where: { role: { in: ['CRUISE_DIRECTOR', 'BOAT_CAPTAIN'] as never[] }, assignedYachtId: yachtId },
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: 'asc' },
  })
  const pick = (role: string) => { const u = users.find(x => x.role === role); return u ? { id: u.id, name: u.name } : null }
  return { captain: pick('BOAT_CAPTAIN'), cd: pick('CRUISE_DIRECTOR') }
}

// People who get an FYI notification whenever a crew leave request reaches HR's final
// approval stage (2026-11-09: Purchasing — Rosa, Accounting — Galuh). Matched by login
// email so it's a no-op on tenants where these accounts don't exist.
export const CREW_LEAVE_FYI_EMAILS = ['rosalina@samarayachting.com', 'galuh@samaraliveaboard.com']

// Notifies HR/Admin that a request now needs their final sign-off; for crew requests
// also sends the FYI to CREW_LEAVE_FYI_EMAILS. approvedByLabel null = it went straight
// to HR with no earlier step.
export async function notifyLeaveReachedHr(
  db: PrismaClient,
  opts: { employeeName: string; type: LeaveType; days: number; startDate: Date; endDate: Date; approvedByLabel: string | null; isCrew: boolean; excludeUserIds?: string[] },
) {
  const kind = leaveKind(opts.type)
  const range = `${opts.startDate.toISOString().slice(0, 10)} to ${opts.endDate.toISOString().slice(0, 10)}`
  const exclude = new Set(opts.excludeUserIds ?? [])
  const hrUsers = (await db.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] as never[] } }, select: { id: true } })).filter(u => !exclude.has(u.id))
  if (hrUsers.length) {
    const title = `${LEAVE_TYPE_LABEL[opts.type]} request needs your approval`
    const body = opts.approvedByLabel
      ? `${opts.employeeName}'s ${kind} request (${opts.days} day${opts.days !== 1 ? 's' : ''}, ${range}) was approved by ${opts.approvedByLabel} and now needs HR sign-off.`
      : `${opts.employeeName} requested ${opts.days} day${opts.days !== 1 ? 's' : ''} ${kind} (${range}) — needs HR approval.`
    await db.notification.createMany({
      data: hrUsers.map(u => ({ id: crypto.randomUUID(), userId: u.id, type: 'LEAVE_APPROVAL_NEEDED', title, body })),
      skipDuplicates: true,
    }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
  }
  if (opts.isCrew) {
    const hrIds = new Set(hrUsers.map(u => u.id))
    const fyi = (await db.user.findMany({ where: { email: { in: CREW_LEAVE_FYI_EMAILS } }, select: { id: true } })).filter(u => !hrIds.has(u.id) && !exclude.has(u.id))
    if (fyi.length) {
      const title = `Crew ${kind} request — FYI`
      const body = `${opts.employeeName} requested ${opts.days} day${opts.days !== 1 ? 's' : ''} ${kind} (${range})${opts.approvedByLabel ? `; approved by ${opts.approvedByLabel}` : ''}, now waiting on HR.`
      await db.notification.createMany({
        data: fyi.map(u => ({ id: crypto.randomUUID(), userId: u.id, type: 'LEAVE_FYI', title, body })),
        skipDuplicates: true,
      }).catch(() => {})
      sendPushToUsers(db, fyi.map(u => u.id), { title, body }).catch(() => {})
    }
  }
}

// ─── Parallel approval (2026-11-23) ─────────────────────────────────────────────────
// Leave / sick leave / WFH go to the direct supervisor(s) AND HR at the same time:
//   - crew (Work Location = a yacht name): that yacht's Captain and Cruise Director
//   - everyone else: Employee.manager (if they have a login) — unless that manager is in
//     LEAVE_NOTIFY_ONLY_MANAGER_EMAILS, who is only notified
// The first approve from any of them finalizes the request (APPROVED, leave balance
// debited, Attendance Recap synced — approveLeaveRequest). A supervisor's reject is
// recorded (captainRejected/crewRejected/managerRejected) but not final: HR can still
// approve. HR's reject is final.

export type LeaveSupervisorStage = 'manager' | 'captain' | 'cd'

export interface LeaveRouting {
  yachtId: string | undefined
  captainId: string | null
  cdId: string | null
  managerUserId: string | null
  /** Supervisors who only get an FYI (LEAVE_NOTIFY_ONLY_MANAGER_EMAILS). */
  fyiUserIds: string[]
}

/** Who approves a new request for this employee. Nobody approves their own request. */
export async function resolveLeaveRouting(
  db: PrismaClient,
  employee: { id: string; userId: string | null; location: { name: string } | null; manager: { userId: string | null } | null },
  yachts: { id: string; name: string }[],
): Promise<LeaveRouting> {
  const yachtId = matchEmployeesToYachts([{ id: employee.id, locationName: employee.location?.name ?? null }], yachts).get(employee.id)
  if (yachtId) {
    const { captain, cd } = await resolveYachtCrewApprovers(db, yachtId)
    return {
      yachtId,
      captainId: captain && captain.id !== employee.userId ? captain.id : null,
      cdId: cd && cd.id !== employee.userId ? cd.id : null,
      managerUserId: null,
      fyiUserIds: [],
    }
  }
  const mgrUserId = employee.manager?.userId && employee.manager.userId !== employee.userId ? employee.manager.userId : null
  if (!mgrUserId) return { yachtId, captainId: null, cdId: null, managerUserId: null, fyiUserIds: [] }
  const mgr = await db.user.findUnique({ where: { id: mgrUserId }, select: { email: true } })
  const notifyOnly = !!mgr?.email && LEAVE_NOTIFY_ONLY_MANAGER_EMAILS.includes(mgr.email.toLowerCase())
  return { yachtId, captainId: null, cdId: null, managerUserId: notifyOnly ? null : mgrUserId, fyiUserIds: notifyOnly ? [mgrUserId] : [] }
}

/** The LeaveRequest flags for a routing result. */
export function leaveRoutingFlags(r: LeaveRouting) {
  return {
    requiresCrewApproval: !!(r.captainId || r.cdId),
    requiresCaptainApproval: !!r.captainId,
    requiresCdApproval: !!r.cdId,
    requiresManagerApproval: !!r.managerUserId,
  }
}

/** Notifies every approver at once (supervisors + HR) and the notify-only supervisors. */
export async function notifyLeaveSubmitted(
  db: PrismaClient,
  routing: LeaveRouting,
  opts: { employeeName: string; type: LeaveType; days: number; startDate: Date; endDate: Date },
) {
  const range = `${opts.startDate.toISOString().slice(0, 10)} to ${opts.endDate.toISOString().slice(0, 10)}`
  const what = `${opts.days} day${opts.days !== 1 ? 's' : ''} ${leaveOffLabel(opts.type)} (${range})`
  const supervisorIds = [routing.captainId, routing.cdId, routing.managerUserId].filter((x): x is string => !!x)
  if (supervisorIds.length) {
    const title = `${routing.yachtId ? 'Crew ' : ''}${leaveKind(opts.type)} request needs your approval`.replace(/^./, c => c.toUpperCase())
    const body = `${opts.employeeName} requested ${what}. You or HR can approve — the first approval finalizes it.`
    await db.notification.createMany({
      data: supervisorIds.map(userId => ({ id: crypto.randomUUID(), userId, type: 'LEAVE_APPROVAL_NEEDED', title, body })),
    }).catch(() => {})
    sendPushToUsers(db, supervisorIds, { title, body }).catch(() => {})
  }
  const fyiIds = routing.fyiUserIds.filter(id => !supervisorIds.includes(id))
  if (fyiIds.length) {
    const title = `${LEAVE_TYPE_LABEL[opts.type]} request — FYI`
    const body = `${opts.employeeName} requested ${what}. No action needed — HR approves.`
    await db.notification.createMany({
      data: fyiIds.map(userId => ({ id: crypto.randomUUID(), userId, type: 'LEAVE_FYI', title, body })),
    }).catch(() => {})
    sendPushToUsers(db, fyiIds, { title, body }).catch(() => {})
  }
  await notifyLeaveReachedHr(db, {
    employeeName: opts.employeeName, type: opts.type, days: opts.days, startDate: opts.startDate, endDate: opts.endDate,
    approvedByLabel: null, isCrew: !!routing.yachtId, excludeUserIds: [...supervisorIds, ...fyiIds],
  })
}

type SupervisorStageFields = {
  status: string
  requiresCrewApproval: boolean
  requiresCaptainApproval: boolean
  captainApprovedAt: Date | string | null
  captainRejected: boolean
  requiresCdApproval: boolean
  crewApprovedAt: Date | string | null
  crewRejected: boolean
  requiresManagerApproval: boolean
  managerApprovedAt: Date | string | null
  managerRejected: boolean
}

/**
 * Which supervisor slot `userId` may still act on for this request, or null. Captain/CD
 * are live-resolved from the yacht (pass resolveYachtCrewApprovers' ids); legacy crew
 * rows (requiresCrewApproval without the sub-flags) are a single "CD, else Captain" slot
 * stored in the crewApproved* fields.
 */
export function supervisorStageFor(
  r: SupervisorStageFields,
  userId: string,
  ids: { managerUserId?: string | null; captainId?: string | null; cdId?: string | null; legacyCrewApproverId?: string | null },
): LeaveSupervisorStage | null {
  if (r.status !== 'PENDING') return null
  if (r.requiresManagerApproval && !r.managerApprovedAt && !r.managerRejected && ids.managerUserId === userId) return 'manager'
  if (r.requiresCaptainApproval && !r.captainApprovedAt && !r.captainRejected && ids.captainId === userId) return 'captain'
  if (r.requiresCdApproval && !r.crewApprovedAt && !r.crewRejected && ids.cdId === userId) return 'cd'
  const legacy = r.requiresCrewApproval && !r.requiresCaptainApproval && !r.requiresCdApproval
  if (legacy && !r.crewApprovedAt && !r.crewRejected && ids.legacyCrewApproverId === userId) return 'cd'
  return null
}

/** Fields that record a supervisor's decision on their own slot. */
export function supervisorDecisionData(stage: LeaveSupervisorStage, userId: string, note: string | null, rejected: boolean, at: Date) {
  if (stage === 'manager') return { managerApprovedById: userId, managerApprovedAt: at, managerDecisionNote: note, managerRejected: rejected }
  if (stage === 'captain') return { captainApprovedById: userId, captainApprovedAt: at, captainDecisionNote: note, captainRejected: rejected }
  return { crewApprovedById: userId, crewApprovedAt: at, crewDecisionNote: note, crewRejected: rejected }
}

export const SUPERVISOR_STAGE_LABEL: Record<LeaveSupervisorStage, string> = { manager: 'Manager', captain: 'Captain', cd: 'Cruise Director' }

/**
 * Final approval by anyone (supervisor or HR). Atomic on status so two approvers clicking
 * at once can't both debit the balance. Returns false if the request was already decided.
 * `stageData` = supervisorDecisionData(...) when a supervisor approves, {} for HR.
 */
export async function approveLeaveRequest(
  db: PrismaClient,
  opts: { id: string; approverUserId: string; note: string | null; approvedByLabel: string; byHr: boolean; stageData?: Record<string, unknown> },
): Promise<boolean> {
  const existing = await db.leaveRequest.findUnique({
    where: { id: opts.id },
    omit: { attachments: true },
    include: { employee: { select: { id: true, fullName: true, leaveBalance: true, userId: true, location: { select: { name: true } } } } },
  })
  if (!existing) return false
  const now = new Date()
  const res = await db.leaveRequest.updateMany({
    where: { id: opts.id, status: { in: ['PENDING', 'PENDING_HR_APPROVAL'] } },
    data: { ...(opts.stageData ?? {}), status: 'APPROVED', decidedById: opts.approverUserId, decidedAt: now, decisionNote: opts.note },
  })
  if (res.count === 0) return false

  // Only annual leave draws down the balance — WFH isn't time off and sick leave is separate.
  if (usesLeaveBalance(existing.type)) {
    const fresh = await db.employee.findUnique({ where: { id: existing.employeeId }, select: { leaveBalance: true } })
    await db.employee.update({ where: { id: existing.employeeId }, data: { leaveBalance: (fresh?.leaveBalance ?? 0) - existing.days } })
  }

  // Auto-reflect the approved request in Attendance Recap — one row per day in range.
  // Office staff skip weekend dates (never working days, see countLeaveDays); crew get
  // every day since they always work.
  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const isCrew = matchEmployeesToYachts([{ id: existing.employee.id, locationName: existing.employee.location?.name ?? null }], yachts).has(existing.employee.id)
  const dates: Date[] = []
  for (const d = new Date(existing.startDate); d <= existing.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isCrew || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) dates.push(new Date(d))
  }
  const attendanceStatus = existing.type === 'WFH' ? 'WFH' : existing.type === 'SICK' ? 'SAKIT' : 'CUTI'
  await Promise.all(dates.map(date => db.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: existing.employeeId, date } },
    create: { id: crypto.randomUUID(), employeeId: existing.employeeId, date, status: attendanceStatus, leaveRequestId: existing.id, setById: opts.approverUserId },
    update: { status: attendanceStatus, leaveRequestId: existing.id, setById: opts.approverUserId },
  })))

  const what = `${leaveKind(existing.type)} request (${existing.days} day${existing.days !== 1 ? 's' : ''})`
  if (existing.employee.userId) {
    const title = `${LEAVE_TYPE_LABEL[existing.type]} request approved`
    const body = `Your ${what} was approved by ${opts.approvedByLabel}.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }
  // A supervisor finalized it — tell HR so nobody acts on it twice.
  if (!opts.byHr) {
    const hrUsers = (await db.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] as never[] } }, select: { id: true } }))
      .filter(u => u.id !== opts.approverUserId)
    if (hrUsers.length) {
      const title = `${LEAVE_TYPE_LABEL[existing.type]} request approved by ${opts.approvedByLabel}`
      const body = `${existing.employee.fullName}'s ${what} was approved by ${opts.approvedByLabel} and is now in Attendance Recap. No action needed.`
      await db.notification.createMany({
        data: hrUsers.map(u => ({ id: crypto.randomUUID(), userId: u.id, type: 'LEAVE_FYI', title, body })),
      }).catch(() => {})
    }
  }
  return true
}

/**
 * A supervisor rejects their slot. Not final — the request stays PENDING for HR (and any
 * other supervisor) to decide. Returns false if it was already decided meanwhile.
 */
export async function recordSupervisorRejection(
  db: PrismaClient,
  opts: { id: string; stage: LeaveSupervisorStage; userId: string; note: string | null; rejectedByLabel: string },
): Promise<boolean> {
  const existing = await db.leaveRequest.findUnique({
    where: { id: opts.id },
    omit: { attachments: true },
    include: { employee: { select: { fullName: true, userId: true } } },
  })
  if (!existing) return false
  const res = await db.leaveRequest.updateMany({
    where: { id: opts.id, status: 'PENDING' },
    data: supervisorDecisionData(opts.stage, opts.userId, opts.note, true, new Date()),
  })
  if (res.count === 0) return false
  const what = `${leaveKind(existing.type)} request (${existing.days} day${existing.days !== 1 ? 's' : ''})`
  const hrUsers = await db.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] as never[] } }, select: { id: true } })
  if (hrUsers.length) {
    const title = `${LEAVE_TYPE_LABEL[existing.type]} request rejected by ${opts.rejectedByLabel}`
    const body = `${existing.employee.fullName}'s ${what} was rejected by ${opts.rejectedByLabel}${opts.note ? ` ("${opts.note}")` : ''}. HR makes the final decision.`
    await db.notification.createMany({
      data: hrUsers.map(u => ({ id: crypto.randomUUID(), userId: u.id, type: 'LEAVE_APPROVAL_NEEDED', title, body })),
    }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
  }
  if (existing.employee.userId) {
    const title = `${LEAVE_TYPE_LABEL[existing.type]} request rejected by ${opts.rejectedByLabel}`
    const body = `Your ${what} was rejected by ${opts.rejectedByLabel}. HR will make the final decision.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }
  return true
}

// "Who can still decide this?" for each pending LeaveRequest — every supervisor whose
// slot is still open (live-resolved Captain/CD, the manager) plus HR, joined with "or",
// and a note of any supervisor rejections. Decided requests get no entry.
export async function resolveLeaveWaitingOn(
  db: PrismaClient,
  requests: (SupervisorStageFields & { id: string; managerName: string | null; yachtId: string | undefined })[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const pending = requests.filter(r => r.status === 'PENDING' || r.status === 'PENDING_HR_APPROVAL')
  if (!pending.length) return out

  const hrUsers = await db.user.findMany({ where: { role: 'HR' as never }, select: { name: true }, orderBy: { name: 'asc' } })
  const hrNames = hrUsers.map(u => u.name).filter((n): n is string => !!n)
  const hrLabel = hrNames.length ? `HR (${hrNames.join(', ')})` : 'HR'
  const yachtCache = new Map<string, Awaited<ReturnType<typeof resolveYachtCrewApprovers>>>()

  for (const r of pending) {
    const parts: string[] = []
    const rejected: string[] = []
    if (r.status === 'PENDING') {
      if (r.requiresManagerApproval) {
        if (r.managerRejected) rejected.push('Manager')
        else if (!r.managerApprovedAt) parts.push(r.managerName ? `${r.managerName} (Manager)` : 'Manager')
      }
      if (r.requiresCrewApproval) {
        let crew = r.yachtId ? yachtCache.get(r.yachtId) : undefined
        if (r.yachtId && !crew) { crew = await resolveYachtCrewApprovers(db, r.yachtId); yachtCache.set(r.yachtId, crew) }
        const legacy = !r.requiresCaptainApproval && !r.requiresCdApproval
        if (r.requiresCaptainApproval) {
          if (r.captainRejected) rejected.push('Captain')
          else if (!r.captainApprovedAt) parts.push(crew?.captain ? `${crew.captain.name ?? 'Unnamed user'} (Captain)` : 'Captain (none assigned)')
        }
        if (r.requiresCdApproval || legacy) {
          const cdUser = legacy ? (crew?.cd ?? crew?.captain) : crew?.cd
          const label = legacy ? 'Cruise Director/Captain' : 'Cruise Director'
          if (r.crewRejected) rejected.push(label)
          else if (!r.crewApprovedAt) parts.push(cdUser ? `${cdUser.name ?? 'Unnamed user'} (${label})` : `${label} (none assigned)`)
        }
      }
    }
    parts.push(hrLabel)
    out.set(r.id, parts.join(' or ') + (rejected.length ? ` — rejected by ${rejected.join(', ')}` : ''))
  }
  return out
}
