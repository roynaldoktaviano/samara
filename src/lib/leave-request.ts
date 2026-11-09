// Shared validation for LeaveRequest.freelanceRecommendations — an optional array of
// { id, name, phone } contacts the requester knows of who could freelance-cover their
// trips while they're on leave. Used by both the HR-filed and self-service submit routes.

import type { PrismaClient } from '@prisma/client'
import { sendPushToUsers } from '@/lib/push'

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

// Employees whose login has one of these roles skip the manager stage and go straight to
// HR — the Sales team all report to the same director (Marc), who asked not to be in the
// leave-approval loop for them (2026-11-09). Other roles reporting to him still go
// through him.
export const LEAVE_SKIP_MANAGER_ROLES = ['SALES']

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
// Captain → CD split (see crewLeaveStage's 'legacy'). New code uses resolveYachtCrewApprovers.
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

type CrewStageFields = {
  status: string
  requiresCrewApproval: boolean
  requiresCaptainApproval: boolean
  captainApprovedAt: Date | string | null
  requiresCdApproval: boolean
  crewApprovedAt: Date | string | null
}

// Which crew stage a LeaveRequest is currently sitting in (null = not in a crew stage).
// 'legacy' = row from before the Captain → CD split: one step by "CD, else Captain".
export function crewLeaveStage(r: CrewStageFields): 'captain' | 'cd' | 'legacy' | null {
  if (r.status !== 'PENDING' || !r.requiresCrewApproval) return null
  if (!r.requiresCaptainApproval && !r.requiresCdApproval) return 'legacy'
  if (r.requiresCaptainApproval && !r.captainApprovedAt) return 'captain'
  if (r.requiresCdApproval && !r.crewApprovedAt) return 'cd'
  return null
}

// The specific user who must act on a request's current crew stage (live-resolved from
// the yacht, same as everywhere else), or null if nobody / not in a crew stage.
export async function resolveCrewStageApprover(db: PrismaClient, r: CrewStageFields, yachtId: string | undefined) {
  const stage = crewLeaveStage(r)
  if (!stage || !yachtId) return null
  if (stage === 'legacy') {
    const a = await resolveCrewLeaveApprover(db, yachtId)
    return a ? { id: a.id, name: a.name, label: a.role === 'BOAT_CAPTAIN' ? 'Captain' : 'Cruise Director' } : null
  }
  const { captain, cd } = await resolveYachtCrewApprovers(db, yachtId)
  const a = stage === 'captain' ? captain : cd
  return a ? { ...a, label: stage === 'captain' ? 'Captain' : 'Cruise Director' } : null
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
  opts: { employeeName: string; type: 'LEAVE' | 'WFH'; days: number; startDate: Date; endDate: Date; approvedByLabel: string | null; isCrew: boolean },
) {
  const kind = opts.type === 'WFH' ? 'WFH' : 'leave'
  const range = `${opts.startDate.toISOString().slice(0, 10)} to ${opts.endDate.toISOString().slice(0, 10)}`
  const hrUsers = await db.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] as never[] } }, select: { id: true } })
  if (hrUsers.length) {
    const title = opts.type === 'WFH' ? 'WFH request needs your final approval' : 'Leave request needs your final approval'
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
    const fyi = (await db.user.findMany({ where: { email: { in: CREW_LEAVE_FYI_EMAILS } }, select: { id: true } })).filter(u => !hrIds.has(u.id))
    if (fyi.length) {
      const title = opts.type === 'WFH' ? 'Crew WFH request — FYI' : 'Crew leave request — FYI'
      const body = `${opts.employeeName} requested ${opts.days} day${opts.days !== 1 ? 's' : ''} ${kind} (${range})${opts.approvedByLabel ? `; approved by ${opts.approvedByLabel}` : ''}, now waiting on HR.`
      await db.notification.createMany({
        data: fyi.map(u => ({ id: crypto.randomUUID(), userId: u.id, type: 'LEAVE_FYI', title, body })),
        skipDuplicates: true,
      }).catch(() => {})
      sendPushToUsers(db, fyi.map(u => u.id), { title, body }).catch(() => {})
    }
  }
}

// "Who is this still waiting on?" for each pending LeaveRequest, so both HR and the
// requester can see where a request is stuck: the current crew stage's Captain/Cruise
// Director (live-resolved), the employee's manager for the manager stage, otherwise HR
// (any HR/Admin can decide — see ../app/api/hr/leave-requests/[id]/route.ts — so it
// names the HR-role users). Decided requests get no entry.
export async function resolveLeaveWaitingOn(
  db: PrismaClient,
  requests: (CrewStageFields & { id: string; requiresManagerApproval: boolean; managerName: string | null; yachtId: string | undefined })[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const pending = requests.filter(r => r.status === 'PENDING' || r.status === 'PENDING_HR_APPROVAL')
  if (!pending.length) return out

  let hrLabel: string | null = null
  for (const r of pending) {
    if (r.status === 'PENDING' && r.requiresManagerApproval) {
      out.set(r.id, r.managerName ? `${r.managerName} (Manager)` : 'Manager')
      continue
    }
    const stage = crewLeaveStage(r)
    if (stage) {
      const a = await resolveCrewStageApprover(db, r, r.yachtId)
      const fallback = stage === 'captain' ? 'Captain' : stage === 'cd' ? 'Cruise Director' : 'Cruise Director/Captain'
      out.set(r.id, a ? `${a.name ?? 'Unnamed user'} (${a.label})` : `${fallback} (none assigned)`)
      continue
    }
    if (hrLabel === null) {
      const hrUsers = await db.user.findMany({ where: { role: 'HR' as never }, select: { name: true }, orderBy: { name: 'asc' } })
      const names = hrUsers.map(u => u.name).filter((n): n is string => !!n)
      hrLabel = names.length ? `HR (${names.join(', ')})` : 'HR'
    }
    out.set(r.id, hrLabel)
  }
  return out
}
