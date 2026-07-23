import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { db as defaultDb } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { AGENT_PORTAL_COOKIE, getAgentPortalSecret } from '@/lib/agent-portal-access'
import { isRateLimited, recordFailedAttempt, clearAttempts } from '@/lib/rate-limit'
import type { PrismaClient } from '@prisma/client'

/** Scans every active tenant for an Agent matching this email — mirrors findAgentTenant()
 *  in src/app/api/public/verify-calendar/route.ts, swapping the lookup key from
 *  calendarToken to email since agent-portal login has no per-tenant slug to go on. */
async function findAgentByEmail(email: string) {
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, databaseUrl: true } })
  const defaultUrl = process.env.DATABASE_URL
  const candidates = [{ id: null as string | null, url: defaultUrl }, ...tenants.map(t => ({ id: t.id, url: t.databaseUrl }))]
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!c.url || seen.has(c.url)) continue
    seen.add(c.url)
    const client: PrismaClient = c.url === defaultUrl ? defaultDb : getTenantDb(c.url)
    const agent = await client.agent.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, portalPasswordHash: true, portalActive: true, portalPasswordSetAt: true },
    }).catch(() => null)
    if (agent) return { db: client, tenantId: c.id, agent }
  }
  return null
}

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const { email, password } = await request.json().catch(() => ({ email: '', password: '' }))
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 })
  }

  const rateLimitKey = `${getIp(request)}:${email.trim().toLowerCase()}`
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.' }, { status: 429 })
  }

  const found = await findAgentByEmail(email.trim())
  const portalPasswordHash = found?.agent.portalPasswordHash
  if (!found || !portalPasswordHash) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 })
  }
  const { tenantId, agent } = found
  if (!agent.portalActive) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Akses portal untuk akun ini sedang dinonaktifkan' }, { status: 403 })
  }

  const valid = await bcrypt.compare(password, portalPasswordHash)
  if (!valid) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 })
  }
  clearAttempts(rateLimitKey)

  const pwv = agent.portalPasswordSetAt ? agent.portalPasswordSetAt.getTime() : 0
  const jwt = await new SignJWT({ agentId: agent.id, agentName: agent.name, tenantId, pwv })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getAgentPortalSecret())

  const res = NextResponse.json({ ok: true, agentName: agent.name })
  res.cookies.set(AGENT_PORTAL_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // Must be '/', not '/agent-portal' — every consumer of this cookie is under
    // /api/agent-portal/*, which doesn't path-match a '/agent-portal' cookie scope.
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
