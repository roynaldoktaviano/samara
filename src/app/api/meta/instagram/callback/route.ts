import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectFacebookLogin } from '@/lib/facebook-login'
import { connectIgLogin, verifyIgLoginState } from '@/lib/instagram-login'
import { logSuperAdmin } from '@/lib/super-admin-log'
import { WHATSAPP_BRAND_LABELS } from '@/lib/whatsapp-brands'

// OAuth redirect URI for both Instagram Login and Facebook Login for Business (register it in
// the Meta App — see src/lib/instagram-login.ts / facebook-login.ts). The signed state says
// which one; exchanges the code, stores the brand's credentials, and returns to Super Admin
// with the outcome in the query string.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const back = (q: Record<string, string>) => {
    const url = new URL('/super-admin', req.nextUrl.origin)
    for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v)
    const res = NextResponse.redirect(url)
    res.cookies.delete({ name: 'ig_login_nonce', path: '/api/meta/instagram' })
    return res
  }

  const session = await getServerSession(authOptions)
  if (!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin) {
    return back({ igError: 'Log in as Super Admin, then connect Instagram again' })
  }
  const state = verifyIgLoginState(params.get('state'))
  if (!state || state.nonce !== req.cookies.get('ig_login_nonce')?.value) {
    return back({ igError: 'This Instagram login link expired or was not started here — click Connect again' })
  }
  // From here on Super Admin reopens this tenant to show the outcome.
  if (params.get('error')) {
    return back({ igTenant: state.tenantId, igError: params.get('error_description') || params.get('error_reason') || 'Instagram login was cancelled' })
  }
  const code = params.get('code')
  if (!code) return back({ igTenant: state.tenantId, igError: 'Instagram did not return a login code' })

  const label = WHATSAPP_BRAND_LABELS[state.brand]
  if (state.via === 'facebook') {
    try {
      const result = await connectFacebookLogin(state.tenantId, state.brand, code)
      const what = `${label} → ${result.pageName}${result.igUsername ? ` + @${result.igUsername}` : ''}`
      logSuperAdmin({ adminEmail: session!.user!.email!, action: 'CONNECT_FACEBOOK_LOGIN', targetType: 'tenant', targetId: state.tenantId, detail: what })
      const warnings = [
        !result.hasInstagram && 'this Page has no Instagram professional account linked, so only Messenger will work',
        result.subscribeError && `the Page webhook subscription failed: ${result.subscribeError}`,
      ].filter(Boolean)
      return back({ igTenant: state.tenantId, igConnected: what, ...(warnings.length && { igWarning: `Connected, but ${warnings.join('; ')}` }) })
    } catch (e) {
      console.error('[facebook-login callback]', e)
      return back({ igTenant: state.tenantId, igError: e instanceof Error ? e.message : 'Facebook login failed' })
    }
  }

  try {
    const result = await connectIgLogin(state.tenantId, state.brand, code)
    logSuperAdmin({
      adminEmail: session!.user!.email!, action: 'CONNECT_INSTAGRAM_LOGIN', targetType: 'tenant', targetId: state.tenantId,
      detail: `${WHATSAPP_BRAND_LABELS[state.brand]} → @${result.username ?? result.igAccountId}`,
    })
    return back({
      igTenant: state.tenantId,
      igConnected: `${WHATSAPP_BRAND_LABELS[state.brand]} → @${result.username ?? result.igAccountId}`,
      ...(result.subscribeError && { igWarning: `Connected, but the webhook subscription failed: ${result.subscribeError}` }),
    })
  } catch (e) {
    console.error('[instagram-login callback]', e)
    return back({ igTenant: state.tenantId, igError: e instanceof Error ? e.message : 'Instagram login failed' })
  }
}
