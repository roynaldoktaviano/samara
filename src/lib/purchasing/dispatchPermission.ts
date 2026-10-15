import type { PrismaClient } from '@prisma/client'
import { roleMatches } from '@/lib/role-utils'
import { resolveAssignedYachtId } from '@/lib/purchasing/yachtScope'

// Only the team physically responsible for a transfer's SOURCE location may dispatch it;
// everyone else who can open the transfer only sees its items and progress:
// - a yacht's location (the vessel, its Bar/Galley) → that yacht's Cruise Director
// - a location managed by Purchasing (Office Bali, Bali storages) → Purchasing
// - anything else (Gudang Labuan Bajo, …) → Warehouse
// ADMIN/SUPER_ADMIN keep an override so a transfer is never stuck when that person is away.
export type DispatchOwner = 'CRUISE_DIRECTOR' | 'PURCHASING' | 'WAREHOUSE'

export const DISPATCH_OWNER_LABEL: Record<DispatchOwner, string> = {
  CRUISE_DIRECTOR: 'Cruise Director',
  PURCHASING: 'Purchasing',
  WAREHOUSE: 'Warehouse',
}

export function dispatchOwnerOf(loc: { yachtId: string | null; managedBy: string }): DispatchOwner {
  if (loc.yachtId) return 'CRUISE_DIRECTOR'
  return loc.managedBy === 'PURCHASING' ? 'PURCHASING' : 'WAREHOUSE'
}

export async function canDispatchFrom(
  db: Pick<PrismaClient, 'stockLocation' | 'user'>,
  locationId: string,
  user: { id: string; role: string },
): Promise<{ allowed: boolean; owner: DispatchOwner }> {
  const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { yachtId: true, managedBy: true } })
  const owner = loc ? dispatchOwnerOf(loc) : 'WAREHOUSE'
  if (roleMatches(user.role, ['ADMIN', 'SUPER_ADMIN'])) return { allowed: true, owner }
  if (!loc) return { allowed: false, owner }
  if (owner === 'CRUISE_DIRECTOR') {
    const allowed = user.role === 'CRUISE_DIRECTOR' && (await resolveAssignedYachtId(db as PrismaClient, user.id)) === loc.yachtId
    return { allowed, owner }
  }
  return { allowed: roleMatches(user.role, [owner]), owner }
}
