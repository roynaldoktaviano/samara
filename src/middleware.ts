import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/external',
  '/agent/calendar',
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
  if (isPublic(req.nextUrl.pathname)) {
    return NextResponse.next()
  }
  return (authMiddleware as any)(req, {} as any)
}

export const config = {
  matcher: ['/((?!login|kalender|api/auth|api/public|_next/static|_next/image|favicon.ico|.*\\.webp|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
}
