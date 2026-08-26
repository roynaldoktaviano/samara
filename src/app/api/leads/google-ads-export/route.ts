import { NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole, type AppRole } from '@/lib/auth-guard'

const ALLOWED: AppRole[] = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const HEADER = [
  'Name', 'First Name', 'Last Name', 'Nationality', 'Email', 'Phone', 'Notes',
  'Source', 'Medium', 'Campaign', 'Term', 'Content', 'Google Click ID', 'Google Braid', 'Form URL', 'Click Date',
]
const FILENAME = () => `leads-google-ads-${new Date().toISOString().split('T')[0]}.csv`

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

// GET — Leads who actually clicked a Google Ads ad: their own inquiry has a `gclid`.
// Same rule as the Guest export (api/customers/google-ads-export) — Lead-only here, no
// Customer cross-referencing. Includes the full Lead profile (not just name/email/phone)
// since Lead carries more identity fields than Customer does.
export async function GET() {
  const auth = await requireRole(ALLOWED)
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)

  const inquiries = await db.inquiry.findMany({
    where: { leadId: { not: null }, gclid: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { leadId: true, gclid: true, gbraid: true, utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true, url: true, createdAt: true },
  })

  // One row per Lead — most recent Google Ads click.
  const byLead = new Map<string, (typeof inquiries)[number]>()
  for (const i of inquiries) {
    if (!byLead.has(i.leadId!)) byLead.set(i.leadId!, i)
  }

  if (byLead.size === 0) {
    return new NextResponse(HEADER.join(','), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${FILENAME()}"` } })
  }

  const leadIds = [...byLead.keys()]
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds }, deletedAt: null },
    select: { id: true, name: true, firstName: true, lastName: true, nationality: true, email: true, phone: true, notes: true },
  })

  const rows = leads
    .map(l => ({ l, click: byLead.get(l.id)! }))
    .sort((a, b) => b.click.createdAt.getTime() - a.click.createdAt.getTime())
    .map(({ l, click }) => [
      csvCell(l.name),
      csvCell(l.firstName),
      csvCell(l.lastName),
      csvCell(l.nationality),
      csvCell(l.email),
      csvCell(l.phone),
      csvCell(l.notes),
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
