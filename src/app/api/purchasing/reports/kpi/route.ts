import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getBand, requiredQuotationCount, type PurchaseBand } from '@/lib/purchasing/quotationBands'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
const DRAFT_TO_VERIFIED_SLA_HOURS = 24

function sameCalendarDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}
function hoursBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 3_600_000
}
function mean(nums: number[]) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
}
function median(nums: number[]) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0
}
function round1(n: number) {
  return Math.round(n * 10) / 10
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const from = fromParam ? new Date(fromParam) : null
  const to = toParam ? new Date(`${toParam}T23:59:59.999`) : null
  const dateWhere = (from || to)
    ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
    : {}
  const periodLabel = from || to
    ? `${from ? from.toLocaleDateString('id-ID') : '...'} – ${to ? to.toLocaleDateString('id-ID') : '...'}`
    : 'All time'

  const now = new Date()

  const [prsVerified, convertedPrs, dispatchedPos, candidatePos, receivedPos, convertedItems] = await Promise.all([
    // KPI 1a (proxy same-day) + KPI 2 Draft->Verified
    db.purchaseRequest.findMany({
      where: { verifiedAt: { not: null }, ...dateWhere },
      select: { createdAt: true, verifiedAt: true },
    }),
    // KPI 2 Verified->Converted (descriptive, no SLA)
    db.purchaseRequest.findMany({
      where: { verifiedAt: { not: null }, convertedAt: { not: null }, ...dateWhere },
      select: { verifiedAt: true, convertedAt: true },
    }),
    // KPI 1b (proxy same-day) + KPI 2 Ordered->Dispatched (descriptive, no SLA)
    db.purchaseOrder.findMany({
      where: { dispatchedAt: { not: null }, ...dateWhere },
      select: { createdAt: true, orderedAt: true, dispatchedAt: true },
    }),
    // KPI 3 — PO follow-up/escalation. Cancelled POs excluded entirely: goods never
    // shipped, so no delivery deadline was ultimately violated.
    db.purchaseOrder.findMany({
      where: { expectedAt: { not: null }, status: { not: 'CANCELLED' }, ...dateWhere },
      select: {
        expectedAt: true,
        status: true,
        receipts: { orderBy: { receivedAt: 'desc' }, take: 1, select: { receivedAt: true } },
        followUps: { select: { isEscalation: true, createdAt: true } },
      },
    }),
    // KPI 4 — documentation completeness
    db.purchaseOrder.findMany({
      where: { status: 'RECEIVED', ...dateWhere },
      select: {
        requestId: true,
        request: { select: { verifiedById: true, convertedById: true } },
        paymentRequests: { select: { notePhotoKeys: true, notaDate: true } },
        reimbursements: { select: { notePhotoKeys: true, notaDate: true } },
        receipts: { select: { receivePhotoKey: true } },
      },
    }),
    // KPI 5 — quotation/sourcing compliance, scoped by the parent PR's createdAt
    db.purchaseRequestItem.findMany({
      where: { request: { status: 'CONVERTED', ...dateWhere } },
      select: {
        quantity: true, estimatedCost: true, supplierId: true, supplierName: true,
        exemptionReason: true, selectionJustification: true,
        quotations: { select: { price: true, supplierId: true, supplierName: true } },
      },
    }),
  ])

  // ── KPI 1 — proxy same-day updates ──
  const prSameDayCount = prsVerified.filter(p => sameCalendarDay(p.createdAt, p.verifiedAt!)).length
  const poSameDayCount = dispatchedPos.filter(o => sameCalendarDay(o.createdAt, o.dispatchedAt!)).length
  const kpi1 = {
    prSameDayPct: pct(prSameDayCount, prsVerified.length),
    prSameDayCount,
    prVerifiedTotal: prsVerified.length,
    poSameDayPct: pct(poSameDayCount, dispatchedPos.length),
    poSameDayCount,
    poDispatchedTotal: dispatchedPos.length,
  }

  // ── KPI 2 — timeliness ──
  const draftHours = prsVerified.map(p => hoursBetween(p.createdAt, p.verifiedAt!))
  const withinSlaCount = draftHours.filter(h => h <= DRAFT_TO_VERIFIED_SLA_HOURS).length
  const vToCHours = convertedPrs.map(p => hoursBetween(p.verifiedAt!, p.convertedAt!))
  const oToDHours = dispatchedPos.map(o => hoursBetween(o.orderedAt, o.dispatchedAt!))
  const kpi2 = {
    slaHours: DRAFT_TO_VERIFIED_SLA_HOURS,
    draftToVerified: {
      withinSlaPct: pct(withinSlaCount, draftHours.length),
      withinSlaCount,
      total: draftHours.length,
      avgHours: round1(mean(draftHours)),
      medianHours: round1(median(draftHours)),
    },
    verifiedToConverted: { avgHours: round1(mean(vToCHours)), medianHours: round1(median(vToCHours)), count: vToCHours.length },
    poOrderedToDispatched: { avgHours: round1(mean(oToDHours)), medianHours: round1(median(oToDHours)), count: oToDHours.length },
  }

  // ── KPI 3 — PO follow-up & early escalation ──
  let everOverdueTotal = 0, escalatedBeforeDeadline = 0, escalatedAfterDeadline = 0, followedUpNotEscalated = 0, neverFollowedUp = 0
  for (const po of candidatePos) {
    const expectedAt = po.expectedAt!
    const isOpen = po.status !== 'RECEIVED'
    const completedAt = isOpen ? null : (po.receipts[0]?.receivedAt ?? null)
    const overdue = isOpen ? expectedAt < now : (completedAt ? completedAt > expectedAt : false)
    if (!overdue) continue
    everOverdueTotal++
    const escalations = po.followUps.filter(f => f.isEscalation)
    const onTime = escalations.some(f => f.createdAt <= expectedAt)
    const late = escalations.some(f => f.createdAt > expectedAt)
    if (onTime) escalatedBeforeDeadline++
    else if (late) escalatedAfterDeadline++
    else if (po.followUps.length > 0) followedUpNotEscalated++
    else neverFollowedUp++
  }
  const kpi3 = {
    everOverdueTotal,
    escalatedBeforeDeadline,
    escalatedAfterDeadline,
    followedUpNotEscalated,
    neverFollowedUp,
    followUpRatePct: pct(everOverdueTotal - neverFollowedUp, everOverdueTotal),
  }

  // ── KPI 4 — documentation completeness (RECEIVED POs) ──
  let approvalOkCount = 0, invoiceOkCount = 0, receivingOkCount = 0, allFourCompleteCount = 0
  for (const po of receivedPos) {
    // A PO with no requestId at all (direct/manual PO, not from a PR) has no approval
    // trail to check — treated as satisfied rather than auto-penalized.
    const approval = po.requestId ? (!!po.request?.verifiedById && !!po.request?.convertedById) : true
    const invoice = [...po.paymentRequests, ...po.reimbursements].some(p => p.notePhotoKeys.length > 0 && p.notaDate !== null)
    const receiving = po.receipts.some(r => r.receivePhotoKey !== null)
    if (approval) approvalOkCount++
    if (invoice) invoiceOkCount++
    if (receiving) receivingOkCount++
    if (approval && invoice && receiving) allFourCompleteCount++
  }
  const kpi4 = {
    receivedPoTotal: receivedPos.length,
    allFourCompleteCount,
    completenessPct: pct(allFourCompleteCount, receivedPos.length),
    breakdown: {
      approvalPct: pct(approvalOkCount, receivedPos.length),
      orderPct: 100,
      invoicePct: pct(invoiceOkCount, receivedPos.length),
      receivingPct: pct(receivingOkCount, receivedPos.length),
    },
  }

  // ── KPI 5 — quotation/sourcing compliance ──
  let eligibleItemTotal = 0, compliantItemCount = 0
  const byBand: Record<'B' | 'C' | 'D' | 'E', { total: number; compliant: number }> = {
    B: { total: 0, compliant: 0 }, C: { total: 0, compliant: 0 }, D: { total: 0, compliant: 0 }, E: { total: 0, compliant: 0 },
  }
  for (const item of convertedItems) {
    const value = item.quantity * item.estimatedCost
    const band = getBand(value)
    if (band === 'A') continue
    eligibleItemTotal++
    const required = requiredQuotationCount(band)
    const hasExemption = !!item.exemptionReason?.trim()
    const sourced = hasExemption || item.quotations.length >= required

    const cheapest = item.quotations.length ? item.quotations.reduce((a, b) => (a.price < b.price ? a : b)) : null
    const chosenKey = item.supplierId ?? item.supplierName ?? null
    const cheapestKey = cheapest ? (cheapest.supplierId ?? cheapest.supplierName) : null
    const needsJustification = !!cheapest && cheapest.price < item.estimatedCost && cheapestKey !== chosenKey
    const justificationOk = !needsJustification || !!item.selectionJustification?.trim()

    const compliant = sourced && justificationOk
    const bandKey = band as 'B' | 'C' | 'D' | 'E'
    byBand[bandKey].total++
    if (compliant) { byBand[bandKey].compliant++; compliantItemCount++ }
  }
  const kpi5 = {
    eligibleItemTotal,
    compliantItemCount,
    compliancePct: pct(compliantItemCount, eligibleItemTotal),
    byBand: Object.fromEntries(
      (Object.keys(byBand) as PurchaseBand[]).filter(b => b !== 'A').map(b => [b, { ...byBand[b as 'B' | 'C' | 'D' | 'E'], pct: pct(byBand[b as 'B' | 'C' | 'D' | 'E'].compliant, byBand[b as 'B' | 'C' | 'D' | 'E'].total) }]),
    ),
  }

  return NextResponse.json({ periodLabel, kpi1, kpi2, kpi3, kpi4, kpi5 })
}
