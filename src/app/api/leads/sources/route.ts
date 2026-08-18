import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

/** Distinct traffic sources (first- or last-touch UTM source) seen across all inquiries, for the Leads "Source" filter. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const [firstTouch, lastTouch] = await Promise.all([
      db.inquiry.findMany({ where: { utmSource: { not: null } }, select: { utmSource: true }, distinct: ['utmSource'] }),
      db.inquiry.findMany({ where: { lastSource: { not: null } }, select: { lastSource: true }, distinct: ['lastSource'] }),
    ])
    const sources = Array.from(new Set([
      ...firstTouch.map(r => r.utmSource),
      ...lastTouch.map(r => r.lastSource),
    ].filter((s): s is string => !!s))).sort((a, b) => a.localeCompare(b))
    return NextResponse.json(sources)
  } catch (error) {
    console.error('Error fetching lead sources:', error)
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
  }
}
