import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlug } from '@/lib/resolve-tenant'

// Public, unauthenticated: powers the internal Request Order page (no ERP login required).
// Deliberately excludes cost/price fields — this catalog is for picking items, not purchasing.
// `?tenant=<slug>` selects which company's catalog to show; defaults to 'samara'.
export async function GET(request: NextRequest) {
  const db = await resolveTenantBySlug(request.nextUrl.searchParams.get('tenant'))
  if (!db) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const items = await db.purchaseItem.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, type: true, category: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, imageKey: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(items)
}
