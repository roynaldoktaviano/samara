/**
 * Corrective follow-up to backfill-samara1-open-trips-jan-jul-2026.ts, fixing 3 mistakes
 * the user caught after reviewing the import:
 *
 *  1. Sebastian (SL1-ST-0074, 8-10 Jan) actually booked 2 separate cabins (Kelor + Kanawa),
 *     not 2 pax crammed into Kelor alone.
 *  2. The script created brand-new OpenTrip records instead of reusing the pre-existing
 *     empty ones already on the calendar (created 2026-05-26) for the same months — result
 *     was duplicate markers on the calendar. This merges bookings onto the pre-existing
 *     OpenTrip (correcting its dates/title to the real historical dates) and deletes the
 *     duplicate this script created.
 *  3. Guest names like "Chloe Rageau & Carole Lucienne" are clearly two people, but were
 *     stored as one combined-name customer + one generic "TBD 1" placeholder. Splits each
 *     into two real customer records.
 *
 * Safety: runs inside a single transaction — any failure rolls back everything.
 * Run: npx tsx scripts/fix-samara1-open-trips-jan-jul-2026.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// [duplicate OpenTrip id (created by the backfill script), pre-existing empty OpenTrip id,
//  correct startDate, correct endDate, correct title]
const OPEN_TRIP_MERGES: [string, string, string, string, string][] = [
  ['cms8idw280002q09zjohcgkjc', 'cmplz4r770002l404eqmrkxax', '2026-01-08', '2026-01-10', 'Open Trip Komodo 3D2N - 01/2026'],
  ['cms8idx20000fq09zk27tlnvb', 'cmplz4rkg0004l404rqlqrjwb', '2026-03-14', '2026-03-17', 'Open Trip Komodo 4D3N - 03/2026'],
  ['cms8idyzy0015q09zsmhkp3gd', 'cmplz4rxi0006l40435wc0o2x', '2026-03-22', '2026-03-24', 'Open Trip Komodo 3D2N - 03/2026'],
  ['cms8ie069001lq09zb66bu11v', 'cmplz4sak0008l404mc1v1u38', '2026-03-26', '2026-03-29', 'Open Trip Komodo 4D3N - 03/2026'],
  ['cms8ie1rj0026q09zjvxwf46p', 'cmplz4snm000al404mcz5hfjk', '2026-03-31', '2026-04-02', 'Open Trip Komodo 3D2N - 03/2026'],
  ['cms8ie3sv002yq09z6y3jim3j', 'cmplz4t0n000cl404joa3142j', '2026-04-04', '2026-04-06', 'Open Trip Komodo 3D2N - 04/2026'],
  ['cms8ie5u4003sq09zztg8yhrj', 'cmplz4tdr000el404oladw5gy', '2026-04-09', '2026-04-11', 'Open Trip Komodo 3D2N - 04/2026'],
  ['cms8ie8yd004yq09za9qyly1v', 'cmplz4tqu000gl404a7cp2cfj', '2026-04-13', '2026-04-16', 'Open Trip Komodo 4D3N - 04/2026'],
  ['cms8iebcf005uq09zwxs1ot6m', 'cmplz4u3v000il404bcohwnbm', '2026-04-18', '2026-04-20', 'Open Trip Komodo 3D2N - 04/2026'],
  ['cms8iee7l006vq09zbwyxgwbt', 'cmplz4ugx000kl404cjihcx4j', '2026-04-22', '2026-04-25', 'Open Trip Komodo 4D3N - 04/2026'],
  ['cms8iefjn007eq09zvu40om37', 'cmplz4utz000ml404m988dty4', '2026-04-27', '2026-04-29', 'Open Trip Komodo 3D2N - 04/2026'],
  ['cms8iehfy0084q09zy7c29q9r', 'cmplz4v71000ol404r6cy0fb8', '2026-05-01', '2026-05-03', 'Open Trip Komodo 3D2N - 05/2026'],
  ['cms8ieipy008mq09zgffx0k81', 'cmplz4vk3000ql404jbvkvcy2', '2026-05-05', '2026-05-08', 'Open Trip Komodo 4D3N - 05/2026'],
  ['cms8ieklw009cq09z5eyzx8io', 'cmplz4vx4000sl4040q5zb1b0', '2026-05-10', '2026-05-13', 'Open Trip Komodo 4D3N - 05/2026'],
  ['cms8ieln3009qq09zw8ohzp01', 'cmplz4wa5000ul404xxhofrga', '2026-05-15', '2026-05-18', 'Open Trip Komodo 4D3N - 05/2026'],
  ['cms8ien7x00abq09zj9ztgjj4', 'cmplz4wn6000wl404wjshs346', '2026-05-21', '2026-05-24', 'Open Trip Komodo 4D3N - 05/2026'],
  ['cms8iero500c1q09zb0j80dqt', 'cmplz4xdk0010l404s460gy4q', '2026-06-02', '2026-06-05', 'Open Trip Komodo 4D3N - 06/2026'],
  ['cms8ieu3m00cyq09zl7n7r0jn', 'cmplz4xqm0012l404ogcrnuyz', '2026-06-09', '2026-06-12', 'Open Trip Komodo 4D3N - 06/2026'],
  ['cms8ieuwf00daq09zznsy0k0t', 'cmplz4y3o0014l404xf6ibtny', '2026-06-14', '2026-06-17', 'Open Trip Komodo 4D3N - 06/2026'],
  ['cms8iexea00e8q09z3vybwmqz', 'cmplz4ygr0016l4042q4x6ls9', '2026-06-19', '2026-06-23', 'Open Trip Komodo 5D4N - 06/2026'],
  ['cms8if3up00gtq09z3x3t82jd', 'cmplz4zx7001el4040kslg1ay', '2026-07-17', '2026-07-20', 'Open Trip Komodo 4D3N - 07/2026'],
  ['cms8if5zk00hnq09zhku1kp8q', 'cmplz50cu001gl404bcx2va8k', '2026-07-22', '2026-07-24', 'Open Trip Komodo 3D2N - 07/2026'],
]

// [bookingCode, combined name as currently stored, nameA (keeps lead customer), nameB (gets a new customer)]
const NAME_SPLITS: [string, string, string, string][] = [
  ['SL1-ST-0079', 'Mira & Nadim Tohme', 'Mira Tohme', 'Nadim Tohme'],
  ['SL1-ST-0084', 'Leonor Martinez & Alejandro Robles', 'Leonor Martinez', 'Alejandro Robles'],
  ['SL1-ST-0089', 'Nicola & William Lakeman', 'Nicola Lakeman', 'William Lakeman'],
  ['SL1-ST-0097', 'Marcel & Linda Heinze', 'Marcel Heinze', 'Linda Heinze'],
  ['SL1-ST-0098', 'James & Gillian James', 'James James', 'Gillian James'],
  ['SL1-ST-0102', 'Xindi Yu & Sissi Sun', 'Xindi Yu', 'Sissi Sun'],
  ['SL1-ST-0103', 'Sharon & Tom Hall', 'Sharon Hall', 'Tom Hall'],
  ['SL1-ST-0105', 'De Wilde Mariane & Bertossi Pascal', 'De Wilde Mariane', 'Bertossi Pascal'],
  ['SL1-ST-0121', 'Margaret and Timothy Rees', 'Margaret Rees', 'Timothy Rees'],
  ['SL1-ST-0129', 'Megan Johnson & Maya Rose', 'Megan Johnson', 'Maya Rose'],
  ['SL1-ST-0141', 'Chloe Rageau & Carole Lucienne', 'Chloe Rageau', 'Carole Lucienne'],
  ['SL1-PC-0009', 'Myriam & Bjoern Jost', 'Myriam Jost', 'Bjoern Jost'],
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const run = async (tx: any) => {
    // ── 1. Sebastian: move the 2nd guest from Kelor to Kanawa ──
    const seb = await tx.booking.findUnique({
      where: { bookingCode: 'SL1-ST-0074' },
      include: { guests: { include: { customer: true, cabin: true } } },
    })
    if (!seb) throw new Error('SL1-ST-0074 (Sebastian) not found')
    const nonLead = seb.guests.find((g: any) => !g.isLead)
    if (!nonLead) throw new Error('Sebastian booking has no non-lead guest to move')
    const kanawa = await tx.cabin.findFirst({ where: { yachtId: seb.yachtId, name: 'Kanawa Cabin' } })
    if (!kanawa) throw new Error('Kanawa Cabin not found')
    await tx.bookingGuest.update({ where: { id: nonLead.id }, data: { cabinId: kanawa.id } })
    console.log(`[fix 1] Sebastian: moved "${nonLead.customer.name}" from ${nonLead.cabin?.name} to Kanawa Cabin`)

    // ── 2. Merge duplicate OpenTrips into the pre-existing (calendar-template) ones ──
    for (const [dupId, keepId, start, end, title] of OPEN_TRIP_MERGES) {
      const dup = await tx.openTrip.findUnique({ where: { id: dupId }, select: { id: true, title: true } })
      const keep = await tx.openTrip.findUnique({ where: { id: keepId }, select: { id: true, _count: { select: { bookings: true } } } })
      if (!dup) { console.warn(`[fix 2] duplicate OpenTrip ${dupId} not found, skipping (already fixed?)`); continue }
      if (!keep) throw new Error(`Pre-existing OpenTrip ${keepId} not found`)
      const moved = await tx.booking.updateMany({ where: { openTripId: dupId }, data: { openTripId: keepId } })
      await tx.openTrip.update({
        where: { id: keepId },
        data: { startDate: new Date(start), endDate: new Date(end), title, status: 'open', closedReason: null },
      })
      await tx.openTrip.delete({ where: { id: dupId } })
      console.log(`[fix 2] merged "${dup.title}" (${dupId}) → ${keepId}: moved ${moved.count} booking(s), dates set to ${start}→${end}`)
    }

    // ── 3. Split "Name A & Name B" guests into two real customers ──
    for (const [code, combined, nameA, nameB] of NAME_SPLITS) {
      const booking = await tx.booking.findUnique({
        where: { bookingCode: code },
        include: { customer: true, guests: { include: { customer: true } } },
      })
      if (!booking) throw new Error(`Booking ${code} not found`)
      if (booking.customer.name !== combined) {
        console.warn(`[fix 3] ${code}: expected lead name "${combined}", found "${booking.customer.name}" — skipping (already fixed?)`)
        continue
      }
      await tx.customer.update({ where: { id: booking.customerId }, data: { name: nameA } })

      const tbdName = `${combined} TBD 1`
      const tbdGuest = booking.guests.find((g: any) => g.customer.name === tbdName)
      if (!tbdGuest) { console.warn(`[fix 3] ${code}: no "${tbdName}" placeholder guest found — skipping name-B assignment`); continue }

      const existing = await tx.customer.findFirst({ where: { name: nameB, deletedAt: null } })
      const personB = existing ?? await tx.customer.create({ data: { name: nameB } })
      await tx.bookingGuest.update({ where: { id: tbdGuest.id }, data: { customerId: personB.id } })

      const stillUsed = await tx.bookingGuest.count({ where: { customerId: tbdGuest.customerId } })
      if (stillUsed === 0) await tx.customer.delete({ where: { id: tbdGuest.customerId } })

      console.log(`[fix 3] ${code}: "${combined}" → lead renamed to "${nameA}", 2nd guest renamed to "${nameB}"`)
    }
  }

  if (dryRun) {
    console.log('--- DRY RUN: rolling back after planning, nothing persisted ---')
    await db.$transaction(async (tx) => {
      await run(tx)
      throw new Error('__DRY_RUN_ROLLBACK__')
    }, { timeout: 120_000 }).catch(e => {
      if (e.message !== '__DRY_RUN_ROLLBACK__') throw e
    })
    console.log('(dry run — nothing was written)')
  } else {
    await db.$transaction(run, { timeout: 120_000 })
    console.log('\nDone.')
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
