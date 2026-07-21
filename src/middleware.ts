import { withAuth } from 'next-auth/middleware'
import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// API routes gated behind a tenant feature flag — checked here so the flag can't be
// bypassed by calling the endpoint directly once the nav item is hidden client-side.
const FEATURE_GATED_API_PREFIXES = [
  { prefix: '/api/purchasing', feature: 'purchasing' },
  { prefix: '/api/finance/purchase-order-payments', feature: 'purchasing' },
  { prefix: '/api/finance/po-reimbursements', feature: 'purchasing' },
  { prefix: '/api/marketing/campaigns', feature: 'marketing' },
  { prefix: '/api/marketing/templates', feature: 'marketing' },
]

const PUBLIC_PATHS = [
  '/login',
  '/api/public',
  '/api/webhooks',
  '/proto',
  '/proto-2',
  '/proto-3',
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
  // Email unsubscribe — reached from a link in a sent email, no staff login
  '/unsubscribe',
  '/api/marketing/unsubscribe',
  // Scheduled-campaign dispatcher — triggered by Vercel Cron, authenticates via its own bearer secret
  '/api/marketing/campaigns/dispatch',
]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))
}

const authMiddleware = withAuth({
  pages: { signIn: '/login' },
})

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const gated = FEATURE_GATED_API_PREFIXES.find(g => pathname === g.prefix || pathname.startsWith(g.prefix + '/'))
  if (gated) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    // No token: fall through to the normal auth flow below (401/redirect), not a feature error.
    if (token) {
      const isSuperAdmin = token.isSuperAdmin === true
      const features = (token.tenantFeatures as Record<string, boolean> | undefined) ?? {}
      if (!isSuperAdmin && !features[gated.feature]) {
        return NextResponse.json({ error: 'This feature is not enabled for your account' }, { status: 403 })
      }
    }
  }

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
