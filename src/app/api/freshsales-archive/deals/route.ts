import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { archiveAccess, isMissingTable, loadLookups, stageStatus } from '@/lib/freshsales-archive-view'

const PAGE_SIZE = 50

// Deal list for the Freshsales Archive menu, plus the filter options and sync progress.
export async function GET(req: NextRequest) {
  const access = await archiveAccess()
  if ('error' in access) return access.error
  const { db } = access
  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const q = sp.get('q')?.trim()
  const pipeline = sp.get('pipeline') || undefined
  const stage = sp.get('stage') || undefined
  const owner = sp.get('owner') || undefined
  const status = sp.get('status') as 'OPEN' | 'WON' | 'LOST' | null

  try {
    const lk = await loadLookups(db)
    const where: Prisma.FreshsalesDealWhereInput = {}
    if (q) where.name = { contains: q, mode: 'insensitive' }
    if (pipeline) where.pipelineFsId = pipeline
    if (owner) where.ownerFsId = owner === 'none' ? null : owner
    if (stage) where.stageFsId = stage
    else if (status) where.stageFsId = { in: [...lk.stage].filter(([, s]) => stageStatus(s.type) === status).map(([id]) => id) }

    const [total, deals, sync] = await Promise.all([
      db.freshsalesDeal.count({ where }),
      db.freshsalesDeal.findMany({
        where,
        orderBy: { fsCreatedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, name: true, amount: true, currencyFsId: true, pipelineFsId: true, stageFsId: true,
          ownerFsId: true, contactFsIds: true, lostReasonFsId: true, fsCreatedAt: true, closedDate: true,
          stageUpdatedAt: true, detailSyncedAt: true,
        },
      }),
      db.freshsalesSyncState.findMany({ orderBy: { entity: 'asc' } }),
    ])
    const contacts = await db.freshsalesContact.findMany({
      where: { id: { in: [...new Set(deals.flatMap(d => d.contactFsIds))] } },
      select: { id: true, name: true, email: true },
    })
    const contactById = new Map(contacts.map(c => [c.id, c]))

    return NextResponse.json({
      total,
      page,
      pageSize: PAGE_SIZE,
      deals: deals.map(d => {
        const st = d.stageFsId ? lk.stage.get(d.stageFsId) : undefined
        return {
          id: d.id,
          name: d.name,
          amount: d.amount,
          currency: d.currencyFsId ? lk.currency.get(d.currencyFsId) ?? null : null,
          pipeline: d.pipelineFsId ? lk.pipeline.get(d.pipelineFsId) ?? null : null,
          stage: st?.name ?? null,
          status: stageStatus(st?.type),
          owner: d.ownerFsId ? lk.owner.get(d.ownerFsId) ?? null : null,
          lostReason: d.lostReasonFsId ? lk.reason.get(d.lostReasonFsId) ?? null : null,
          contacts: d.contactFsIds.map(id => contactById.get(id)).filter(Boolean),
          createdAt: d.fsCreatedAt,
          closedDate: d.closedDate,
          detailSynced: !!d.detailSyncedAt,
        }
      }),
      filters: {
        pipelines: [...lk.pipeline].map(([id, name]) => ({ id, name })),
        stages: [...lk.stage]
          .map(([id, s]) => ({ id, name: s.name, pipelineId: s.pipelineFsId, position: s.position ?? 0 }))
          .sort((a, b) => a.position - b.position),
        owners: [...lk.owner].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      },
      sync: sync.map(s => ({ entity: s.entity, status: s.status, processed: s.processed, total: s.total, updatedAt: s.updatedAt })),
    })
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ notAvailable: true, total: 0, deals: [], filters: { pipelines: [], stages: [], owners: [] }, sync: [] })
    throw e
  }
}
