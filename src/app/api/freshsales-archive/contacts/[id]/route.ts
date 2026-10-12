import { NextRequest, NextResponse } from 'next/server'
import { archiveAccess, buildTimeline, loadLookups, stageStatus } from '@/lib/freshsales-archive-view'

// One archived contact: profile, every deal it is on, and its merged history.
// Also reachable by ERP record: ?lead=<leadId> or ?customer=<customerId> with id "by-erp".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await archiveAccess()
  if ('error' in access) return access.error
  const { db } = access
  const sp = req.nextUrl.searchParams

  const contact = id === 'by-erp'
    ? await db.freshsalesContact.findFirst({ where: sp.get('lead') ? { leadId: sp.get('lead') } : { customerId: sp.get('customer') ?? '' } })
    : await db.freshsalesContact.findUnique({ where: { id } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lk = await loadLookups(db)
  const deals = await db.freshsalesDeal.findMany({
    where: { contactFsIds: { has: contact.id } },
    orderBy: { fsCreatedAt: 'desc' },
    select: { id: true, name: true, amount: true, currencyFsId: true, pipelineFsId: true, stageFsId: true, ownerFsId: true, lostReasonFsId: true, fsCreatedAt: true, closedDate: true },
  })
  const timeline = await buildTimeline(db, lk, { contactFsIds: [contact.id], dealFsIds: deals.map(d => d.id) })
  const raw = (contact.raw as Record<string, unknown> | null) ?? {}

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      owner: contact.ownerFsId ? lk.owner.get(contact.ownerFsId) ?? null : null,
      lastContactedAt: contact.lastContactedAt,
      createdAt: contact.fsCreatedAt,
      leadId: contact.leadId,
      customerId: contact.customerId,
      country: raw.country ?? null,
      city: raw.city ?? null,
      firstSource: raw.first_source ?? null,
      firstMedium: raw.first_medium ?? null,
      firstCampaign: raw.first_campaign ?? null,
      historySynced: !!contact.conversationsSyncedAt,
    },
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
        createdAt: d.fsCreatedAt,
        closedDate: d.closedDate,
      }
    }),
    timeline,
  })
}
