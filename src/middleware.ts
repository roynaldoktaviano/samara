import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/external',
  '/api/public',
  '/api/webhooks',
  '/proto',
  '/proto-2',
  // Internal Request Order page — used by staff without an ERP login (crew, field staff, etc.)
  '/request-order',
  '/api/hr/request-orders',
  // Agent Portal preview — has its own password login, separate from staff NextAuth
  '/agent-portal',
  '/media-kit',
  // Guest-facing form — access controlled by its own per-guest token, not staff login
  '/guest-form',
  '/api/guest-form',
  '/api/booking-form',
]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))
}

const authMiddleware = withAuth({
  pages: { signIn: '/login' },
})

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Agent calendar: allow if token in URL OR cal-access cookie present ──
  if (pathname === '/agent/calendar' || pathname.startsWith('/agent/calendar/')) {
    const token  = req.nextUrl.searchParams.get('token')
    const cookie = req.cookies.get('cal-access')?.value
    if (token) {
      // Persist token to httpOnly cookie so future visits don't expose token in URL
      const res = NextResponse.next()
      res.cookies.set('cal-access', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/agent/calendar',
      })
      return res
    }
    if (cookie) return NextResponse.next()
    return NextResponse.rewrite(new URL('/agent/calendar/denied', req.url))
  }

  if (isPublic(pathname)) return NextResponse.next()
  return (authMiddleware as any)(req, {} as any)
}

export const config = {
  matcher: ['/((?!login|kalender|api/auth|api/public|_next/static|_next/image|favicon.ico|.*\\.webp|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
}
