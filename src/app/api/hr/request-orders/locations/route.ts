import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public, unauthenticated: minimal vessel/location list for the Request Order page.
export async function GET() {
  const locations = await db.stockLocation.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(locations)
}
