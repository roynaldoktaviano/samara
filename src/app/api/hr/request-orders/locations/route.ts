import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'

// Public, unauthenticated: minimal vessel/location list for the Request Order page.
// `?token=<per-tenant token>` identifies which company's locations to show.
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(request.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved
  const locations = await db.stockLocation.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(locations)
}
