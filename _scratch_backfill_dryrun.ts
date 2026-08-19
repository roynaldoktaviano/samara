import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const domain = process.env.FRESHSALES_DOMAIN!
const apiKey = process.env.FRESHSALES_API_KEY!

async function fetchActivities(contactId: string) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${domain}/api/contacts/${contactId}/activities`, {
      headers: { Authorization: `Token token=${apiKey}`, 'Content-Type': 'application/json' },
    })
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2 ** (attempt + 1)
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      continue
    }
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    return json?.activities as any[] | null
  }
}

function guessFormUrl(activities: any[]): { url: string | null; reason: string } {
  const pageViews = activities
    .filter(a => a.action_type === 'FM_PAGE_VIEWS' && a.action_data?.property_value)
    .map(a => ({ url: String(a.action_data.property_value), at: new Date(a.created_at).getTime() }))
    .sort((a, b) => a.at - b.at)

  if (!pageViews.length) return { url: null, reason: 'no page views' }

  const thankIdx = pageViews.findIndex(p => /thank/i.test(p.url))
  if (thankIdx > 0) return { url: pageViews[thankIdx - 1].url, reason: `page before "${pageViews[thankIdx].url}"` }

  const createEvt = activities.find(a => a.action_type === 'CREATE')
  if (createEvt) {
    const createdAt = new Date(createEvt.created_at).getTime()
    const before = pageViews.filter(p => p.at <= createdAt)
    if (before.length) return { url: before[before.length - 1].url, reason: 'last page view before contact creation' }
  }

  return { url: pageViews[0].url, reason: 'fallback: earliest page view' }
}

async function main() {
  const inquiries = await db.inquiry.findMany({
    where: { gclid: { not: null }, url: null, OR: [{ customerId: { not: null } }, { leadId: { not: null } }] },
    select: { id: true, customerId: true, leadId: true, createdAt: true },
  })
  console.log('candidates:', inquiries.length)

  const customerIds = inquiries.map(i => i.customerId).filter((x): x is string => !!x)
  const leadIds = inquiries.map(i => i.leadId).filter((x): x is string => !!x)
  const [customers, leads] = await Promise.all([
    db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, freshsalesContactId: true } }),
    db.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, freshsalesContactId: true } }),
  ])
  const custMap = new Map(customers.map(c => [c.id, c]))
  const leadMap = new Map(leads.map(l => [l.id, l]))

  let noFsId = 0, noActivities = 0, resolved = 0, unresolved = 0
  const results: any[] = []

  for (const inq of inquiries) {
    const owner = inq.customerId ? custMap.get(inq.customerId) : inq.leadId ? leadMap.get(inq.leadId) : null
    if (!owner?.freshsalesContactId) { noFsId++; continue }
    const activities = await fetchActivities(owner.freshsalesContactId)
    if (!activities) { noActivities++; continue }
    const { url, reason } = guessFormUrl(activities)
    if (url) resolved++; else unresolved++
    results.push({ name: owner.name, fsId: owner.freshsalesContactId, url, reason })
  }

  console.log({ total: inquiries.length, noFsId, noActivities, resolved, unresolved })
  console.log(JSON.stringify(results, null, 2))
}

main().finally(() => db.$disconnect())
