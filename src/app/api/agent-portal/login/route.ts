import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Server-side check for the Agent Portal preview's shared password — previously compared
// client-side against a constant shipped in the JS bundle. This page is currently a
// preview with no real API calls or tenant data behind it, but the credential itself
// should never live in client-visible code.
export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: '' }))
  const expected = process.env.AGENT_PORTAL_PASSWORD
  if (!expected || typeof password !== 'string' || password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('agent-portal-access', crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/agent-portal',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
