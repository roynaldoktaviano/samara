import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'

// Public, unauthenticated: powers the internal Request Order page (no ERP login required).
// Deliberately excludes cost/price fields — this catalog is for picking items, not purchasing.
// `?token=<per-tenant token>` identifies which company's catalog to show.
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(request.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved
  const items = await db.purchaseItem.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, type: true, category: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, imageKey: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(items)
}
