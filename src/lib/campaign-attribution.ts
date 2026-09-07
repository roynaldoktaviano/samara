import type { PrismaClient } from '@prisma/client'

export interface CampaignAttribution {
  leads: number
  bookings: number
  revenue: number
}

/**
 * Matches Inquiry.utmCampaign — the website form's first-touch ?utm_campaign= value,
 * see that field's doc comment in schema.prisma — against this campaign's utmSlug to
 * compute real leads/bookings/revenue. Follows the same first-touch-per-customer,
 * confirmed-payments-only convention as getMarketingPerformanceSnapshot
 * (src/lib/marketing-performance.ts), so revenue never overstates money that hasn't
 * actually landed and stays consistent with the rest of the marketing module's numbers.
 */
export async function getCampaignAttribution(db: PrismaClient, utmSlug: string | null): Promise<CampaignAttribution> {
  if (!utmSlug) return { leads: 0, bookings: 0, revenue: 0 }

  const inquiries = await db.inquiry.findMany({
    where: { utmCampaign: utmSlug },
    select: { leadId: true, customerId: true },
  })
  if (inquiries.length === 0) return { leads: 0, bookings: 0, revenue: 0 }

  // Exactly one of leadId/customerId is set per inquiry (see Inquiry's doc comment) — a
  // person still counts as a lead even if they never converted to a paying customer.
  const peopleIds = new Set(inquiries.map(i => i.customerId ?? i.leadId).filter((v): v is string => !!v))
  const customerIds = [...new Set(inquiries.map(i => i.customerId).filter((v): v is string => !!v))]

  if (customerIds.length === 0) return { leads: peopleIds.size, bookings: 0, revenue: 0 }

  const bookings = await db.booking.findMany({
    where: { customerId: { in: customerIds }, status: { not: 'cancelled' } },
    select: { payments: { where: { status: 'confirmed' }, select: { amount: true } } },
  })
  const revenue = bookings.reduce((sum, b) => sum + b.payments.reduce((s, p) => s + p.amount, 0), 0)

  return { leads: peopleIds.size, bookings: bookings.length, revenue }
}

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign'
}

/** Auto-generates the campaign's ?utm_campaign= slug from its name, appending -2/-3/...
 *  on collision so the unique constraint on Campaign.utmSlug never rejects a create. */
export async function generateUniqueUtmSlug(db: PrismaClient, name: string): Promise<string> {
  const base = slugify(name)
  let slug = base
  let n = 2
  while (await db.campaign.findUnique({ where: { utmSlug: slug }, select: { id: true } })) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

export { slugify }
