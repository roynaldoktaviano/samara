// Shared PO pricing/payment math — used by both the payment-request and
// reimbursement API routes (to cap a new request at the remaining balance)
// and the orders list/detail routes (to compute an aggregate payment status).
// No new columns: a PO can be paid across multiple installments (DP + final
// settlement, in any mix of Request Payment / Debit Paid / Reimburse) purely
// by allowing more than one POPaymentRequest/POReimbursement row per order —
// everything here is derived at read time from those existing rows.

export interface POPricingInput {
  items: { orderedQty: number; unitCost: number }[]
  discountType: string | null
  discountValue: number
  extraCharges: unknown
}

export function computePOGrandTotal(order: POPricingInput): number {
  const itemsSubtotal = order.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0)
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
  const all = [...paymentRequests, ...reimbursements]
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
