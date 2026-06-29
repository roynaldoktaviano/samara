/**
 * One-time migration: move ActivityLog + Notification records from Samara DB
 * to Siloina DB for all users that belong to the Siloina tenant.
 *
 * Run: npx tsx scripts/migrate-siloina-logs.ts
 *
 * Safe to re-run — uses skipDuplicates so existing records are not doubled.
 * Deletes from Samara ONLY after successful insert into Siloina.
 */

import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function main() {
  const centralDb = new CentralClient({
    datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } },
  })

  const samaraDb = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  })

  // ── 1. Find Siloina tenant ─────────────────────────────────────────────────
  const siloina = await centralDb.tenant.findUnique({
    where: { slug: 'siloina' },
    select: { id: true, name: true, databaseUrl: true },
  })
  if (!siloina) throw new Error('Siloina tenant not found in central DB (slug="siloina")')
  console.log(`Tenant: ${siloina.name} (id=${siloina.id})`)

  const siloinaDb = new PrismaClient({
    datasources: { db: { url: siloina.databaseUrl } },
  })

  // ── 2. Get Siloina user emails from central DB ─────────────────────────────
  const userTenants = await centralDb.userTenant.findMany({
    where: { tenantId: siloina.id },
    include: { user: { select: { email: true } } },
  })
  const siloinaEmails = userTenants.map(ut => ut.user.email)
  console.log(`Siloina users in central DB: ${siloinaEmails.length}`)
  siloinaEmails.forEach(e => console.log(`  ${e}`))

  if (siloinaEmails.length === 0) {
    console.log('No Siloina users found. Done.')
    return
  }

  // ── 3. Get Siloina user IDs directly from Siloina DB ─────────────────────
  // Siloina users were never in Samara DB — they only exist in Siloina DB.
  // Activity logs written to Samara DB use the Siloina DB user IDs as userId.
  const siloinaUsers = await siloinaDb.user.findMany({
    where: { email: { in: siloinaEmails } },
    select: { id: true, email: true },
  })
  const siloinaUserIds = siloinaUsers.map(u => u.id)
  console.log(`\nUsers found in Siloina DB: ${siloinaUsers.length}`)
  siloinaUsers.forEach(u => console.log(`  ${u.email} → siloina_id=${u.id}`))

  if (siloinaUserIds.length === 0) {
    console.log('No Siloina users found in Siloina DB. Nothing to migrate.')
    return
  }

  // ── 4. Migrate ActivityLog ─────────────────────────────────────────────────
  const activityLogs = await samaraDb.activityLog.findMany({
    where: { userId: { in: siloinaUserIds } },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\nActivityLog: ${activityLogs.length} records found in Samara DB`)

  if (activityLogs.length > 0) {
    const inserted = await siloinaDb.activityLog.createMany({
      data: activityLogs,
      skipDuplicates: true,
    })
    console.log(`  ✓ Inserted ${inserted.count} into Siloina DB`)

    const deleted = await samaraDb.activityLog.deleteMany({
      where: { id: { in: activityLogs.map(l => l.id) } },
    })
    console.log(`  ✓ Deleted ${deleted.count} from Samara DB`)
  }

  // ── 5. Migrate Notification ────────────────────────────────────────────────
  const notifications = await samaraDb.notification.findMany({
    where: { userId: { in: siloinaUserIds } },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\nNotification: ${notifications.length} records found in Samara DB`)

  if (notifications.length > 0) {
    // Notifications have FK on bookingId / paymentId.
    // The IDs reference Siloina's tables — verify they exist before inserting.
    const bookingIds = Array.from(new Set(notifications.flatMap(n => n.bookingId ? [n.bookingId] : [])))
    const paymentIds = Array.from(new Set(notifications.flatMap(n => n.paymentId ? [n.paymentId] : [])))

    const existingBookings = new Set(
      bookingIds.length
        ? (await siloinaDb.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true } })).map(b => b.id)
        : []
    )
    const existingPayments = new Set(
      paymentIds.length
        ? (await siloinaDb.payment.findMany({ where: { id: { in: paymentIds } }, select: { id: true } })).map(p => p.id)
        : []
    )

    const data = notifications.map(n => ({
      ...n,
      // Null out FK if the referenced record doesn't exist in Siloina's DB
      bookingId: n.bookingId != null && existingBookings.has(n.bookingId) ? n.bookingId : null,
      paymentId: n.paymentId != null && existingPayments.has(n.paymentId) ? n.paymentId : null,
    }))

    const nulledBookings = data.filter(n => n.bookingId === null && notifications.find(o => o.id === n.id)?.bookingId).length
    const nulledPayments = data.filter(n => n.paymentId === null && notifications.find(o => o.id === n.id)?.paymentId).length
    if (nulledBookings) console.log(`  ⚠ ${nulledBookings} notifications had bookingId not found in Siloina — set to null`)
    if (nulledPayments) console.log(`  ⚠ ${nulledPayments} notifications had paymentId not found in Siloina — set to null`)

    const inserted = await siloinaDb.notification.createMany({
      data,
      skipDuplicates: true,
    })
    console.log(`  ✓ Inserted ${inserted.count} into Siloina DB`)

    const deleted = await samaraDb.notification.deleteMany({
      where: { id: { in: notifications.map(n => n.id) } },
    })
    console.log(`  ✓ Deleted ${deleted.count} from Samara DB`)
  }

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  console.log('\n✓ Migration complete.')

  await Promise.all([
    centralDb.$disconnect(),
    samaraDb.$disconnect(),
    siloinaDb.$disconnect(),
  ])
}

main().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})
