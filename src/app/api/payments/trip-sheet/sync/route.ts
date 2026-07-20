import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { rebuildTripSheetGoogleSheet } from '@/lib/google-sheets'
import { getTenantSecret } from '@/lib/tenant-secrets'

export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'FINANCE', 'PURCHASING', 'HR', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = await getDb(session)
  const tripSheetId = await getTenantSecret((session.user as { tenantId?: string }).tenantId ?? '', 'tripSheetGoogleSheetId')
  try {
    const result = await rebuildTripSheetGoogleSheet(db, tripSheetId)
    if (!result.ok) return NextResponse.json({ error: 'Google Sheets sync is not configured' }, { status: 400 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error syncing trip sheet to Google Sheets:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
