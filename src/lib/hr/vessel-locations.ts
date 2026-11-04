import type { getDb } from '@/lib/get-db'

type Db = Awaited<ReturnType<typeof getDb>>

/**
 * Work locations that are vessels: an employee's work location name doubles as the name of
 * the yacht they're stationed on (same convention as matchEmployeesToYachts in lib/payroll.ts).
 * Vessel crew work to the trip schedule, not an office calendar — so they have no Attendance
 * Recap and national holidays never apply to them; both are office-only.
 */
export async function getVesselLocationIds(db: Db): Promise<Set<string>> {
  const [yachts, locations] = await Promise.all([
    db.yacht.findMany({ where: { deletedAt: null }, select: { name: true } }),
    db.employeeWorkLocation.findMany({ select: { id: true, name: true } }),
  ])
  const yachtNames = new Set(yachts.map(y => y.name.trim().toLowerCase()))
  return new Set(locations.filter(l => yachtNames.has(l.name.trim().toLowerCase())).map(l => l.id))
}
