import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlug } from '@/lib/resolve-tenant'

// Public, unauthenticated: minimal vessel/location list for the Request Order page.
// `?tenant=<slug>` selects which company's locations to show; defaults to 'samara'.
export async function GET(request: NextRequest) {
  const db = await resolveTenantBySlug(request.nextUrl.searchParams.get('tenant'))
  if (!db) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const locations = await db.stockLocation.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(locations)
}
