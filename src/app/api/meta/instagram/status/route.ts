import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { facebookLoginConfigured, facebookLoginStatus } from '@/lib/facebook-login'
import { igLoginStatus } from '@/lib/instagram-login'

// Super Admin's Meta login panel: per brand the Instagram Login account + token expiry, and
// the Page connected through Facebook Login (no tokens).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = req.nextUrl.searchParams.get('tenantId')
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  const [ig, facebookConfigured] = await Promise.all([igLoginStatus(tenantId), facebookLoginConfigured(tenantId)])
  const brands = await Promise.all(ig.brands.map(async b => ({ ...b, ...(await facebookLoginStatus(tenantId, b.brand)) })))
  return NextResponse.json({ ...ig, facebookConfigured, brands })
}
