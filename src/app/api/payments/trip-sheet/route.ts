import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getTripSheetGroups } from '@/lib/trip-sheet'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const userId   = session?.user?.id ?? ''
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  try {
    const groups = await getTripSheetGroups(db, {
      from, to,
      salespersonId: userRole === 'SALES' && userId ? userId : null,
    })
    return NextResponse.json(groups)
  } catch (error) {
    console.error('Error fetching trip sheet:', error)
    return NextResponse.json({ error: 'Failed to fetch trip sheet' }, { status: 500 })
  }
}
