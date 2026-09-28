import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'
import { listUpcomingTrips } from '@/lib/purchasing/tripLink'

// Public, unauthenticated: trip picker for the Request Order page's "Purpose: Trip"
// option. Same list as /api/purchasing/trips (the internal PR trip picker) so both
// forms render identically per the "PR and request-order must always match" rule.
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(request.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  return NextResponse.json(await listUpcomingTrips(resolved.db))
}
