import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getTenantSecret } from '@/lib/tenant-secrets'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']
const DEFAULT_VIEW_ID = '113000008394' // "Agents" view in Freshsales

interface FreshsalesUser { id: number; display_name?: string }
interface FreshsalesContact {
  id: number; display_name?: string; first_name?: string; last_name?: string
  email?: string; mobile_number?: string; work_number?: string; job_title?: string
  owner_id?: number | null
}

// Pulls every contact from a Freshsales view, groups them by display_name (so e.g.
// "Nicholson Yachts" with two different emails becomes one AgentLead with two
// AgentLeadContact rows), and upserts into the staging table. Leads already marked
// DISCARDED or PROMOTED are left untouched — re-running this never resurrects or
// mutates a reviewed lead, it only adds/updates contacts under still-NEW leads.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const tenantId = (session.user as { tenantId?: string }).tenantId ?? ''
  const [apiKey, domain] = await Promise.all([
    getTenantSecret(tenantId, 'freshsalesApiKey'),
    getTenantSecret(tenantId, 'freshsalesDomain'),
  ])
  if (!apiKey || !domain) return NextResponse.json({ error: 'FRESHSALES_API_KEY / FRESHSALES_DOMAIN not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const viewId = body?.viewId ? String(body.viewId) : DEFAULT_VIEW_ID
  const perPage = 100

  const allContacts: FreshsalesContact[] = []
  const usersById = new Map<number, FreshsalesUser>()
  let page = 1
  let totalPages = 1

  do {
    const res = await fetch(
      `https://${domain}/api/contacts/view/${viewId}?page=${page}&per_page=${perPage}&include=owner&sort=display_name&sort_type=asc`,
      { headers: { Authorization: `Token token=${apiKey}`, 'Content-Type': 'application/json' }, cache: 'no-store' },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: 'Freshsales API error', status: res.status, data }, { status: res.status })

    totalPages = data.meta?.total_pages ?? 1
    ;(data.users ?? []).forEach((u: FreshsalesUser) => usersById.set(u.id, u))
    allContacts.push(...(data.contacts ?? []))
    page++
  } while (page <= totalPages)

  const groups = new Map<string, FreshsalesContact[]>()
  for (const c of allContacts) {
    const name = (c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Unknown').trim()
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push(c)
  }

  let leadsCreated = 0
  let leadsUpdated = 0
  let leadsSkipped = 0
  let contactsUpserted = 0

  for (const [name, contactsForName] of groups) {
    let lead = await db.agentLead.findUnique({ where: { name } })
    if (lead && lead.status !== 'NEW') { leadsSkipped++; continue }
    if (!lead) {
      lead = await db.agentLead.create({ data: { name } })
      leadsCreated++
    } else {
      leadsUpdated++
    }

    for (const c of contactsForName) {
      const owner = c.owner_id ? usersById.get(c.owner_id) : null
      await db.agentLeadContact.upsert({
        where: { freshsalesContactId: String(c.id) },
        create: {
          agentLeadId: lead.id,
          freshsalesContactId: String(c.id),
          name: c.display_name || name,
          email: c.email || null,
          whatsapp: c.mobile_number || c.work_number || null,
          jobTitle: c.job_title || null,
          salesOwnerName: owner?.display_name || null,
        },
        update: {
          name: c.display_name || name,
          email: c.email || null,
          whatsapp: c.mobile_number || c.work_number || null,
          jobTitle: c.job_title || null,
          salesOwnerName: owner?.display_name || null,
        },
      })
      contactsUpserted++
    }
  }

  return NextResponse.json({
    ok: true,
    viewId,
    totalFetched: allContacts.length,
    groupsFound: groups.size,
    leadsCreated,
    leadsUpdated,
    leadsSkipped,
    contactsUpserted,
  })
}
