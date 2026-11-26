import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { db as defaultDb } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { AGENT_PORTAL_COOKIE, getAgentPortalSecret } from '@/lib/agent-portal-access'
import { isRateLimited, recordFailedAttempt, clearAttempts, getFailedAttemptCount } from '@/lib/rate-limit'
import type { PrismaClient } from '@prisma/client'

const SUSPICIOUS_BOTS = /bot|crawler|spider|scrape|python|curl|wget|axios|fetch|java|ruby|go-http/i

type PortalLoginRole = 'agent' | 'media'

interface PortalAccountRow {
  id: string
  name: string
  portalPasswordHash: string | null
  portalActive: boolean
  portalPasswordSetAt: Date | null
}

/** Scans every active tenant for an Agent (or MediaAccount) matching this email — mirrors
 *  findAgentTenant() in src/app/api/public/verify-calendar/route.ts, swapping the lookup key
 *  from calendarToken to email since portal login has no per-tenant slug to go on. */
async function findAccountByEmail(email: string, role: PortalLoginRole) {
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, databaseUrl: true } })
  const defaultUrl = process.env.DATABASE_URL
  const candidates = [{ id: null as string | null, url: defaultUrl }, ...tenants.map(t => ({ id: t.id, url: t.databaseUrl }))]
  const select = { id: true, name: true, portalPasswordHash: true, portalActive: true, portalPasswordSetAt: true } as const
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!c.url || seen.has(c.url)) continue
    seen.add(c.url)
    const client: PrismaClient = c.url === defaultUrl ? defaultDb : getTenantDb(c.url)
    // .catch: a tenant DB that hasn't had the MediaAccount table pushed yet must not break login.
    const account: PortalAccountRow | null = role === 'media'
      ? await client.mediaAccount.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select }).catch(() => null)
      : await client.agent.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select }).catch(() => null)
    if (account) return { db: client, tenantId: c.id, account }
  }
  return null
}

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const { email, password, role: rawRole } = await request.json().catch(() => ({ email: '', password: '', role: 'agent' }))
  const role: PortalLoginRole = rawRole === 'media' ? 'media' : 'agent'
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const rateLimitKey = `${getIp(request)}:${role}:${email.trim().toLowerCase()}`
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Too many failed attempts. Please try again in a few minutes.' }, { status: 429 })
  }

  const found = await findAccountByEmail(email.trim(), role)
  const portalPasswordHash = found?.account.portalPasswordHash
  if (!found || !portalPasswordHash) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 })
  }
  const { tenantId, account } = found
  if (!account.portalActive) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Portal access for this account is currently disabled' }, { status: 403 })
  }

  const valid = await bcrypt.compare(password, portalPasswordHash)
  if (!valid) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 })
  }

  // Flag as suspicious before clearing the attempt counter: a bot-like user agent, or
  // several wrong passwords right before this successful one, are both worth a staff
  // member noticing even though the login itself succeeded.
  const userAgent = request.headers.get('user-agent') ?? ''
  const ip = getIp(request)
  const isSuspicious = SUSPICIOUS_BOTS.test(userAgent) || getFailedAttemptCount(rateLimitKey) >= 3
  clearAttempts(rateLimitKey)

  if (role === 'media') {
    found.db.mediaAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
  } else {
    found.db.portalAccessLog.create({ data: { agentId: account.id, ip, userAgent, isSuspicious } }).catch(() => {})
  }

  const pwv = account.portalPasswordSetAt ? account.portalPasswordSetAt.getTime() : 0
  const claims = role === 'media'
    ? { role, mediaAccountId: account.id, name: account.name, tenantId, pwv }
    : { role, agentId: account.id, agentName: account.name, name: account.name, tenantId, pwv }
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getAgentPortalSecret())

  const res = NextResponse.json({ ok: true, role, name: account.name })
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
