import { NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole, type AppRole } from '@/lib/auth-guard'
import { adUploadDecision, manualConsentRows, UPLOADABLE_MATCH_WHERE, type ConsentInquiry } from '@/lib/ad-consent'
import { findLinkedLeadId } from '@/lib/customer-lead-link'

const ALLOWED: AppRole[] = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const HEADER = ['Name', 'Email', 'Phone', 'Source', 'Medium', 'Campaign', 'Term', 'Content', 'Google Click ID', 'Google Braid', 'Form URL', 'Click Date']
const FILENAME = () => `guests-google-ads-${new Date().toISOString().split('T')[0]}.csv`

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

// GET — Guests (Customers) who actually clicked a Google Ads ad: their own
// inquiry has a `gclid`. A large chunk of historical Freshsales imports had
// their gclid buried in the raw custom_field payload instead of the mapped
// column — see the one-time backfill that recovered those into `gclid`
// (2026-08-18). Guest-only, no Lead cross-referencing.
export async function GET() {
  const auth = await requireRole(ALLOWED)
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)

  const inquiries = await db.inquiry.findMany({
    where: { customerId: { not: null }, gclid: { not: null }, ...UPLOADABLE_MATCH_WHERE },
    orderBy: { createdAt: 'desc' },
    select: { customerId: true, gclid: true, gbraid: true, utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true, url: true, createdAt: true },
  })

  // One row per Customer — most recent Google Ads click.
  const byCustomer = new Map<string, (typeof inquiries)[number]>()
  for (const i of inquiries) {
    if (!byCustomer.has(i.customerId!)) byCustomer.set(i.customerId!, i)
  }

  if (byCustomer.size === 0) {
    return new NextResponse(HEADER.join(','), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${FILENAME()}"` } })
  }

  const customerIds = [...byCustomer.keys()]
  const customers = await db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, email: true, phone: true, nationality: true } })

  // Consent gate (src/lib/ad-consent.ts) — guests who declined ad cookies, or EU/UK/CH guests
  // without a banner accept, are left out. Their earlier inquiries as a Lead count too.
  const consentRows = await db.inquiry.findMany({
    where: { customerId: { in: customerIds } },
    select: { customerId: true, adConsent: true, consentRegion: true },
  })
  const consentByCustomer = new Map<string, ConsentInquiry[]>()
  for (const r of consentRows) {
    const list = consentByCustomer.get(r.customerId!) ?? []
    list.push(r)
    consentByCustomer.set(r.customerId!, list)
  }
  const allowed = new Set<string>()
  for (const c of customers) {
    const leadId = await findLinkedLeadId(db, c)
    const leadRows = leadId
      ? [
          ...await db.inquiry.findMany({ where: { leadId }, select: { adConsent: true, consentRegion: true } }),
          ...manualConsentRows(await db.lead.findUnique({ where: { id: leadId }, select: { adConsent: true } })),
        ]
      : []
    if (adUploadDecision([...(consentByCustomer.get(c.id) ?? []), ...leadRows], c.nationality).ok) allowed.add(c.id)
  }

  const rows = customers
    .filter(c => allowed.has(c.id))
    .map(c => ({ c, click: byCustomer.get(c.id)! }))
    .sort((a, b) => b.click.createdAt.getTime() - a.click.createdAt.getTime())
    .map(({ c, click }) => [
      csvCell(c.name),
      csvCell(c.email),
      csvCell(c.phone),
      csvCell(click.utmSource),
      csvCell(click.utmMedium),
      csvCell(click.utmCampaign),
      csvCell(click.utmTerm),
      csvCell(click.utmContent),
      csvCell(click.gclid),
      csvCell(click.gbraid),
      csvCell(click.url),
      csvCell(click.createdAt.toISOString().slice(0, 10)),
    ])

  const csv = [HEADER.join(','), ...rows.map(r => r.join(','))].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${FILENAME()}"`,
    },
  })
}
