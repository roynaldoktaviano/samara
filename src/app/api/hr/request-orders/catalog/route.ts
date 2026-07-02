import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public, unauthenticated: powers the internal Request Order page (no ERP login required).
// Deliberately excludes cost/price fields — this catalog is for picking items, not purchasing.
export async function GET() {
  const items = await db.purchaseItem.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, type: true, category: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, imageKey: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(items)
}
