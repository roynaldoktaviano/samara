/**
 * Fill Deal.productInterest (yacht) on existing deals that have none — src/lib/deal-product-interest.ts.
 * Order of truth: booking's yacht → Freshsales deal's Product Interest ("PC / S2" → "Samara II") →
 * the lead's Yacht field → inferred from the enquiry page / brand / trip type (ERP-only deals only;
 * a Freshsales deal without Product Interest stays empty — Freshsales is the truth).
 * Never overwrites a value.
 *
 * Run: npx tsx scripts/backfill-deal-product-interest.ts           (dry run)
 *      npx tsx scripts/backfill-deal-product-interest.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { inferDealYacht, yachtFromFreshsales } from '../src/lib/deal-product-interest'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const deals = await db.deal.findMany({
    where: { productInterest: null },
    select: {
      id: true, freshsalesDealId: true, brand: true, tripType: true,
      booking: { select: { yacht: { select: { name: true } } } },
      lead: { select: { productInterest: true } },
      inquiries: { select: { url: true, landingUrl: true, tripType: true }, orderBy: { createdAt: 'asc' }, take: 3 },
    },
  })
  const fsIds = deals.map(d => d.freshsalesDealId).filter((x): x is string => !!x)
  const fsPi = new Map<string, string | null>()
  for (let i = 0; i < fsIds.length; i += 5000) {
    const rows = await db.$queryRaw<{ id: string; pi: string | null }[]>`
      SELECT id, "customFields"->>'cf_product_interest' AS pi FROM "FreshsalesDeal" WHERE id = ANY(${fsIds.slice(i, i + 5000)})`
    for (const r of rows) fsPi.set(r.id, r.pi)
  }

  const counts: Record<string, number> = {}
  const byValue: Record<string, number> = {}
  const updates = new Map<string, string[]>()
  for (const d of deals) {
    let v: string | null = null, why = ''
    if (d.booking?.yacht?.name) { v = d.booking.yacht.name; why = 'booking yacht' }
    else if (d.freshsalesDealId) { v = yachtFromFreshsales(fsPi.get(d.freshsalesDealId)); why = 'freshsales' }
    if (!v && d.lead?.productInterest) { v = d.lead.productInterest; why = 'lead yacht' }
    if (!v && !d.freshsalesDealId) {
      const inq = d.inquiries.find(i => i.url || i.landingUrl || i.tripType)
      v = inferDealYacht({ text: inq?.tripType, url: inq?.url ?? inq?.landingUrl, brand: d.brand, tripType: d.tripType }); why = 'inferred'
    }
    if (!v) { counts['no yacht known'] = (counts['no yacht known'] ?? 0) + 1; continue }
    counts[why] = (counts[why] ?? 0) + 1
    byValue[v] = (byValue[v] ?? 0) + 1
    updates.set(v, [...(updates.get(v) ?? []), d.id])
  }
  console.log(`deals without productInterest: ${deals.length}`)
  console.log('source:', counts)
  console.log('value:', byValue)
  if (!apply) { console.log('\nDry run — pass --apply to write.'); return }
  for (const [v, ids] of updates) {
    for (let i = 0; i < ids.length; i += 1000) {
      await db.deal.updateMany({ where: { id: { in: ids.slice(i, i + 1000) }, productInterest: null }, data: { productInterest: v } })
    }
  }
  console.log('applied.')
}

main().finally(() => db.$disconnect())
