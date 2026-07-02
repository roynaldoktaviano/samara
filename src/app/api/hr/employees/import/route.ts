import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    rows.push(fields)
  }
  return rows
}

function col(headers: string[], ...names: string[]): number {
  const clean = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
  for (const name of names) {
    const idx = headers.findIndex(h => clean(h) === clean(name))
    if (idx >= 0) return idx
  }
  return -1
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'A CSV file is required' }, { status: 400 })

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length < 2) return NextResponse.json({ error: 'CSV file is empty or invalid' }, { status: 400 })

  const headers = rows[0]
  const iNumber = col(headers, 'Employee Number', 'employeeNumber')
  const iName   = col(headers, 'Full Name', 'fullName', 'name')
  const iEntity = col(headers, 'Legal Entity', 'legalEntity')
  const iLoc    = col(headers, 'Work Location', 'location')
  const iDept   = col(headers, 'Department', 'department')
  const iRole   = col(headers, 'Role', 'role')
  const iStatus = col(headers, 'Status', 'isActive')

  if (iName < 0) {
    return NextResponse.json({ error: 'Column "Full Name" is required in the CSV header' }, { status: 400 })
  }

  const [entities, locations, roles] = await Promise.all([
    db.legalEntity.findMany(),
    db.stockLocation.findMany(),
    db.employeeRole.findMany(),
  ])
  const findByName = <T extends { id: string; name?: string; title?: string }>(list: T[], value: string) => {
    const clean = value.trim().toLowerCase()
    return list.find(x => (x.name ?? x.title ?? '').trim().toLowerCase() === clean)
  }

  let imported = 0
  let updated = 0
  const errors: { row: number; sku: string; error: string }[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(r => !r)) continue

    const fullName = row[iName]?.trim()
    if (!fullName) {
      errors.push({ row: i + 1, sku: '—', error: 'Full Name is required' })
      continue
    }

    const employeeNumberRaw = (iNumber >= 0 ? row[iNumber] : '')?.trim()
    const legalEntityName   = (iEntity >= 0 ? row[iEntity] : '')?.trim()
    const locationName      = (iLoc >= 0    ? row[iLoc]    : '')?.trim()
    const department        = (iDept >= 0   ? row[iDept]   : '')?.trim()
    const roleTitle         = (iRole >= 0   ? row[iRole]   : '')?.trim()
    const statusRaw         = (iStatus >= 0 ? row[iStatus] : '')?.trim().toLowerCase()
    const isActive          = statusRaw ? !['inactive', 'no', 'false', '0'].includes(statusRaw) : true

    const legalEntityId = legalEntityName ? findByName(entities, legalEntityName)?.id ?? null : null
    const locationId    = locationName ? findByName(locations, locationName)?.id ?? null : null
    const roleId         = roleTitle ? findByName(roles, roleTitle)?.id ?? null : null

    try {
      let employeeNumber = employeeNumberRaw
      const existing = employeeNumber ? await db.employee.findUnique({ where: { employeeNumber } }) : null

      if (existing) {
        await db.employee.update({
          where: { employeeNumber },
          data: { fullName, department: department || null, legalEntityId, locationId, roleId, isActive, updatedAt: new Date() },
        })
        updated++
      } else {
        if (!employeeNumber) {
          const prefix = 'EMP-'
          const last = await db.employee.findFirst({ where: { employeeNumber: { startsWith: prefix } }, orderBy: { employeeNumber: 'desc' }, select: { employeeNumber: true } })
          const seq = last ? (parseInt(last.employeeNumber.slice(prefix.length)) || 0) + 1 : 1
          employeeNumber = `${prefix}${String(seq).padStart(4, '0')}`
        }
        await db.employee.create({
          data: { id: crypto.randomUUID(), employeeNumber, fullName, department: department || null, legalEntityId, locationId, roleId, isActive, updatedAt: new Date() },
        })
        imported++
      }
    } catch (e) {
      errors.push({ row: i + 1, sku: employeeNumberRaw || fullName, error: (e as Error).message })
    }
  }

  return NextResponse.json({ imported, updated, errors, total: imported + updated })
}
