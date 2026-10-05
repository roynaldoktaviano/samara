import { NextRequest, NextResponse } from 'next/server'
import { cashierSlug } from '@/lib/cashier-slug'

// Per-vessel PWA manifest, so an installed terminal always opens straight on its own vessel link:
// cashier.<domain>/samara1 on the cashier subdomain, /cashier/samara1 on the ERP host.
export async function GET(req: NextRequest) {
  const slug = cashierSlug(req.nextUrl.searchParams.get('vessel') ?? '')
  const host = req.headers.get('host')?.split(':')[0] ?? ''
  const onCashierHost = host === (process.env.CASHIER_HOST || 'cashier.samarayachting.com') || host.startsWith('cashier.')
  const start = onCashierHost ? `/${slug}` : `/cashier/${slug}`

  return NextResponse.json({
    id: start,
    name: 'Samara Cashier',
    short_name: 'Cashier',
    description: 'Samara Liveaboard point-of-sale cashier',
    start_url: start,
    scope: onCashierHost ? '/' : '/cashier/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fafaf8',
    theme_color: '#bdac7e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json' } })
}
