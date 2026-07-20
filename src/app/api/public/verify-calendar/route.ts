import { NextRequest, NextResponse } from 'next/server'
import { db as defaultDb } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'
import { SignJWT } from 'jose'
import { CAL_ACCESS_COOKIE as COOKIE, getCalAccessSecret as getSecret, verifyCalAccess } from '@/lib/cal-access'
import type { PrismaClient } from '@prisma/client'
const SUSPICIOUS_BOTS = /bot|crawler|spider|scrape|python|curl|wget|axios|fetch|java|ruby|go-http/i

async function logAccess(db: PrismaClient, agentId: string, ip: string, userAgent: string, isSuspicious: boolean) {
  db.calendarAccessLog.create({
    data: { agentId, ip, userAgent, isSuspicious },
  }).catch(() => {})
}

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}

/** Resolves the tenant a stored calendarToken belongs to, alongside its centralDb tenant id
 *  — the id (not the raw connection string) is what gets embedded in the JWT cookie so GET
 *  can jump straight back to the right tenant DB without re-scanning every request. */
async function findAgentTenant(token: string) {
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, databaseUrl: true } })
  const defaultUrl = process.env.DATABASE_URL
  const candidates = [{ id: null as string | null, url: defaultUrl }, ...tenants.map(t => ({ id: t.id, url: t.databaseUrl }))]
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!c.url || seen.has(c.url)) continue
    seen.add(c.url)
    const client = c.url === defaultUrl ? defaultDb : getTenantDb(c.url)
    const agent = await client.agent.findUnique({
      where: { calendarToken: token },
      select: { id: true, name: true, calendarActive: true },
    }).catch(() => null)
    if (agent) return { db: client, tenantId: c.id, agent }
  }
  return null
}

// POST — verify token, issue cookie, return agent info
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const found = await findAgentTenant(token)
    if (!found) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    const { db, tenantId, agent } = found
    if (!agent.calendarActive) return NextResponse.json({ error: 'Access revoked' }, { status: 403 })

    const ip        = getIp(request)
    const userAgent = request.headers.get('user-agent') ?? ''
    const isSuspicious = SUSPICIOUS_BOTS.test(userAgent)
    logAccess(db, agent.id, ip, userAgent, isSuspicious)

    // Issue signed JWT cookie (no expiry) — tenantId lets GET below skip re-scanning tenants
    const jwt = await new SignJWT({ agentId: agent.id, agentName: agent.name, tenantId })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(getSecret())

    const res = NextResponse.json({ ok: true, agentName: agent.name })
    res.cookies.set(COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/agent/calendar',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })
    return res
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// GET — verify existing cookie, log access
export async function GET(request: NextRequest) {
  try {
    const payload = await verifyCalAccess(request)
    if (!payload) return NextResponse.json({ valid: false })
    const { agentId, agentName, tenantId } = payload

    // Resolve the tenant DB this agent lives in. Cookies issued before this field existed
    // have no tenantId — fall back to scanning by agentId so those sessions keep working.
    let db: PrismaClient
    if (tenantId) {
      const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId }, select: { databaseUrl: true } })
      if (!tenant) return NextResponse.json({ valid: false })
      db = tenant.databaseUrl === process.env.DATABASE_URL ? defaultDb : getTenantDb(tenant.databaseUrl)
    } else {
      const found = await resolveTenantByLookup(client => client.agent.findUnique({ where: { id: agentId }, select: { id: true } }))
      if (!found) return NextResponse.json({ valid: false })
      db = found.db
    }

    // Check agent still active
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { calendarActive: true, name: true },
    })
    if (!agent?.calendarActive) return NextResponse.json({ valid: false })

    // Log this access
    const ip        = getIp(request)
    const userAgent = request.headers.get('user-agent') ?? ''

    // Suspicious: check rate — more than 20 requests in last 1 min
    const oneMinAgo = new Date(Date.now() - 60 * 1000)
    const recentCount = await db.calendarAccessLog.count({
      where: { agentId, ip, createdAt: { gte: oneMinAgo } },
    })
    const isSuspicious = recentCount > 20 || SUSPICIOUS_BOTS.test(userAgent)
    logAccess(db, agentId, ip, userAgent, isSuspicious)

    return NextResponse.json({ valid: true, agentName: agent.name ?? agentName })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
