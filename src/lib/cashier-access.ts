import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantById, resolveTenantBySlugFull } from '@/lib/resolve-tenant'

// The cashier has no ERP (NextAuth) login — a terminal is unlocked with its vessel's PIN
// (CashierTerminal), which issues this cookie scoped to that one yacht.
export const CASHIER_COOKIE = 'cashier-access'
export const CASHIER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function secret(): Uint8Array {
  const s = process.env.SSO_JWT_SECRET
  if (!s) throw new Error('SSO_JWT_SECRET is not configured')
  return new TextEncoder().encode(s)
}

/** Tenant the public cashier serves before a PIN is entered — CASHIER_TENANT_SLUG, default 'samara'. */
export function resolveCashierTenant() {
  return resolveTenantBySlugFull(process.env.CASHIER_TENANT_SLUG)
}

interface CashierPayload { tenantId: string; tenantSlug: string; yachtId: string; pv: number }

export function signCashierAccess(p: CashierPayload) {
  return new SignJWT({ ...p }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${CASHIER_COOKIE_MAX_AGE}s`).sign(secret())
}

export interface CashierSession {
  db: PrismaClient
  tenantId: string
  tenantSlug: string
  yachtId: string
  /** ERP user cashier stock movements are attributed to (whoever set the PIN, else any admin). */
  userId: string
}

/**
 * Authorizes a cashier API request: verifies the cookie, then re-checks the terminal fresh so a
 * PIN change (pinSetAt bump) or removed terminal cuts every open session off immediately.
 */
export async function resolveCashierSession(req: NextRequest): Promise<CashierSession | null> {
  const cookie = req.cookies.get(CASHIER_COOKIE)?.value
  if (!cookie) return null
  let p: CashierPayload
  try {
    const { payload } = await jwtVerify(cookie, secret())
    p = { tenantId: payload.tenantId as string, tenantSlug: payload.tenantSlug as string, yachtId: payload.yachtId as string, pv: payload.pv as number }
  } catch { return null }

  const db = await resolveTenantById(p.tenantId)
  if (!db) return null
  const terminal = await db.cashierTerminal.findUnique({ where: { yachtId: p.yachtId }, select: { pinSetAt: true, pinSetById: true } })
  if (!terminal || terminal.pinSetAt.getTime() !== p.pv) return null

  const user = await db.user.findUnique({ where: { id: terminal.pinSetById }, select: { id: true } })
    ?? await db.user.findFirst({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } }, select: { id: true }, orderBy: { createdAt: 'asc' } })
  if (!user) return null

  return { db, tenantId: p.tenantId, tenantSlug: p.tenantSlug, yachtId: p.yachtId, userId: user.id }
}
