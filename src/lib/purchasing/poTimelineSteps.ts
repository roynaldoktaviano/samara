import type { TimelineStep } from '@/components/purchasing/Timeline'
import { describeInstallment } from '@/lib/po-payment'

const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

interface Installment {
  id: string; amount: number; status: string; createdAt: string
  requestedBy: { name: string | null } | null
  paidAt: string | null; paidBy: { name: string | null } | null
  notePhotoKeys: string[]; transferProofKeys: string[]
}

// The minimal shape buildPoTimelineSteps needs off a PO — OrdersPage.tsx's own OrderDetail
// (fetched from GET /api/purchasing/orders/[id]) is a superset and satisfies this directly.
export interface PoTimelineDetail {
  request?: { prNumber: string; createdAt: string } | null
  requestedByName: string | null
  requestedByOffice: string | null
  requestedByDepartment: string | null
  requestedByRole: string | null
  status: string
  orderedAt: string
  confirmedByName?: string | null
  supplierName: string | null
  paymentRequests: (Installment & { paymentMethod: string })[]
  reimbursements: Installment[]
  grandTotal: number
  transitStops?: { locationId: string; sequence: number; location: { id: string; name: string; type: string } }[]
  deliveryLocationId: string | null
  deliveryLocation: { name: string } | null
  dispatchedAt: string | null
  dispatchedByName?: string | null
  dispatchPhotoKey?: string | null
  receipts: { id: string; receivedAt: string; receiverName?: string | null; receivePhotoKey?: string | null; items: { itemName: string }[] }[]
  transitTransfers: {
    legSequence: number | null; dispatchedAt: string | null; receivedAt: string | null
    dispatchedBy: { name: string | null } | null
    dispatchPhotoKey: string | null; receivePhotoKey: string | null; receivedByName: string | null
  }[]
  cancelledAt?: string | null
  cancelledByName?: string | null
  cancellationReason?: string | null
}

// Builds the exact same step list OrdersPage.tsx's POTimeline renders for a PO — PR
// Submitted, PO Confirmed, every payment/reimbursement installment, dispatch, transit
// leg-by-leg dispatch/arrival (real once a leg exists, placeholder before), receipt(s),
// and a terminal Cancelled step — so a PO's journey reads identically wherever it's shown.
// includePrStep is false when the caller (the PR detail page) already renders its own
// "PR Submitted" step and doesn't want it duplicated per linked PO.
export function buildPoTimelineSteps(detail: PoTimelineDetail, opts: { includePrStep?: boolean } = {}): TimelineStep[] {
  const { includePrStep = true } = opts

  return [
    ...(includePrStep && detail.request ? [{
      key: 'pr',
      done: true,
      label: 'PR Submitted',
      date: fmt(detail.request.createdAt),
      sub: [
        detail.requestedByName,
        [detail.requestedByOffice, detail.requestedByDepartment, detail.requestedByRole].filter(Boolean).join(' · ') || null,
        detail.request.prNumber,
      ],
    }] : []),
    {
      key: 'ordered',
      done: !['DRAFT'].includes(detail.status),
      label: 'PO Confirmed',
      date: !['DRAFT'].includes(detail.status) && detail.orderedAt ? fmt(detail.orderedAt) : null,
      sub: !['DRAFT'].includes(detail.status)
        ? [detail.supplierName, detail.confirmedByName ? `by ${detail.confirmedByName}` : null]
        : [],
    },
    // Payment step(s) — a PO can be paid across multiple installments (DP + final
    // settlement), in any mix of Request Payment/Debit Paid (POPaymentRequest) and
    // Reimburse (POReimbursement). Every installment gets its own Requested/Paid
    // step-pair, in chronological order, labeled Down Payment / Additional Payment /
    // Final Payment based on how much of the order total it and the installments
    // before it add up to.
    ...(() => {
      const installments = [
        ...detail.paymentRequests.map(p => ({ ...p, kind: 'payment' as const })),
        ...detail.reimbursements.map(r => ({ ...r, kind: 'reimbursement' as const, paymentMethod: undefined as string | undefined })),
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      let cumulative = 0
      const paymentSteps: TimelineStep[] = []
      for (const inst of installments) {
        const label = describeInstallment(detail.grandTotal, cumulative, inst.amount)
        cumulative += inst.amount
        const paid = inst.status === 'PAID'
        const isReimbursement = inst.kind === 'reimbursement'
        const isCard = inst.kind === 'payment' && inst.paymentMethod === 'CARD'

        if (isCard) {
          paymentSteps.push({
            key: `payment-${inst.id}`,
            done: true,
            label: `${label} — Debit Paid`,
            date: inst.paidAt ? fmt(inst.paidAt) : fmt(inst.createdAt),
            sub: [fmtMoney(inst.amount), (inst.paidBy?.name ?? inst.requestedBy?.name) ? `by ${inst.paidBy?.name ?? inst.requestedBy?.name}` : null],
            photos: inst.notePhotoKeys,
            photoLabel: 'View nota',
          })
          continue
        }
        paymentSteps.push({
          key: `${inst.kind}-requested-${inst.id}`,
          done: true,
          label: isReimbursement ? `${label} (Reimbursement) Requested` : `${label} Requested`,
          date: fmt(inst.createdAt),
          sub: [fmtMoney(inst.amount), inst.requestedBy?.name ? `by ${inst.requestedBy.name}` : null],
          photos: inst.notePhotoKeys,
          photoLabel: 'View nota',
        })
        paymentSteps.push({
          key: `${inst.kind}-paid-${inst.id}`,
          done: paid,
          label: isReimbursement ? `${label} (Reimbursement) Paid` : `${label} Confirmed`,
          date: paid && inst.paidAt ? fmt(inst.paidAt) : null,
          sub: paid ? [inst.paidBy?.name ? `by ${inst.paidBy.name}` : null] : [],
          photos: paid ? inst.transferProofKeys : [],
          photoLabel: 'View transfer proof',
        })
      }
      return paymentSteps
    })(),
    // Routed POs (detail.transitStops.length > 0) ship Supplier -> first stop as the normal
    // dispatch+receipt flow below, then continue first stop -> ... -> deliveryLocationId as
    // one auto-chained StockTransfer leg per hop (detail.transitTransfers) — see
    // src/lib/purchasing/transitChain.ts.
    {
      key: 'transit',
      done: ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(detail.status),
      label: detail.transitStops && detail.transitStops.length > 0 ? `Dispatched — on deliver to ${detail.transitStops[0].location.name}` : 'On Delivery',
      date: detail.dispatchedAt ? fmt(detail.dispatchedAt) : null,
      sub: [detail.dispatchedByName],
      photos: detail.dispatchPhotoKey ? [detail.dispatchPhotoKey] : [],
      photoLabel: 'View dispatch photo',
    },
    ...detail.receipts.map((r, i) => ({
      key: `gr-${r.id}`,
      done: true,
      label: detail.transitStops && detail.transitStops.length > 0
        ? `Arrived at ${detail.transitStops[0].location.name}`
        : (detail.receipts.length === 1 ? 'Received' : `Receipt ${i + 1}`),
      date: fmt(r.receivedAt),
      sub: [r.receiverName, `${r.items.length} item${r.items.length !== 1 ? 's' : ''}`],
      photos: r.receivePhotoKey ? [r.receivePhotoKey] : [],
      photoLabel: 'View receipt photo',
    })),
    // One Dispatched/Arrived step-pair per planned hop beyond the first stop (first stop ->
    // next stop -> ... -> final destination) — placeholders (done: false) until that leg
    // actually exists as a StockTransfer.
    ...(() => {
      if (!detail.transitStops || detail.transitStops.length === 0) return []
      const routeLocationIds = [...detail.transitStops.map(s => s.locationId), detail.deliveryLocationId].filter((x): x is string => !!x)
      const locationName = (locId: string) => detail.transitStops!.find(s => s.locationId === locId)?.location.name ?? detail.deliveryLocation?.name ?? locId
      const legSteps: TimelineStep[] = []
      for (let i = 0; i < routeLocationIds.length - 1; i++) {
        const legSequence = i + 1
        const fromName = locationName(routeLocationIds[i])
        const toName = locationName(routeLocationIds[i + 1])
        const leg = detail.transitTransfers.find(t => t.legSequence === legSequence)
        legSteps.push({
          key: `leg-${legSequence}-dispatch`,
          done: !!leg?.dispatchedAt,
          label: `Dispatched from ${fromName}`,
          date: leg?.dispatchedAt ? fmt(leg.dispatchedAt) : null,
          sub: [`to ${toName}`, leg?.dispatchedBy?.name ? `by ${leg.dispatchedBy.name}` : null],
          photos: leg?.dispatchPhotoKey ? [leg.dispatchPhotoKey] : [],
          photoLabel: 'View dispatch photo',
        })
        legSteps.push({
          key: `leg-${legSequence}-arrive`,
          done: !!leg?.receivedAt,
          label: `Arrived at ${toName}`,
          date: leg?.receivedAt ? fmt(leg.receivedAt) : null,
          sub: [leg?.receivedByName ? `by ${leg.receivedByName}` : null],
          photos: leg?.receivePhotoKey ? [leg.receivePhotoKey] : [],
          photoLabel: 'View receive photo',
        })
      }
      return legSteps
    })(),
    ...(!['RECEIVED', 'CANCELLED'].includes(detail.status) && detail.receipts.length === 0 ? [{
      key: 'receive',
      done: false,
      label: 'Received',
      date: null,
      sub: [],
    }] : []),
    ...(detail.status === 'CANCELLED' ? [{
      key: 'cancelled',
      done: true,
      label: 'Cancelled',
      date: detail.cancelledAt ? fmt(detail.cancelledAt) : null,
      sub: [detail.cancelledByName, detail.cancellationReason],
      cancelled: true,
    }] : []),
  ]
}
