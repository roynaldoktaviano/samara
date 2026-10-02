import { NextResponse } from 'next/server'
import { withRetry } from '@/lib/db'
import { resolveCashierTenant } from '@/lib/cashier-access'

// Public — the cashier sign-in screen lists vessels before any PIN is entered, so this returns
// display fields only (no stock location ids; those come back from /api/cashier/login).
export async function GET() {
  const tenant = await resolveCashierTenant()
  if (!tenant) return NextResponse.json({ error: 'Cashier is not available' }, { status: 404 })
  const { db } = tenant

  const yachts = await withRetry(db, () => db.yacht.findMany({
    where: { deletedAt: null, stockLocations: { some: { type: 'VESSEL', isActive: true } } },
    select: { id: true, name: true, image: true, cashierTerminal: { select: { pinLength: true } } },
    orderBy: { name: 'asc' },
  }))

  return NextResponse.json(yachts.map(y => ({
    id: y.id, name: y.name, image: y.image,
    // null = no PIN set yet in the ERP (Yachts → key icon), so this terminal can't be opened.
    pinLength: y.cashierTerminal?.pinLength ?? null,
  })))
}
