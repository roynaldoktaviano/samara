// Shared validation for LeaveRequest.freelanceRecommendations — an optional array of
// { id, name, phone } contacts the requester knows of who could freelance-cover their
// trips while they're on leave. Used by both the HR-filed and self-service submit routes.

import type { PrismaClient } from '@prisma/client'

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

// Resolves the single crew-leave approver for a yacht: prefers the CRUISE_DIRECTOR user
// assigned to it (User.assignedYachtId), falls back to a BOAT_CAPTAIN if no CD is
// assigned there — exactly one, never both ("salah satu aja"). Returns null if neither
// role has been assigned to that yacht yet, meaning the request skips straight to HR
// (see LeaveRequest.requiresCrewApproval).
export async function resolveCrewLeaveApprover(db: PrismaClient, yachtId: string): Promise<{ id: string; name: string | null } | null> {
  const users = await db.user.findMany({
    where: { role: { in: ['CRUISE_DIRECTOR', 'BOAT_CAPTAIN'] as never[] }, assignedYachtId: yachtId },
    select: { id: true, name: true, role: true },
  })
  return users.find(u => u.role === 'CRUISE_DIRECTOR') ?? users.find(u => u.role === 'BOAT_CAPTAIN') ?? null
}
