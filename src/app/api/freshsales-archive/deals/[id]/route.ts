import { NextRequest, NextResponse } from 'next/server'
import { archiveAccess, buildTimeline, loadLookups, stageStatus } from '@/lib/freshsales-archive-view'

// One archived deal: its fields (custom fields included), contacts and merged history.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await archiveAccess()
  if ('error' in access) return access.error
  const { db } = access

  const deal = await db.freshsalesDeal.findUnique({ where: { id }, omit: { raw: true } })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const lk = await loadLookups(db)
  const contacts = await db.freshsalesContact.findMany({
    where: { id: { in: deal.contactFsIds } },
    select: { id: true, name: true, email: true, phone: true, leadId: true, customerId: true },
  })
  // Deal-linked items plus everything on its contacts — Freshsales only links some emails to a deal.
  const timeline = await buildTimeline(db, lk, { contactFsIds: deal.contactFsIds, dealFsIds: [deal.id] })
  const st = deal.stageFsId ? lk.stage.get(deal.stageFsId) : undefined
  const customFields = Object.entries((deal.customFields as Record<string, unknown> | null) ?? {})
    .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([key, value]) => ({ key, label: key.replace(/^cf_/, '').replace(/_+/g, ' ').trim(), value: Array.isArray(value) ? value.join(', ') : String(value) }))

  return NextResponse.json({
    deal: {
      id: deal.id,
      name: deal.name,
      amount: deal.amount,
      currency: deal.currencyFsId ? lk.currency.get(deal.currencyFsId) ?? null : null,
      pipeline: deal.pipelineFsId ? lk.pipeline.get(deal.pipelineFsId) ?? null : null,
      stage: st?.name ?? null,
      status: stageStatus(st?.type),
      owner: deal.ownerFsId ? lk.owner.get(deal.ownerFsId) ?? null : null,
      lostReason: deal.lostReasonFsId ? lk.reason.get(deal.lostReasonFsId) ?? null : null,
      leadSource: deal.leadSourceFsId ? lk.leadSource.get(deal.leadSourceFsId) ?? null : null,
      probability: deal.probability,
      expectedClose: deal.expectedClose,
      closedDate: deal.closedDate,
      stageUpdatedAt: deal.stageUpdatedAt,
      createdAt: deal.fsCreatedAt,
      updatedAt: deal.fsUpdatedAt,
      detailSynced: !!deal.detailSyncedAt,
      customFields,
    },
    contacts,
    timeline,
  })
}
