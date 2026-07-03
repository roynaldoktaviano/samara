import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// Kept in sync with the Add/Edit Agent form fields (Agents.tsx) — see import/route.ts for the same header.
export const CSV_HEADER = [
  'name', 'salesperson', 'country', 'address', 'email', 'whatsapp', 'website', 'instagram',
  'source', 'currentCondition', 'commissionOpenTrip', 'commissionPrivateCharter', 'contract', 'isActive', 'note',
  'contactName', 'contactEmail', 'contactWhatsapp', 'contactJobTitle', 'contactDateOfBirth',
]

export async function GET(_: NextRequest) {
  const db = await getDb()
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const agents = await db.agent.findMany({
    select: {
      name: true, country: true, address: true, email: true, whatsapp: true, website: true, instagram: true,
      source: true, currentCondition: true, commissionOpenTrip: true, commissionPrivateCharter: true,
      contract: true, isActive: true, note: true,
      salesperson: { select: { name: true } },
      contacts: {
        select: { name: true, email: true, whatsapp: true, jobTitle: true, dateOfBirth: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const rows: string[][] = []
  for (const a of agents) {
    const base = [
      csvCell(a.name),
      csvCell(a.salesperson?.name ?? ''),
      csvCell(a.country),
      csvCell(a.address),
      csvCell(a.email),
      csvCell(a.whatsapp),
      csvCell(a.website),
      csvCell(a.instagram),
      csvCell(a.source),
      csvCell(a.currentCondition),
      csvCell(a.commissionOpenTrip),
      csvCell(a.commissionPrivateCharter),
      csvCell(a.contract),
      csvCell(a.isActive ? 'true' : 'false'),
      csvCell(a.note),
    ]
    if (a.contacts.length === 0) {
      rows.push([...base, '', '', '', '', ''])
    } else {
      for (const c of a.contacts) {
        const dob = c.dateOfBirth ? c.dateOfBirth.toISOString().split('T')[0] : ''
        rows.push([
          ...base,
          csvCell(c.name),
          csvCell(c.email),
          csvCell(c.whatsapp),
          csvCell(c.jobTitle),
          csvCell(dob),
        ])
      }
    }
  }

  const csv = [CSV_HEADER.join(','), ...rows.map(r => r.join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="agents-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
