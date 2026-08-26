/**
 * Backfills PayslipEntry.joinDateSnap / workLocationSnap for entries created before
 * those columns existed on the payroll "generate entries" path (they were added mid-
 * build, so a handful of already-generated entries have them null even though the
 * linked Employee record has real values). Additive only — only touches rows where
 * the snapshot is currently null, never overwrites an existing value.
 *
 * Run: npx tsx scripts/backfill-payslip-snapshot-fields.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const entries = await db.payslipEntry.findMany({
    where: { OR: [{ joinDateSnap: null }, { workLocationSnap: null }] },
    include: { employee: { select: { joinDate: true, location: { select: { name: true } } } } },
  })
  console.log(`Found ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} to backfill.`)

  for (const entry of entries) {
    await db.payslipEntry.update({
      where: { id: entry.id },
      data: {
        joinDateSnap: entry.joinDateSnap ?? entry.employee.joinDate,
        workLocationSnap: entry.workLocationSnap ?? entry.employee.location?.name ?? null,
      },
    })
    console.log(`  ✓ ${entry.fullNameSnap} (${entry.id})`)
  }

  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
