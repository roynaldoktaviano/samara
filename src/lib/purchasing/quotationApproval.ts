import type { PrismaClient } from '@prisma/client'
import { getBand } from '@/lib/purchasing/quotationBands'

/**
 * Resolves who should approve a Purchasing staffer's supplier selection: the staffer's
 * own manager (Employee.managerId chain, via Employee.userId → ... → manager.userId),
 * mirroring the requester-approval routing in src/app/api/hr/request-orders/route.ts.
 * Falls back to any SUPER_ADMIN when the org chart can't resolve a login-having manager
 * (missing Employee record, no manager set, or the manager has no ERP login) — approval
 * is a hard gate here (unlike PR intake, which can fall back to skipping approval
 * entirely), so submission must always land on *someone* who can act on it.
 */
export async function resolveQuotationApproverId(db: PrismaClient, submitterUserId: string): Promise<string | null> {
  const submitter = await db.employee.findUnique({ where: { userId: submitterUserId }, select: { managerId: true } })
  if (submitter?.managerId) {
    const manager = await db.employee.findUnique({ where: { id: submitter.managerId }, select: { userId: true } })
    if (manager?.userId) return manager.userId
  }
  const superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  return superAdmin?.id ?? null
}

/**
 * Whether an item's supplier pick needs the quotation-approval gate at all — band A is
 * always exempt (no quotations required in the first place), and any band picks a
 * supplier who has previously fulfilled this exact item (any past PO) are exempt too,
 * per the "known history" rule: price naturally fluctuates and stays exempt, but picking
 * a supplier who's never supplied this item before is a fresh sourcing decision and
 * needs quotations + sign-off like any other new item.
 */
export async function itemRequiresQuotationApproval(
  db: PrismaClient,
  item: { itemId: string | null; itemName: string; quantity: number; estimatedCost: number; supplierId: string | null },
): Promise<boolean> {
  const band = getBand(item.estimatedCost)
  if (band === 'A') return false
  if (!item.supplierId) return true
  const historicalOrder = await db.purchaseOrderItem.findFirst({
    where: {
      ...(item.itemId ? { itemId: item.itemId } : { itemName: { equals: item.itemName, mode: 'insensitive' } }),
      order: { supplierId: item.supplierId },
    },
    select: { id: true },
  })
  return !historicalOrder
}

// Resets every quotation-approval field back to untouched — spread into an update's
// `data` (or used via updateMany below) whenever the thing that was approved changes
// (chosen supplier, estimated price, or the quotation list itself), so an approval can
// never silently keep covering a decision that's since been edited.
export const CLEARED_QUOTATION_APPROVAL_FIELDS = {
  quotationSubmittedById: null,
  quotationApproverId: null,
  quotationSubmittedAt: null,
  quotationApprovedById: null,
  quotationApprovedAt: null,
  quotationRejectedById: null,
  quotationRejectedAt: null,
  quotationRejectionReason: null,
} as const

/** Same as CLEARED_QUOTATION_APPROVAL_FIELDS, for callers that don't already have the
 *  item loaded (and so can't cheaply inline the clear into their own update call). */
export async function invalidateQuotationApproval(db: PrismaClient, requestItemId: string): Promise<void> {
  await db.purchaseRequestItem.updateMany({
    where: { id: requestItemId, quotationSubmittedAt: { not: null } },
    data: CLEARED_QUOTATION_APPROVAL_FIELDS,
  })
}
