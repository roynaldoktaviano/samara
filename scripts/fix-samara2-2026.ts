/**
 * Corrective follow-up after reconciling "Open Invoice and Booking List Trip 2026 - SAMARA 2.csv"
 * against the database: adds 3 bookings missing entirely, and fixes one booking with a
 * wrong month (Valentina Toro entered as May instead of March).
 *
 * Field conventions (totalPrice = Publish + TNK gross, depositPaid = literal DP/2nd-DP
 * column, guestCount = 1 with a single lead guest, destinationId set to Komodo National
 * Park) were reverse-engineered from the 31 pre-existing Samara II bookings already in
 * the DB, cross-checked against this same CSV, to stay consistent with how staff already
 * entered this yacht's data — not copied from the Samara I convention.
 *
 * Safety: runs inside a single transaction — any failure rolls back everything.
 * Run: npx tsx scripts/fix-samara2-2026.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const YACHT_NAME = 'Samara II'
const CODE_PREFIX_PC = 'SL2-PC-'
const KOMODO_DESTINATION_ID = 'cmrcwon2i0002oekw494afgx1'

type NewBooking = {
  guest: string
  agent: string // resolved DB agent name
  sales: string
  start: string
  end: string
  total: number
  dep: number
  status: 'fully_paid' | 'partially_paid' | 'cancelled'
  notes?: string
  cancelReason?: string
}

const NEW_BOOKINGS: NewBooking[] = [
  {
    guest: 'Peter Bosma', agent: 'Oceanic Escape', sales: 'Dwi',
    start: '2026-01-27', end: '2026-01-30', total: 13500, dep: 10800, status: 'cancelled',
    cancelReason: 'Trip cancelled — payment non-refundable, agent keeps 20% commission (per original booking notes)',
  },
  {
    guest: 'Naomi Bierman', agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi',
    start: '2026-04-21', end: '2026-04-24', total: 13875, dep: 3113, status: 'fully_paid',
    notes: 'Transfer to DBS Hongkong (Trip) / TNK Transfer to Agency',
  },
  {
    guest: 'Rob Hamilton', agent: 'Oceanic Escape', sales: 'Dwi',
    start: '2026-08-11', end: '2026-08-13', total: 9000, dep: 2700, status: 'partially_paid',
    notes: 'Keep Commission 20% for Agent',
  },
]

async function nextVal(tx: any, key: string): Promise<number> {
  const result = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value
  `
  return Number(result[0].value)
}
async function generateBookingCode(tx: any, prefix: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const num = await nextVal(tx, `booking:${prefix}`)
    const code = `${prefix}${String(num).padStart(4, '0')}`
    if (!(await tx.booking.findUnique({ where: { bookingCode: code }, select: { id: true } }))) return code
  }
  throw new Error(`Failed to generate unique booking code for prefix ${prefix}`)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const run = async (tx: any) => {
    const yacht = await tx.yacht.findFirst({ where: { name: YACHT_NAME } })
    if (!yacht) throw new Error(`Yacht "${YACHT_NAME}" not found`)

    const salesUsers = await tx.user.findMany({ where: { name: { in: ['Dwi'] } } })
    const dwi = salesUsers.find((u: any) => u.name === 'Dwi')
    if (!dwi) throw new Error('Sales user "Dwi" not found')

    // ── 1. Fix Valentina Toro's date (May → March) ──
    const vt = await tx.booking.findUnique({ where: { bookingCode: 'SL2-PC-0034' }, include: { customer: true } })
    if (!vt) throw new Error('SL2-PC-0034 (Valentina Toro) not found')
    if (vt.customer.name !== 'Valentina Toro') throw new Error(`SL2-PC-0034 is not Valentina Toro (found "${vt.customer.name}") — aborting`)
    const gotStart = vt.startDate.toISOString().slice(0, 10)
    if (gotStart === '2026-05-28') {
      await tx.booking.update({ where: { id: vt.id }, data: { startDate: new Date('2026-03-28'), endDate: new Date('2026-03-30') } })
      console.log('[fix] SL2-PC-0034 Valentina Toro: date corrected 2026-05-28→30 to 2026-03-28→30')
    } else {
      console.warn(`[fix] SL2-PC-0034 startDate is already ${gotStart}, not 2026-05-28 — skipping (already fixed?)`)
    }

    // ── 2. Add the 3 missing bookings ──
    for (const b of NEW_BOOKINGS) {
      const already = await tx.booking.findFirst({
        where: { yachtId: yacht.id, startDate: new Date(b.start), endDate: new Date(b.end), customer: { name: b.guest } },
      })
      if (already) { console.warn(`[add] ${b.guest} (${b.start}) already exists as ${already.bookingCode} — skipping`); continue }

      const agent = await tx.agent.findFirst({ where: { name: b.agent } })
      if (!agent) throw new Error(`Expected existing agent "${b.agent}" not found`)

      const customer = await tx.customer.findFirst({ where: { name: b.guest, deletedAt: null } })
        ?? await tx.customer.create({ data: { name: b.guest } })

      const bookingCode = await generateBookingCode(tx, CODE_PREFIX_PC)
      const booking = await tx.booking.create({
        data: {
          bookingCode,
          customerId: customer.id,
          agentId: agent.id,
          source: 'AGENT',
          tripType: 'PRIVATE_CHARTER',
          yachtId: yacht.id,
          startDate: new Date(b.start),
          endDate: new Date(b.end),
          destination: 'Komodo National Park',
          destinationId: KOMODO_DESTINATION_ID,
          status: b.status,
          totalPrice: b.total,
          depositPaid: b.dep,
          guestCount: 1,
          notes: b.notes ?? null,
          cancelReason: b.cancelReason ?? null,
          currency: 'USD',
          salesperson: dwi.name,
          salespersonId: dwi.id,
          guests: { create: [{ customerId: customer.id, isLead: true }] },
        },
        select: { bookingCode: true },
      })
      console.log(`[add] ${booking.bookingCode} — ${b.guest} (${b.start}→${b.end}, $${b.total}, ${b.status})`)
    }
  }

  if (dryRun) {
    console.log('--- DRY RUN: rolling back after planning, nothing persisted ---')
    await db.$transaction(async (tx) => {
      await run(tx)
      throw new Error('__DRY_RUN_ROLLBACK__')
    }, { timeout: 60_000 }).catch(e => { if (e.message !== '__DRY_RUN_ROLLBACK__') throw e })
    console.log('(dry run — nothing was written)')
  } else {
    await db.$transaction(run, { timeout: 60_000 })
    console.log('\nDone.')
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
