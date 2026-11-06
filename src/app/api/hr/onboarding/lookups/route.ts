import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { ONBOARDING_HR_ROLES } from '@/lib/onboarding-hr'

// Light pick-lists for the Onboarding screens — /api/hr/employees would drag every
// employee's document data URLs along just to fill a "Reports To" dropdown.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ONBOARDING_HR_ROLES)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const [roles, locations, legalEntities, businessUnits, managers, yachts] = await Promise.all([
    db.employeeRole.findMany({ where: { isActive: true }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    db.employeeWorkLocation.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.legalEntity.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.businessUnit.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.employee.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
    db.yacht.findMany({ select: { name: true } }),
  ])
  // Lets the form tick "Crew" automatically when a yacht-named work location is picked.
  const yachtNames = new Set(yachts.map(y => y.name.trim().toLowerCase()))
  return NextResponse.json({
    roles, legalEntities, businessUnits, managers,
    locations: locations.map(l => ({ ...l, isYacht: yachtNames.has(l.name.trim().toLowerCase()) })),
  })
}
