// Shared PO pricing/payment math — used by both the payment-request and
// reimbursement API routes (to cap a new request at the remaining balance)
// and the orders list/detail routes (to compute an aggregate payment status).
// No new columns: a PO can be paid across multiple installments (DP + final
// settlement, in any mix of Request Payment / Debit Paid / Reimburse) purely
// by allowing more than one POPaymentRequest/POReimbursement row per order —
// everything here is derived at read time from those existing rows.

export interface POLineInput { orderedQty: number; unitCost: number; discountType?: string | null; discountValue?: number | null }

// Per-line (per-product) discount — 'PERCENT' of qty × unitCost, or a flat 'FIXED' Rupiah
// amount off the whole line. Clamped so a line never goes negative.
export function poLineDiscount(l: POLineInput): number {
  const gross = l.orderedQty * l.unitCost
  const v = Number(l.discountValue) || 0
  if (!l.discountType || v <= 0 || gross <= 0) return 0
  return Math.min(gross, l.discountType === 'PERCENT' ? gross * (v / 100) : v)
}

export function poLineTotal(l: POLineInput): number {
  return l.orderedQty * l.unitCost - poLineDiscount(l)
}

// Fraction of the line price actually paid after its discount (1 = no discount) — used to
// turn a unit price into a net unit cost for stock valuation / outstanding value.
export function poLineNetRatio(l: POLineInput): number {
  const gross = l.orderedQty * l.unitCost
  return gross > 0 ? poLineTotal(l) / gross : 1
}

// Sanitizes a line's discount from a request body into the PurchaseOrderItem columns.
export function lineDiscountData(it: { discountType?: unknown; discountValue?: unknown }) {
  const type = it.discountType === 'PERCENT' || it.discountType === 'FIXED' ? it.discountType : null
  const raw = type ? Math.max(0, Number(it.discountValue) || 0) : 0
  const value = type === 'PERCENT' ? Math.min(100, raw) : raw
  return { discountType: value > 0 ? type : null, discountValue: value > 0 ? value : 0 }
}

export interface POPricingInput {
  items: POLineInput[]
  discountType: string | null
  discountValue: number
  extraCharges: unknown
}

export function computePOGrandTotal(order: POPricingInput): number {
  const itemsSubtotal = order.items.reduce((s, i) => s + poLineTotal(i), 0)
  const discountAmount = order.discountType
    ? Math.min(itemsSubtotal, order.discountType === 'PERCENT' ? itemsSubtotal * (order.discountValue / 100) : order.discountValue)
    : 0
  const charges = Array.isArray(order.extraCharges) ? (order.extraCharges as { amount?: number }[]) : []
  const chargesTotal = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  return itemsSubtotal - discountAmount + chargesTotal
}

export interface POPaymentRecord { amount: number; status: string }

/**
 * requestedTotal caps how much MORE can be requested (blocks over-requesting
 * even before Finance approves anything); paidTotal drives the actual
 * Unpaid/Partially Paid/Paid status shown to users.
 */
export function summarizePOPayments(grandTotal: number, paymentRequests: POPaymentRecord[], reimbursements: POPaymentRecord[]) {
  // A REJECTED request never moved money and was never PAID — treat it as void rather
  // than counting its amount against requestedTotal/remaining, otherwise a rejected
  // installment would permanently eat into the PO's remaining balance and keep
  // paymentStatus stuck on PENDING forever.
  const all = [...paymentRequests, ...reimbursements].filter(p => p.status !== 'REJECTED')
  const requestedTotal = all.reduce((s, p) => s + p.amount, 0)
  const paidTotal = all.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, grandTotal - requestedTotal)
  // A request/reimbursement can sit PENDING (submitted, awaiting Finance approval) before
  // anything is actually PAID — that's distinct from UNPAID (nothing submitted at all yet).
  // Checked FIRST, ahead of the PAID branch: a PO that was already fully paid off still needs
  // to show as "Waiting for Payment" the moment a fresh request/reimbursement (e.g. a delivery
  // fee top-up) comes in — otherwise a prior paidTotal >= grandTotal keeps it stuck on PAID
  // forever and the new pending request never surfaces.
  const hasPendingRequest = all.some(p => p.status !== 'PAID')
  const paymentStatus =
    hasPendingRequest ? 'PENDING' :
    paidTotal > 0 && paidTotal >= grandTotal ? 'PAID' :
    paidTotal > 0 ? 'PARTIALLY_PAID' :
    'UNPAID'
  return { requestedTotal, paidTotal, remaining, paymentStatus }
}

/** Label for Finance-facing notifications/UI: is this a first DP, a top-up, or the one that settles the PO? */
export function describeInstallment(grandTotal: number, requestedBefore: number, amount: number): string {
  const isFirst = requestedBefore <= 0
  const completesTotal = requestedBefore + amount >= grandTotal
  if (isFirst) return completesTotal ? 'Full Payment' : 'Down Payment'
  return completesTotal ? 'Final Payment' : 'Additional Payment'
}

/**
 * Sorts a PO's payment requests + reimbursements chronologically and labels each one
 * (Down Payment / Additional Payment / Final Payment / Full Payment) via
 * describeInstallment, run cumulatively — same ordering src/lib/purchasing/poTimelineSteps.ts
 * uses to build the PO timeline. Lets a caller showing one installment (e.g. a "Balance
 * Payment" detail screen) look up which earlier installment was the DP and what was still
 * owed before this one.
 */
export function labelInstallments<T extends { id: string; amount: number; createdAt: string | Date; status: string }>(
  grandTotal: number,
  allInstallments: T[],
): (T & { label: string })[] {
  // Same reasoning as summarizePOPayments above: a REJECTED installment never
  // happened financially, so it's excluded from the cumulative running total that
  // decides whether the next one is a Down Payment vs. an Additional/Final Payment.
  const sorted = [...allInstallments].filter(i => i.status !== 'REJECTED').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  let cumulative = 0
  return sorted.map(inst => {
    const label = describeInstallment(grandTotal, cumulative, inst.amount)
    cumulative += inst.amount
    return { ...inst, label }
  })
}
