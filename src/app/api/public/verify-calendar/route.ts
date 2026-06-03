import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.SSO_JWT_SECRET ?? 'calendar-fallback-secret'
)
const COOKIE = 'cal-access'
const SUSPICIOUS_BOTS = /bot|crawler|spider|scrape|python|curl|wget|axios|fetch|java|ruby|go-http/i

async function logAccess(agentId: string, ip: string, userAgent: string, isSuspicious: boolean) {
  db.calendarAccessLog.create({
    data: { agentId, ip, userAgent, isSuspicious },
  }).catch(() => {})
}

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}

// POST — verify token, issue cookie, return agent info
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const agent = await db.agent.findUnique({
      where: { calendarToken: token },
      select: { id: true, name: true, calendarActive: true },
    })

    if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    if (!agent.calendarActive) return NextResponse.json({ error: 'Access revoked' }, { status: 403 })

    const ip        = getIp(request)
    const userAgent = request.headers.get('user-agent') ?? ''
    const isSuspicious = SUSPICIOUS_BOTS.test(userAgent)
    logAccess(agent.id, ip, userAgent, isSuspicious)

    // Issue signed JWT cookie (no expiry)
    const jwt = await new SignJWT({ agentId: agent.id, agentName: agent.name })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(SECRET)

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
    const cookie = request.cookies.get('cal-access')?.value
    if (!cookie) return NextResponse.json({ valid: false })

    const { payload } = await jwtVerify(cookie, SECRET)
    const agentId   = payload.agentId as string
    const agentName = payload.agentName as string

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
    logAccess(agentId, ip, userAgent, isSuspicious)

    return NextResponse.json({ valid: true, agentName: agent.name ?? agentName })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
