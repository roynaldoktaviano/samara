import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { withRetry } from '@/lib/db'
import { isRateLimited, recordFailedAttempt, clearAttempts } from '@/lib/rate-limit'
import { CASHIER_COOKIE, CASHIER_COOKIE_MAX_AGE, resolveCashierTenant, signCashierAccess } from '@/lib/cashier-access'

// Unlocks a vessel's cashier terminal with its PIN → cashier-access cookie for that yacht only.
export async function POST(req: NextRequest) {
  const { yachtId, pin } = await req.json().catch(() => ({}))
  if (typeof yachtId !== 'string' || typeof pin !== 'string' || !pin) {
    return NextResponse.json({ error: 'yachtId and pin are required' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rlKey = `cashier:${ip}:${yachtId}`
  if (isRateLimited(rlKey)) return NextResponse.json({ error: 'Too many wrong PINs — try again in 15 minutes' }, { status: 429 })

  const tenant = await resolveCashierTenant()
  if (!tenant) return NextResponse.json({ error: 'Cashier is not available' }, { status: 404 })
  const { db } = tenant

  const yacht = await withRetry(db, () => db.yacht.findFirst({
    where: { id: yachtId, deletedAt: null },
    select: {
      id: true, name: true, image: true,
      cashierTerminal: { select: { pinHash: true, pinSetAt: true } },
      // Same pick as the menu route: the yacht's POS bar first, else its first VESSEL location.
      stockLocations: { where: { type: 'VESSEL', isActive: true }, select: { id: true, isPosBar: true }, orderBy: [{ isPosBar: 'desc' }, { name: 'asc' }], take: 1 },
    },
  }))
  if (!yacht) return NextResponse.json({ error: 'Vessel not found' }, { status: 404 })
  if (!yacht.cashierTerminal) return NextResponse.json({ error: 'No PIN set for this vessel yet — ask an admin to set one in the ERP (Yachts)' }, { status: 400 })

  if (!(await bcrypt.compare(pin, yacht.cashierTerminal.pinHash))) {
    recordFailedAttempt(rlKey)
    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  }
  clearAttempts(rlKey)

  const token = await signCashierAccess({ tenantId: tenant.tenant.id, tenantSlug: tenant.tenant.slug, yachtId: yacht.id, pv: yacht.cashierTerminal.pinSetAt.getTime() })
  const res = NextResponse.json({
    id: yacht.id, name: yacht.name, image: yacht.image,
    locationId: yacht.stockLocations[0]?.id ?? null,
    barConfigured: yacht.stockLocations[0]?.isPosBar ?? false,
  })
  res.cookies.set(CASHIER_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: CASHIER_COOKIE_MAX_AGE,
  })
  return res
}
