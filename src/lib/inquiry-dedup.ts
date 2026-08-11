import type { PrismaClient } from '@prisma/client'

interface DedupCriteria {
  leadId?: string
  customerId?: string
  checkInDate: Date | null
  checkOutDate: Date | null
  guestCount: number | null
}

// A Freshsales contact and a CF7 webhook submission can both originate from
// the exact same real-world form fill — the WordPress site fires both our
// own webhook and a separate Freshsales sync for the same event. Without
// this check, importing that Freshsales contact would add a second Inquiry
// row carrying identical trip details under the same Lead/Customer.
//
// Matching on the (checkInDate, checkOutDate, guestCount) triple for the
// same owner is used as the fingerprint, rather than a time-window around
// createdAt — two genuinely different inquiries from the same person asking
// for the exact same dates and party size again is rare enough in a yacht
// charter business not to worry about, and this needs no clock/timezone
// assumptions between the two systems.
export async function findDuplicateInquiry(db: PrismaClient, c: DedupCriteria) {
  if (!c.checkInDate || !c.checkOutDate || c.guestCount == null) return null
  if (!c.leadId && !c.customerId) return null
  return db.inquiry.findFirst({
    where: {
      ...(c.leadId ? { leadId: c.leadId } : { customerId: c.customerId }),
      checkInDate: c.checkInDate,
      checkOutDate: c.checkOutDate,
      guestCount: c.guestCount,
    },
  })
}

interface IncomingAttribution {
  message?: string | null
  tripType?: string | null
  website?: string | null
  url?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  gclid?: string | null
  leadSource?: string | null
  refererField?: string | null
  mobileNumberBackup?: string | null
  reference?: string | null
  lastSource?: string | null
  lastMedium?: string | null
  lastCampaign?: string | null
  latestSource?: string | null
  latestMedium?: string | null
  latestCampaign?: string | null
}

// Fills in whichever fields the surviving inquiry is still missing, using the
// incoming (Freshsales) data, without clobbering anything it already has —
// e.g. Freshsales often has richer attribution (first_source/gclid, tracked
// from the visitor's whole session) than the CF7 webhook captured at the
// literal moment of submit. Used once a duplicate is found via
// findDuplicateInquiry, so the one surviving row ends up with the best of
// both sources instead of two incomplete rows sitting side by side.
export async function enrichInquiry(db: PrismaClient, existingId: string, incoming: IncomingAttribution) {
  const existing = await db.inquiry.findUnique({ where: { id: existingId } })
  if (!existing) return
  const patch: Record<string, string> = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (!value) continue
    if (!(existing as unknown as Record<string, unknown>)[key]) patch[key] = value
  }
  if (Object.keys(patch).length > 0) {
    await db.inquiry.update({ where: { id: existingId }, data: patch })
  }
}
