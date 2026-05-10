/**
 * Pre-migration cleanup: nullify/remove rows with orphaned FK references
 * before adding proper FK constraints to schema.
 * Run with: node scripts/pre-migrate.mjs
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function run() {
  console.log('Starting pre-migration cleanup...')

  // 1. Expense.yachtId → null when yacht no longer exists
  const expYacht = await db.$executeRawUnsafe(
    `UPDATE "Expense" SET "yachtId" = NULL WHERE "yachtId" IS NOT NULL AND "yachtId" NOT IN (SELECT id FROM "Yacht")`
  )
  console.log(`Expense.yachtId orphans nulled: ${expYacht}`)

  // 2. Expense.bookingId → null when booking no longer exists
  const expBooking = await db.$executeRawUnsafe(
    `UPDATE "Expense" SET "bookingId" = NULL WHERE "bookingId" IS NOT NULL AND "bookingId" NOT IN (SELECT id FROM "Booking")`
  )
  console.log(`Expense.bookingId orphans nulled: ${expBooking}`)

  // 3. Notification.paymentId → null when payment no longer exists
  const notifPayment = await db.$executeRawUnsafe(
    `UPDATE "Notification" SET "paymentId" = NULL WHERE "paymentId" IS NOT NULL AND "paymentId" NOT IN (SELECT id FROM "Payment")`
  )
  console.log(`Notification.paymentId orphans nulled: ${notifPayment}`)

  // 4. Notification.bookingId → null when booking no longer exists
  const notifBooking = await db.$executeRawUnsafe(
    `UPDATE "Notification" SET "bookingId" = NULL WHERE "bookingId" IS NOT NULL AND "bookingId" NOT IN (SELECT id FROM "Booking")`
  )
  console.log(`Notification.bookingId orphans nulled: ${notifBooking}`)

  // 5. Maintenance: delete records pointing to non-existent yachts (yachtId is NOT NULL)
  const maintDel = await db.$executeRawUnsafe(
    `DELETE FROM "Maintenance" WHERE "yachtId" NOT IN (SELECT id FROM "Yacht")`
  )
  console.log(`Maintenance orphan rows deleted: ${maintDel}`)

  console.log('Pre-migration cleanup complete.')
  await db.$disconnect()
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
