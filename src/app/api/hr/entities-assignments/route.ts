import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Cross-tab of "who's legally employed under which PT" (legalEntityId) vs. "assigned to
// operate where" (locationId) — the two dimensions already exist on Employee but never
// had a dedicated view showing them together, so a mismatch (e.g. crew legally under one
// PT but working a different vessel/site) is otherwise invisible without opening every
// employee record individually.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [employees, legalEntities, locations] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true },
      select: {
        id: true, fullName: true, employeeNumber: true, department: true,
        legalEntity: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        role: { select: { title: true } },
      },
    }),
    db.legalEntity.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    db.employeeWorkLocation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ])

  const entityRows = [...legalEntities.map(e => e.name), 'Unassigned']
  const locationCols = [...locations.map(l => l.name), 'Unassigned']

  const cellKey = (entity: string, loc: string) => `${entity}::${loc}`
  const cells = new Map<string, typeof employees>()
  for (const e of employees) {
    const entity = e.legalEntity?.name ?? 'Unassigned'
    const loc = e.location?.name ?? 'Unassigned'
    const key = cellKey(entity, loc)
    const arr = cells.get(key) ?? []
    arr.push(e)
    cells.set(key, arr)
  }

  const matrix = entityRows.map(entity => ({
    entity,
    cols: locationCols.map(loc => {
      const emps = cells.get(cellKey(entity, loc)) ?? []
      return {
        location: loc,
        count: emps.length,
        employees: emps.map(e => ({ id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber, department: e.department, role: e.role?.title ?? null })),
      }
    }),
  }))

  return NextResponse.json({
    entityRows, locationCols, matrix, totalEmployees: employees.length,
    // Lets the frontend open the Legal Documents panel for a clicked entity row — the
    // matrix itself only carries entity *names* (used as its grouping key), so this is
    // the name→id lookup needed to actually navigate.
    entities: legalEntities.map(e => ({ id: e.id, name: e.name })),
  })
}
