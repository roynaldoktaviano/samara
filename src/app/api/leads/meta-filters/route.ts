import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

/** Distinct campaigns and yachts seen on Meta Lead Ads inquiries, for the Leads → Instant Form tab filters. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const [campaigns, yachts] = await Promise.all([
      db.inquiry.findMany({ where: { source: 'META_LEAD_AD', utmCampaign: { not: null } }, select: { utmCampaign: true }, distinct: ['utmCampaign'] }),
      db.inquiry.findMany({ where: { source: 'META_LEAD_AD', tripType: { not: null } }, select: { tripType: true }, distinct: ['tripType'] }),
    ])
    const sorted = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort((a, b) => a.localeCompare(b))
    return NextResponse.json({
      campaigns: sorted(campaigns.map(c => c.utmCampaign)),
      yachts:    sorted(yachts.map(y => y.tripType)),
    })
  } catch (error) {
    console.error('Error fetching Meta lead filters:', error)
    return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 })
  }
}
