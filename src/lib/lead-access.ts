import type { Prisma, PrismaClient } from '@prisma/client'

// A SALES rep only ever sees the Leads they own — unowned leads are handed out by
// auto-distribution or an admin, never browsed/claimed by sales. Every other role that
// can open Leads (ADMIN, MARKETING, combined roles…) keeps the full list.
export function isOwnLeadsOnly(role: string | null | undefined): boolean {
  return role === 'SALES'
}

/** Extra Lead `where` for the current user — `{}` when they may see every lead. */
export function leadOwnerScope(role: string | null | undefined, userId: string): Prisma.LeadWhereInput {
  return isOwnLeadsOnly(role) ? { ownerId: userId } : {}
}

/** False when the lead doesn't exist or the user isn't allowed to see it (respond 404 either way). */
export async function canAccessLead(
  db: PrismaClient, role: string | null | undefined, userId: string, leadId: string,
): Promise<boolean> {
  return !!(await db.lead.findFirst({ where: { id: leadId, ...leadOwnerScope(role, userId) }, select: { id: true } }))
}
