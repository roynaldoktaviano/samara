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
    // Trim + re-dedupe here too — `distinct` above operates on the raw column, so a
    // whitespace-only value wouldn't collapse into an already-seen trimmed entry.
    const websites = [...new Set(rows.map(r => r.website?.trim()).filter((w): w is string => !!w))].sort()
    return NextResponse.json(websites)
  } catch (error) {
    console.error('Error fetching lead websites:', error)
    return NextResponse.json({ error: 'Failed to fetch websites' }, { status: 500 })
  }
}
