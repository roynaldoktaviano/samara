import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getGoogleAdsConversions, toGoogleAdsTime, GOOGLE_ADS_CONVERSION_HEADER } from '@/lib/google-ads-conversions'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const DEFAULT_CONVERSION_NAME = 'Booking Deposit Confirmed'

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

// GET — CSV of bookings whose deposit got confirmed, for manual upload into Google Ads'
// "Conversions > Uploads" (offline conversion import). See src/lib/google-ads-conversions.ts
// for the shared row-selection logic also used by the automatic Google Sheets sync.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const sinceParam = searchParams.get('since')
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const conversionName = searchParams.get('conversionName')?.trim() || DEFAULT_CONVERSION_NAME

  const conversions = await getGoogleAdsConversions(db, since, conversionName)
  const rows = conversions.map(c => [
    csvCell(c.gclid),
    csvCell(c.conversionName),
    csvCell(toGoogleAdsTime(c.conversionTime)),
    csvCell(c.value),
    csvCell(c.currency),
  ])

  const csv = [GOOGLE_ADS_CONVERSION_HEADER.join(','), ...rows.map(r => r.join(','))].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="google-ads-conversions-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
