import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { facebookLoginAuthorizeUrl } from '@/lib/facebook-login'
import { appBaseUrl, igLoginAuthorizeUrl, signIgLoginState } from '@/lib/instagram-login'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'

// Super Admin → "Connect Instagram" (Instagram Login) or "Connect via Facebook" (Facebook Login
// for Business, ?via=facebook) for one brand of one tenant. Both come back to
// /api/meta/instagram/callback.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = req.nextUrl.searchParams.get('tenantId')
  const brand = req.nextUrl.searchParams.get('brand') as WhatsappBrand | null
  if (!tenantId || !brand || !WHATSAPP_BRANDS.includes(brand)) {
    return NextResponse.json({ error: 'tenantId and a valid brand are required' }, { status: 400 })
  }

  const via = req.nextUrl.searchParams.get('via') === 'facebook' ? 'facebook' : 'instagram'
  const nonce = crypto.randomBytes(16).toString('hex')
  const state = signIgLoginState({ tenantId, brand, nonce, via })
  const url = via === 'facebook' ? await facebookLoginAuthorizeUrl(tenantId, state) : await igLoginAuthorizeUrl(tenantId, brand, state)
  if (!url) {
    const back = new URL('/super-admin', appBaseUrl() || req.nextUrl.origin)
    back.searchParams.set('igTenant', tenantId)
    back.searchParams.set('igError', via === 'facebook'
      ? 'Set the Meta App ID, Meta DM App Secret and Login Configuration ID first (Secrets → Facebook & Instagram DM)'
      : 'Set the Instagram App ID and App Secret first (Secrets → Instagram Login)')
    return NextResponse.redirect(back)
  }
  const res = NextResponse.redirect(url)
  res.cookies.set('ig_login_nonce', nonce, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/meta/instagram', maxAge: 600 })
  return res
}
