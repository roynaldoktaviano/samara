import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'

// Public, unauthenticated: one vessel's room/category-based InventoryItems for the Request
// Order page's "Inventory" tab — requesting more of something already tracked on board
// (Goods Receipt then tops up that InventoryItem via sourceInventoryItemId).
// Deliberately excludes price/vendor fields, same as the catalog route.
// `?token=<per-tenant token>` identifies the company; `locationId` is required so the
// whole fleet's inventory is never dumped in one call.
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(request.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved
  const locationId = request.nextUrl.searchParams.get('locationId')
  if (!locationId) return NextResponse.json({ error: 'locationId is required' }, { status: 400 })

  const items = await db.inventoryItem.findMany({
    where: { locationId, isActive: true },
    select: {
      id: true, itemNumber: true, name: true, quantity: true, photoKeys: true,
      room: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(items.map(({ photoKeys, ...item }) => ({
    ...item,
    // Only the first photo — the card shows one thumbnail, and these are base64 data URLs.
    photoKey: Array.isArray(photoKeys) && typeof photoKeys[0] === 'string' ? photoKeys[0] : null,
  })))
}
