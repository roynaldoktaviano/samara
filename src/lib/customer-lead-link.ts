import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * A person can submit an inquiry as a Lead before ever becoming a paying
 * Customer. When they later book, the Customer record created for them stays
 * separate from that original Lead — so any Inquiry/PageView captured while
 * they were still a Lead stays attached to `leadId`, invisible to anything
 * that only queries by `customerId`. This finds that original Lead (matched
 * by email or phone) so callers can pull its data in too.
 */
export async function findLinkedLeadId(db: PrismaClient, contact: { email?: string | null; phone?: string | null }): Promise<string | null> {
  const or: Prisma.LeadWhereInput[] = []
  if (contact.email) or.push({ email: { equals: contact.email, mode: 'insensitive' } })
  if (contact.phone) or.push({ phone: contact.phone })
  if (or.length === 0) return null

  const lead = await db.lead.findFirst({ where: { OR: or }, select: { id: true } })
  return lead?.id ?? null
}
