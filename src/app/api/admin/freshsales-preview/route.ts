import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantSecret } from '@/lib/tenant-secrets'

// Temporary, throwaway endpoint — lets an admin peek at what a Freshsales contact
// view actually contains (field names, count) before we build the real newsletter
// sync. Delete this route (and the matching page) once that's decided.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = (session?.user as { tenantId?: string })?.tenantId ?? ''
  const [apiKey, domain] = await Promise.all([
    getTenantSecret(tenantId, 'freshsalesApiKey'),
    getTenantSecret(tenantId, 'freshsalesDomain'),
  ])
  if (!apiKey || !domain) {
    return NextResponse.json({ error: 'FRESHSALES_API_KEY / FRESHSALES_DOMAIN not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const page     = searchParams.get('page') ?? '1'
  const viewId   = searchParams.get('view_id') ?? '13000726037' // "All Contacts"
  const sort     = searchParams.get('sort') ?? 'created_at'
  const sortType = searchParams.get('sort_type') ?? 'desc'

  try {
    const res = await fetch(`https://${domain}/api/contacts/view/${viewId}?page=${page}&per_page=25&sort=${sort}&sort_type=${sortType}&include=owner`, {
      headers: {
        'Authorization': `Token token=${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: 'Freshsales API error', status: res.status, data }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('Freshsales preview fetch failed:', error)
    return NextResponse.json({ error: 'Failed to reach Freshsales' }, { status: 502 })
  }
}
