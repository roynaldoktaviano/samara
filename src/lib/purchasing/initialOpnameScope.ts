import type { PrismaClient } from '@prisma/client'
import { roleMatches } from '@/lib/role-utils'

/**
 * Stock Opname Awal: a WAREHOUSE user may only set up warehouse (gudang) locations, never a
 * ship. Admin / Finance Director keep every location.
 */
export const isWarehouseOnly = (role: string) =>
  roleMatches(role, ['WAREHOUSE']) && !roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR'])

/** True when this initial opname (StockCount) is on a location the user may touch. */
export async function canUseInitialOpname(db: PrismaClient, role: string, stockCountId: string): Promise<boolean> {
  if (!isWarehouseOnly(role)) return true
  const count = await db.stockCount.findUnique({ where: { id: stockCountId }, select: { location: { select: { type: true } } } })
  return count?.location?.type === 'WAREHOUSE'
}
