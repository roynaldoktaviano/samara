import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const SOURCES = ['customers', 'leads', 'agents', 'agentLeads'] as const
type Source = (typeof SOURCES)[number]

/**
 * Lists individual people within one audience source (for the campaign
 * builder's per-person include/exclude picker) — search-filtered and capped,
 * since a source like Guests can run into the thousands.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') as Source | null
  if (!source || !SOURCES.includes(source)) return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  const search = searchParams.get('search') ?? ''
  const yachtId = searchParams.get('yachtId') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50') || 50, 200)
  const skip = (page - 1) * limit

  const searchOr = (fields: string[]) => search ? { OR: fields.map(f => ({ [f]: { contains: search, mode: 'insensitive' as const } })) } : {}

  let members: { id: string; name: string; email: string | null }[] = []
  let total = 0

  if (source === 'customers') {
    const where = {
      deletedAt: null, email: { not: null },
      ...(yachtId && { bookings: { some: { yachtId } } }),
      ...searchOr(['name', 'email']),
    }
    ;[members, total] = await Promise.all([
      db.customer.findMany({ where, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, skip, take: limit }),
      db.customer.count({ where }),
    ])
  } else if (source === 'leads') {
    const where = { deletedAt: null, email: { not: null }, ...searchOr(['name', 'email']) }
    ;[members, total] = await Promise.all([
      db.lead.findMany({ where, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, skip, take: limit }),
      db.lead.count({ where }),
    ])
  } else if (source === 'agents') {
    const where = { email: { not: null }, ...searchOr(['name', 'email']) }
    ;[members, total] = await Promise.all([
      db.agent.findMany({ where, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, skip, take: limit }),
      db.agent.count({ where }),
    ])
  } else {
    const where = { email: { not: null }, ...searchOr(['name', 'email']) }
    ;[members, total] = await Promise.all([
      db.agentLeadContact.findMany({ where, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, skip, take: limit }),
      db.agentLeadContact.count({ where }),
    ])
  }

  return NextResponse.json(members, { headers: { 'X-Total-Count': String(total) } })
}
