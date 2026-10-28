import type { getDb } from '@/lib/get-db'

type Db = Awaited<ReturnType<typeof getDb>>

// The warehouse the WAREHOUSE role works from — its stock check on a ship PR always takes from
// here (no source to pick). Admins still choose freely. Matched by name; a tenant without it
// falls back to the normal pick-a-warehouse flow.
export const WAREHOUSE_HOME_NAME = 'Gudang Labuan Bajo'

export async function warehouseHomeLocationId(db: Pick<Db, 'stockLocation'>): Promise<string | null> {
  const loc = await db.stockLocation.findFirst({
    where: { name: { equals: WAREHOUSE_HOME_NAME, mode: 'insensitive' }, type: 'WAREHOUSE', isActive: true },
    select: { id: true },
  })
  return loc?.id ?? null
}
