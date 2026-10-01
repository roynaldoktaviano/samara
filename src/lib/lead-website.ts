import type { Prisma } from '@prisma/client'

// Pseudo-website for leads whose inquiries carry no website at all (mostly old Freshsales
// imports) — offered alongside the real sites in the Leads "Website" filter and the email
// audience "Came from website" picker. Leads with no inquiry (manual / WhatsApp) aren't
// included, since they never came through a website form in the first place.
export const ANONYMOUS_WEBSITE = 'Anonymous'

// Lead matches if it came from ANY of `websites` (an inquiry from that site, or — for
// ANONYMOUS_WEBSITE — inquiries but none with a website recorded).
export function leadWebsiteWhere(websites: string[]): Prisma.LeadWhereInput {
  const sites = websites.filter(w => w !== ANONYMOUS_WEBSITE)
  const or: Prisma.LeadWhereInput[] = []
  if (sites.length) or.push({ inquiries: { some: { website: { in: sites } } } })
  if (websites.includes(ANONYMOUS_WEBSITE)) or.push({ inquiries: { some: {}, none: { website: { not: null } } } })
  return or.length === 1 ? or[0] : { OR: or }
}
