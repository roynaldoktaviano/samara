import { NextResponse } from 'next/server'
import { AGENT_PORTAL_COOKIE } from '@/lib/agent-portal-access'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AGENT_PORTAL_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
