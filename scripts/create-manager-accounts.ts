/**
 * One-off (Oct 2026): login accounts for the reporting-matrix managers who had none, so PR /
 * quotation approvals route to them (see apply-reporting-matrix.ts). Captains get BOAT_CAPTAIN
 * scoped to their yacht; other line managers get CREW (approval is by Employee.managerId, not
 * role). Also links Meryl's existing account to her Employee row. Mirrors POST /api/users:
 * tenant User + central CentralUser/UserTenant + Employee.userId. Re-runnable.
 *
 * Run:  npx tsx scripts/create-manager-accounts.ts            (dry run)
 *       npx tsx scripts/create-manager-accounts.ts --apply    (writes)
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const APPLY = process.argv.includes('--apply')
const PASSWORD = 'samara123'

// [employeeNumber, email, display name, role, yacht name]
const ACCOUNTS: [string, string, string, Role, string | null][] = [
  ['SYM 01 - 01', 'wilhelmus@samarayachting.com', 'Captain Will', 'BOAT_CAPTAIN', 'Samara I'],
  ['SYM 02 - 01', 'stefanus@samarayachting.com', 'Captain Stefanus', 'BOAT_CAPTAIN', 'Samara II'],
  ['SWB MC - 02', 'irsan@samarayachting.com', 'Captain Irsan', 'BOAT_CAPTAIN', 'Mischief'],
  ['SYM OT - 01', 'andibahar@samarayachting.com', 'Captain Andi', 'BOAT_CAPTAIN', 'Otium'],
  ['SWB - 01', 'emanuel@samarayachting.com', 'Om Eman', 'CREW', null],
  ['SYM 01 - 04', 'gonsianus@samarayachting.com', 'Chef Gonsi', 'CREW', null],
  ['SWB MC - 08', 'ferdiansa@samarayachting.com', 'Chef Ferdi', 'CREW', null],
  ['SYM OT - 11', 'vikih@samarayachting.com', 'Chef Vikih', 'CREW', null],
  ['SYM OT - 04', 'taufiq@samarayachting.com', 'Taufiq', 'CREW', null],
]
const LINK_EXISTING: [string, string][] = [['SYM B - 10', 'meryl@samarayachting.com']]

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: 'samara' }, select: { id: true, databaseUrl: true } })
  const db = new PrismaClient({ datasources: { db: { url: tenant!.databaseUrl } } })
  const yachts = new Map((await db.yacht.findMany({ select: { id: true, name: true } })).map(y => [y.name, y.id]))
  const hashed = await bcrypt.hash(PASSWORD, 12)

  for (const [empNo, email, name, role, yacht] of ACCOUNTS) {
    const emp = await db.employee.findUnique({ where: { employeeNumber: empNo }, select: { id: true, fullName: true, userId: true } })
    if (!emp) throw new Error(`Missing employee ${empNo}`)
    const assignedYachtId = yacht ? yachts.get(yacht) : null
    if (yacht && !assignedYachtId) throw new Error(`Missing yacht ${yacht}`)
    if (emp.userId) { console.log(`skip ${emp.fullName}: already has a login`); continue }
    if (await db.user.findUnique({ where: { email } })) throw new Error(`Email taken: ${email}`)
    console.log(`create ${email} (${role}${yacht ? ` · ${yacht}` : ''}) → ${emp.fullName}`)
    if (!APPLY) continue
    const user = await db.user.create({ data: { email, name, password: hashed, role, assignedYachtId }, select: { id: true } })
    const cu = await central.centralUser.upsert({
      where: { email },
      update: { name, isActive: true },
      create: { email, name, isSuperAdmin: false },
    })
    await central.userTenant.upsert({
      where: { userId_tenantId: { userId: cu.id, tenantId: tenant!.id } },
      update: {},
      create: { userId: cu.id, tenantId: tenant!.id },
    })
    await db.employee.update({ where: { id: emp.id }, data: { userId: user.id } })
  }

  for (const [empNo, email] of LINK_EXISTING) {
    const emp = await db.employee.findUnique({ where: { employeeNumber: empNo }, select: { id: true, fullName: true, userId: true } })
    const user = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (!emp || !user) throw new Error(`Missing ${!emp ? empNo : email}`)
    if (emp.userId === user.id) continue
    console.log(`link ${email} → ${emp.fullName}`)
    if (APPLY) await db.employee.update({ where: { id: emp.id }, data: { userId: user.id } })
  }

  console.log(APPLY ? '\napplied' : '\n(dry run)')
  await db.$disconnect()
  await central.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
