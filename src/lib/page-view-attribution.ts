// Page views → per-deal ad attribution (marketing audit 2026-11-24): a known visitor who lands from
// an ad (gclid / utm cpc …) — before or after their enquiry — counts for the deal whose window that
// click falls in (src/lib/deal-attribution.ts), so "assisted" clicks and late gclids are kept.
import type { PrismaClient } from '@prisma/client'
import { refreshPersonDeals } from '@/lib/deal-attribution'

export const AD_URL_RE = /[?&](gclid|gbraid|wbraid|gad_source|utm_source|utm_medium)=/i
type Owner = { leadId?: string | null; customerId?: string | null }

/** The lead / guest a browser cookie already belongs to (claimed by an earlier form), if any. */
export async function ownerOfVisitor(db: PrismaClient, visitorId: string): Promise<Owner | null> {
  const row = await db.pageView.findFirst({
    where: { visitorId, OR: [{ leadId: { not: null } }, { customerId: { not: null } }] },
    orderBy: { occurredAt: 'desc' },
    select: { leadId: true, customerId: true },
  })
  if (!row) return null
  return row.customerId ? { customerId: row.customerId } : { leadId: row.leadId }
}

/** After a form claimed this visitor's page views: their deals take any ad landings among them. */
export async function recordVisitorPaidViews(db: PrismaClient, visitorId: string, owner: Owner): Promise<void> {
  const ad = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "PageView"
    WHERE "visitorId" = ${visitorId} AND url ~* '[?&](gclid|gbraid|wbraid|gad_source|utm_source|utm_medium)='`
  if (Number(ad[0]?.n ?? 0) > 0) await refreshPersonDeals(db, owner)
}
