import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(_: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const agents = await db.agent.findMany({
    select: {
      name:       true,
      commission: true,
      country:    true,
      agentType:  true,
      contract:   true,
      isActive:   true,
      salesperson: { select: { name: true } },
      contacts: {
        select: { name: true, email: true, whatsapp: true, jobTitle: true, dateOfBirth: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const header = [
    'name', 'salesperson', 'country', 'agentType', 'commission',
    'contract', 'isActive',
    'contactName', 'contactEmail', 'contactWhatsapp', 'contactJobTitle', 'contactDateOfBirth',
  ]

  const rows: string[][] = []
  for (const a of agents) {
    const base = [
      csvCell(a.name),
      csvCell(a.salesperson?.name ?? ''),
      csvCell(a.country),
      csvCell(a.agentType),
      csvCell(a.commission),
      csvCell(a.contract),
      csvCell(a.isActive ? 'true' : 'false'),
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

  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="agents-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
