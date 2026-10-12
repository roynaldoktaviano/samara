import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { archiveAccess, isMissingTable, loadLookups } from '@/lib/freshsales-archive-view'

const PAGE_SIZE = 50

// Contact list for the Freshsales Archive menu (all 34k, incl. archive-only ones).
export async function GET(req: NextRequest) {
  const access = await archiveAccess()
  if ('error' in access) return access.error
  const { db } = access
  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const q = sp.get('q')?.trim()
  const linked = sp.get('linked') // 'lead' | 'customer' | 'none'

  try {
    const and: Prisma.FreshsalesContactWhereInput[] = [{ isDeleted: false }]
    if (q) and.push({ OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ] })
    if (linked === 'lead') and.push({ leadId: { not: null } })
    else if (linked === 'customer') and.push({ customerId: { not: null } })
    else if (linked === 'none') and.push({ leadId: null, customerId: null })
    const where = { AND: and }

    const [lk, total, contacts] = await Promise.all([
      loadLookups(db),
      db.freshsalesContact.count({ where }),
      db.freshsalesContact.findMany({
        where,
        orderBy: [{ lastContactedAt: { sort: 'desc', nulls: 'last' } }, { fsCreatedAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, name: true, email: true, phone: true, ownerFsId: true, lastContactedAt: true, fsCreatedAt: true, leadId: true, customerId: true, conversationsSyncedAt: true },
      }),
    ])
    const ids = contacts.map(c => c.id)
    const dealCounts = ids.length
      ? await db.$queryRaw<{ id: string; n: number }[]>`
          SELECT c.id, count(d.id)::int AS n
          FROM unnest(${ids}::text[]) AS c(id)
          LEFT JOIN "FreshsalesDeal" d ON d."contactFsIds" @> ARRAY[c.id]
          GROUP BY c.id`
      : []
    const dealsOf = new Map(dealCounts.map(r => [r.id, r.n]))

    return NextResponse.json({
      total,
      page,
      pageSize: PAGE_SIZE,
      contacts: contacts.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        owner: c.ownerFsId ? lk.owner.get(c.ownerFsId) ?? null : null,
        lastContactedAt: c.lastContactedAt,
        createdAt: c.fsCreatedAt,
        leadId: c.leadId,
        customerId: c.customerId,
        deals: dealsOf.get(c.id) ?? 0,
        historySynced: !!c.conversationsSyncedAt,
      })),
    })
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ notAvailable: true, total: 0, contacts: [] })
    throw e
  }
}
