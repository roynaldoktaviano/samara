import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { getTenantSecret } from '@/lib/tenant-secrets'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING']

interface FreshsalesContact {
  id: number; display_name?: string; first_name?: string; last_name?: string
  email?: string; mobile_number?: string; work_number?: string
}

// Imports every contact from a Freshsales view into either Leads or Guests,
// keyed by freshsalesContactId so re-running the same view is idempotent
// (updates existing rows instead of duplicating them). One Freshsales contact
// maps to exactly one Lead/Customer row — no grouping (unlike the Agent Leads
// import, which groups contacts by company name).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const tenantId = (session.user as { tenantId?: string }).tenantId ?? ''
  const [apiKey, domain] = await Promise.all([
    getTenantSecret(tenantId, 'freshsalesApiKey'),
    getTenantSecret(tenantId, 'freshsalesDomain'),
  ])
  if (!apiKey || !domain) return NextResponse.json({ error: 'FRESHSALES_API_KEY / FRESHSALES_DOMAIN not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const viewId = body?.viewId ? String(body.viewId).trim() : ''
  const target = body?.target as 'lead' | 'guest'
  if (!viewId) return NextResponse.json({ error: 'View ID is required' }, { status: 400 })
  if (target !== 'lead' && target !== 'guest') return NextResponse.json({ error: 'target must be "lead" or "guest"' }, { status: 400 })

  const perPage = 100
  const allContacts: FreshsalesContact[] = []
  let page = 1
  let totalPages = 1

  do {
    const res = await fetch(
      `https://${domain}/api/contacts/view/${viewId}?page=${page}&per_page=${perPage}&sort=display_name&sort_type=asc`,
      { headers: { Authorization: `Token token=${apiKey}`, 'Content-Type': 'application/json' }, cache: 'no-store' },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: 'Freshsales API error', status: res.status, data }, { status: res.status })

    totalPages = data.meta?.total_pages ?? 1
    allContacts.push(...(data.contacts ?? []))
    page++
  } while (page <= totalPages)

  let created = 0
  let updated = 0

  for (const c of allContacts) {
    const freshsalesContactId = String(c.id)
    const name = (c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Unknown').trim()
    const data = {
      name,
      firstName: c.first_name || null,
      lastName: c.last_name || null,
      email: c.email || null,
      phone: c.mobile_number || c.work_number || null,
    }

    if (target === 'lead') {
      const existing = await db.lead.findUnique({ where: { freshsalesContactId } })
      await db.lead.upsert({
        where: { freshsalesContactId },
        create: { ...data, freshsalesContactId },
        update: data,
      })
      if (existing) updated++; else created++
    } else {
      const existing = await db.customer.findUnique({ where: { freshsalesContactId } })
      await db.customer.upsert({
        where: { freshsalesContactId },
        create: { ...data, freshsalesContactId },
        update: data,
      })
      if (existing) updated++; else created++
    }
  }

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'IMPORT', entity: target === 'lead' ? 'Lead' : 'Customer', entityId: viewId,
    detail: `Imported ${allContacts.length} contact(s) from Freshsales view ${viewId} as ${target === 'lead' ? 'Leads' : 'Guests'} (${created} created, ${updated} updated)`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true, viewId, target, totalFetched: allContacts.length, created, updated })
}
