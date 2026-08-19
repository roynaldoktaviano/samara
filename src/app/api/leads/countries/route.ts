import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

/** Distinct nationalities seen across all leads, for the Leads Statistics "Country" filter. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const rows = await db.lead.findMany({
      where: { deletedAt: null, nationality: { not: null } },
      select: { nationality: true },
      distinct: ['nationality'],
    })
    const countries = [...new Set(rows.map(r => r.nationality?.trim()).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b))
    return NextResponse.json(countries)
  } catch (error) {
    console.error('Error fetching lead countries:', error)
    return NextResponse.json({ error: 'Failed to fetch countries' }, { status: 500 })
  }
}
