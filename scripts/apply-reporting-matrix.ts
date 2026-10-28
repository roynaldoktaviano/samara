/**
 * One-off: sets Employee.managerId from "Samara Group 2026 - Matrix Approval" (Oct 2026).
 * Keyed by employeeNumber. Sheet rows that reported to themselves (SM1 crew, Febrianus) are
 * resolved via the reporting Title column; Rosalina's dual line (Marc/Pantun) uses Pantun.
 * Employees not in the sheet are left untouched.
 *
 * Run:  npx tsx scripts/apply-reporting-matrix.ts            (dry run)
 *       npx tsx scripts/apply-reporting-matrix.ts --apply    (writes)
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const APPLY = process.argv.includes('--apply')

const MARC = 'SYA01'
const PANTUN = 'SYM B - 09'
const ROSALINA = 'SYM B - 02'
const MERYL = 'SYM B - 10'
const JAY = 'SYM B - 05'
const GUNGWA = 'SYM B - 06'
const EMAN = 'SWB - 01'
const WILL = 'SYM 01 - 01'
const GONSI = 'SYM 01 - 04'
const STEFANUS = 'SYM 02 - 01'
const DAVID = 'SWB MC - 01'
const IRSAN = 'SWB MC - 02'
const FERDI = 'SWB MC - 08'
const ANDI_BAHAR = 'SYM OT - 01'
const TAUFIQ = 'SYM OT - 04'
const VIKIH = 'SYM OT - 11'

// [employee, manager]
const MATRIX: [string, string][] = [
  // Operational
  [EMAN, MARC],
  ['SWB - 02', EMAN], // Noni
  // Finance
  [PANTUN, MARC],
  ['SWB - 03', PANTUN], // Galuh
  ['SYA02', PANTUN], // Agnes
  // Human resources
  [ROSALINA, PANTUN],
  ['SYM B - 03', PANTUN], // Corry
  ['SYM B - 04', ROSALINA], // Ferroz
  // Sales
  ['SYA03', MARC], ['SYA04', MARC], ['SYA05', MARC], ['SYA06', MARC], ['SYA07', MARC], ['SYA08', MARC],
  // Marketing
  [JAY, MERYL],
  [GUNGWA, MERYL],
  ['SYM B - 07', GUNGWA], // Osa
  ['SYM B - 08', JAY], // Roy
  [MERYL, MARC],
  // Samara 1
  [WILL, MARC],
  ['SYM 01 - 02', WILL], ['SYM 01 - 03', WILL], [GONSI, WILL],
  ['SYM 01 - 05', GONSI], // Oswaldus
  ['SYM 01 - 06', WILL], ['SYM 01 - 07', WILL], ['SYM 01 - 08', WILL],
  // Samara 2
  [STEFANUS, MARC],
  ['SYM 02 - 02', STEFANUS], ['SYM 02 - 03', STEFANUS], ['SYM 02 - 04', STEFANUS],
  ['SYM 02 - 05', STEFANUS], ['SYM 02 - 06', STEFANUS],
  // Mischief
  [DAVID, MARC],
  [IRSAN, DAVID],
  ['SWB MC - 03', IRSAN], ['SWB MC - 04', IRSAN], ['SWB MC - 05', IRSAN], ['SWB MC - 06', IRSAN],
  ['SWB MC - 07', IRSAN], ['SWB MC - 09', IRSAN], [FERDI, IRSAN], ['SWB MC - 11', IRSAN],
  ['SWB MC - 10', FERDI], // Febrianus
  // Otium
  [ANDI_BAHAR, MARC],
  ['SYM OT - 02', ANDI_BAHAR], ['SYM OT - 03', ANDI_BAHAR], [TAUFIQ, ANDI_BAHAR],
  ['SYM OT - 05', TAUFIQ], // Arman
  ['SYM OT - 08', ANDI_BAHAR], ['SYM OT - 07', ANDI_BAHAR], ['SYM OT - 09', ANDI_BAHAR], ['SYM OT - 10', ANDI_BAHAR],
  [VIKIH, ANDI_BAHAR],
  ['SYM OT - 12', VIKIH], // Andi Arsandi
  ['SYM OT - 17', ANDI_BAHAR], ['SYM OT - 14', ANDI_BAHAR], ['SYM OT - 20', ANDI_BAHAR], ['SYM OT - 13', ANDI_BAHAR],
]

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: 'samara' }, select: { databaseUrl: true } })
  const db = new PrismaClient({ datasources: { db: { url: tenant!.databaseUrl } } })

  const all = await db.employee.findMany({ select: { id: true, employeeNumber: true, fullName: true, managerId: true } })
  const byNo = new Map(all.map(e => [e.employeeNumber, e]))
  const byId = new Map(all.map(e => [e.id, e]))

  let changed = 0
  for (const [empNo, mgrNo] of MATRIX) {
    const emp = byNo.get(empNo), mgr = byNo.get(mgrNo)
    if (!emp || !mgr) throw new Error(`Missing employee ${!emp ? empNo : mgrNo}`)
    if (emp.managerId === mgr.id) continue
    changed++
    console.log(`${emp.fullName}: ${emp.managerId ? byId.get(emp.managerId)?.fullName : '-'} → ${mgr.fullName}`)
    if (APPLY) await db.employee.update({ where: { id: emp.id }, data: { managerId: mgr.id } })
  }
  console.log(`\n${changed} change(s)${APPLY ? ' applied' : ' (dry run)'}`)
  await db.$disconnect()
  await central.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
