import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/external',
  '/api/public',
  '/api/webhooks',
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
    if (token || cookie) return NextResponse.next()
    return NextResponse.rewrite(new URL('/agent/calendar/denied', req.url))
  }

  if (isPublic(pathname)) return NextResponse.next()
  return (authMiddleware as any)(req, {} as any)
}

export const config = {
  matcher: ['/((?!login|kalender|api/auth|api/public|_next/static|_next/image|favicon.ico|.*\\.webp|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
}
