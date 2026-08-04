import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

/** Distinct source websites seen across all inquiries, for the Leads "Website" filter. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const rows = await db.inquiry.findMany({
      where: { website: { not: null } },
      select: { website: true },
      distinct: ['website'],
      orderBy: { website: 'asc' },
    })
    const websites = rows.map(r => r.website).filter((w): w is string => !!w)
    return NextResponse.json(websites)
  } catch (error) {
    console.error('Error fetching lead websites:', error)
    return NextResponse.json({ error: 'Failed to fetch websites' }, { status: 500 })
  }
}
