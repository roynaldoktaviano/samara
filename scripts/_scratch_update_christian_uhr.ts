/**
 * OT-PC-0014 (Christian Uhr): swap trip from Private Charter Raja Ampat 6D5N – Otium (3–8 Jan 2027)
 * to Private Charter Komodo-Sumbawa 9D8N – Mischief (22–30 Aug 2027).
 * Customer, booking code, and confirmed DP payment (INV-OT-PC-0014-01, USD 21,000) are untouched.
 *
 * Run: npx tsx scripts/_scratch_update_christian_uhr.ts            (dry-run, rolls back)
 *      npx tsx scripts/_scratch_update_christian_uhr.ts --apply    (commit)
 */
import { PrismaClient } from '@prisma/client'
import { renumberTripYear } from '../src/lib/openTripNumbering'

const db = new PrismaClient()
const BOOKING_ID = 'cmsfvm0n0005qqpm15j68y68x'
const MISCHIEF = 'cmpdh6a430012oejj0cvknldm'
const SUMBAWA = 'cmrcyc6jf000noekwlzz8x5av'

const NIGHTS = 8, RATE = 8500, RELOCATION = 4250
const TOTAL = NIGHTS * RATE + RELOCATION // 72,250

async function main() {
  const apply = process.argv.includes('--apply')
  const ROLLBACK = new Error('dry-run rollback')

  try {
    await db.$transaction(async tx => {
      const before = await tx.booking.findUniqueOrThrow({ where: { id: BOOKING_ID }, include: { services: true, customer: { select: { name: true } }, yacht: { select: { name: true } } } })
      if (before.bookingCode !== 'OT-PC-0014' || before.customer.name !== 'Christian Uhr') throw new Error('Unexpected booking')

      const start = new Date('2027-08-22'), end = new Date('2027-08-30')
      const clash = await tx.booking.findFirst({ where: { id: { not: BOOKING_ID }, yachtId: MISCHIEF, status: { not: 'cancelled' }, startDate: { lt: end }, endDate: { gt: start } }, select: { bookingCode: true } })
      if (clash) throw new Error(`Mischief clash with ${clash.bookingCode}`)

      const updated = await tx.booking.update({
        where: { id: BOOKING_ID },
        data: {
          yachtId: MISCHIEF,
          startDate: start,
          endDate: end,
          destination: 'Sumbawa',
          destinationId: SUMBAWA,
          guestCount: 5,
          totalPrice: TOTAL,
          finalDueDate: new Date('2027-07-22'),
          notes: 'Package: Private Charter Komodo-Sumbawa 9D8N – Mischief, ISO Private Charter Raja Ampat 6D5N – Otium (3–8 Jan 2027). Rate USD 8,500/night x 8 nights + Relocation Fee USD 4,250. Source: WhatsApp (repeater guest). Food allergy/dietary: TBA.',
          status: before.depositPaid >= TOTAL ? 'fully_paid' : before.depositPaid > 0 ? 'partially_paid' : 'pending',
        },
      })
      await tx.bookingService.deleteMany({ where: { bookingId: BOOKING_ID } })
      await tx.bookingService.create({ data: { bookingId: BOOKING_ID, name: 'Relocation Fee', price: RELOCATION, quantity: 1 } })

      await renumberTripYear(tx, before.yachtId!, before.endDate.getFullYear()) // Otium 2027
      await renumberTripYear(tx, MISCHIEF, 2027)

      const after = await tx.booking.findUniqueOrThrow({ where: { id: BOOKING_ID }, include: { services: true, yacht: { select: { name: true } } } })
      console.log('BEFORE', { yacht: before.yacht?.name, start: before.startDate, end: before.endDate, dest: before.destination, pax: before.guestCount, total: before.totalPrice, dp: before.depositPaid, status: before.status, tripNo: before.tripNumber, services: before.services })
      console.log('AFTER ', { yacht: after.yacht?.name, start: after.startDate, end: after.endDate, dest: after.destination, pax: after.guestCount, total: after.totalPrice, dp: after.depositPaid, balance: after.totalPrice - after.depositPaid, status: after.status, tripNo: after.tripNumber, finalDue: after.finalDueDate, services: after.services.map(s => `${s.name} ${s.price}`) })
      const mis = await tx.booking.findMany({ where: { yachtId: MISCHIEF, tripType: 'PRIVATE_CHARTER', endDate: { gte: new Date('2027-01-01'), lt: new Date('2028-01-01') }, status: { not: 'cancelled' } }, select: { bookingCode: true, tripNumber: true, startDate: true }, orderBy: { startDate: 'asc' } })
      console.log('Mischief 2027 PC numbering:', mis.map(m => `${m.bookingCode}#${m.tripNumber} ${m.startDate.toISOString().slice(0, 10)}`).join(', '))
      if (!apply) throw ROLLBACK
    })
    console.log('APPLIED ✔')
  } catch (e) {
    if (e === ROLLBACK) console.log('DRY-RUN only — rolled back. Re-run with --apply to commit.')
    else throw e
  }
}
main().finally(() => db.$disconnect())
