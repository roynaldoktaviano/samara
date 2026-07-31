/**
 * Adds the 8 bookings from "Open Invoice and Booking List Trip 2026 - MISCHIEF.csv" that
 * were missing from the DB (15 of 23 CSV rows already existed before this script).
 *
 * Clawback handling (per explicit user instruction): only create an AgentClawbackEntry
 * deduction when the CSV's "Claw Back" column has a value for that row — do NOT apply the
 * system's automatic $1,000/night UIY×Mischief rate to every UIY booking. Two of the seven
 * UIY bookings here (Chais, Prashanth) have a blank Claw Back column and get no deduction.
 *
 * Safety: runs inside a single transaction — any failure rolls back everything.
 * Run: npx tsx scripts/fix-mischief-2026.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const YACHT_NAME = 'Mischief'
const CODE_PREFIX_PC = 'MC-PC-'
const KOMODO_DESTINATION_ID = 'cmrcwon2i0002oekw494afgx1'

type NewBooking = {
  guests: string[] // 1 name = single lead; 2 names = lead + 1 co-guest
  agent: string
  sales: string
  start: string
  end: string
  total: number
  clawback?: number // only set when CSV has an explicit Claw Back value
}

const NEW_BOOKINGS: NewBooking[] = [
  { guests: ['Dina Rothstein'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-03-30', end: '2026-04-04', total: 40000, clawback: 5000 },
  { guests: ['Wrenn Chais', 'Bill Chais'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-04-06', end: '2026-04-10', total: 26000 },
  { guests: ['Clement Genzmer', 'Katherine Solari'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-04-13', end: '2026-04-19', total: 51000, clawback: 6000 },
  { guests: ['Hector Sulaiman De La Rosa'], agent: 'Yacth Marketing Agency', sales: 'Efrinda', start: '2026-04-21', end: '2026-04-24', total: 21641.67 },
  { guests: ['Prashanth Jayaram'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-05-24', end: '2026-05-26', total: 13000 },
  { guests: ['Jordi Marti'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-05-27', end: '2026-06-03', total: 59500, clawback: 6000 },
  { guests: ['Jenna Yang'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-07-25', end: '2026-07-29', total: 34000, clawback: 4000 },
  { guests: ['Giligan'], agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', start: '2026-08-07', end: '2026-08-10', total: 25500, clawback: 3000 },
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

    let clawbackTotal = 0

    for (const b of NEW_BOOKINGS) {
      const leadName = b.guests[0]
      const already = await tx.booking.findFirst({
        where: { yachtId: yacht.id, startDate: new Date(b.start), endDate: new Date(b.end), customer: { name: leadName } },
      })
      if (already) { console.warn(`[skip] ${leadName} (${b.start}) already exists as ${already.bookingCode}`); continue }

      const agent = await tx.agent.findFirst({ where: { name: b.agent } })
      if (!agent) throw new Error(`Expected existing agent "${b.agent}" not found`)

      const lead = await tx.customer.findFirst({ where: { name: leadName, deletedAt: null } })
        ?? await tx.customer.create({ data: { name: leadName } })
      const guestRecords = [{ customerId: lead.id, isLead: true }]
      if (b.guests[1]) {
        const co = await tx.customer.findFirst({ where: { name: b.guests[1], deletedAt: null } })
          ?? await tx.customer.create({ data: { name: b.guests[1] } })
        guestRecords.push({ customerId: co.id, isLead: false })
      }

      const sales = await tx.user.findFirst({ where: { name: b.sales } })
      if (!sales) throw new Error(`Sales user "${b.sales}" not found`)

      const bookingCode = await generateBookingCode(tx, CODE_PREFIX_PC)
      const booking = await tx.booking.create({
        data: {
          bookingCode,
          customerId: lead.id,
          agentId: agent.id,
          source: 'AGENT',
          tripType: 'PRIVATE_CHARTER',
          yachtId: yacht.id,
          startDate: new Date(b.start),
          endDate: new Date(b.end),
          destination: 'Komodo National Park',
          destinationId: KOMODO_DESTINATION_ID,
          status: 'fully_paid',
          totalPrice: b.total,
          depositPaid: b.total,
          guestCount: guestRecords.length,
          currency: 'USD',
          salesperson: sales.name,
          salespersonId: sales.id,
          guests: { create: guestRecords },
        },
        select: { id: true, bookingCode: true },
      })
      console.log(`[add] ${booking.bookingCode} — ${b.guests.join(' & ')} (${b.start}→${b.end}, $${b.total})`)

      if (b.clawback) {
        await tx.agentClawbackEntry.create({
          data: {
            agentId: agent.id,
            bookingId: booking.id,
            amount: -b.clawback,
            note: `Clawback per CSV for booking ${booking.bookingCode} (${leadName})`,
          },
        })
        clawbackTotal += b.clawback
        console.log(`      clawback -$${b.clawback} applied`)
      }
    }

    if (clawbackTotal > 0) {
      const uiy = await tx.agent.findFirst({ where: { name: { contains: 'Ultimate Indonesia', mode: 'insensitive' } } })
      const sum = await tx.agentClawbackEntry.aggregate({ where: { agentId: uiy.id }, _sum: { amount: true } })
      console.log(`\nTotal clawback applied: $${clawbackTotal}. UIY balance now: $${sum._sum.amount}`)
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
