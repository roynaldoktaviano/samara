import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyPurchasingForRequest } from '@/lib/notify-purchasing'
import { sendPushToUsers } from '@/lib/push'

// PRs older than this and still un-verified get nagged...
const PR_STALE_AFTER_MS = 24 * 60 * 60 * 1000
// ...but re-nagged at most once per this window, so the 5-minute poll doesn't spam.
const PR_RENOTIFY_AFTER_MS = 20 * 60 * 60 * 1000

// Legal/compliance documents (NIB, licenses, vessel papers, …) start nagging this many
// days before expiryDate — renewals for these often take weeks, so the lead time is
// longer than the PR/deposit reminders above.
const DOC_WARNING_DAYS = 30
const DOC_RENOTIFY_AFTER_MS = 20 * 60 * 60 * 1000
const HR_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in2Days = new Date(today)
    in2Days.setDate(today.getDate() + 2)
    in2Days.setHours(23, 59, 59, 999)

    const bookings = await db.booking.findMany({
      where: { status: 'pending', depositDueDate: { gte: today, lte: in2Days } },
      select: {
        id: true,
        bookingCode: true,
        depositDueDate: true,
        salespersonId: true,
        customer: { select: { name: true } },
      },
    })

    // Build all notification records — only for the booking's salesperson
    const records: { userId: string; type: string; title: string; body: string; bookingId: string }[] = []

    for (const booking of bookings) {
      if (!booking.salespersonId) continue

      const dueDate = new Date(booking.depositDueDate!)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86400000)

      const type =
        daysUntil === 0 ? 'DEPOSIT_DUE_H0' :
        daysUntil === 1 ? 'DEPOSIT_DUE_H1' : 'DEPOSIT_DUE_H2'
      const dayLabel =
        daysUntil === 0 ? 'today!' :
        daysUntil === 1 ? 'tomorrow' : 'in 2 days'

      const title = `Deposit due ${dayLabel}`
      const body  = `${booking.bookingCode} — ${booking.customer.name}. Please follow up with the customer for deposit payment.`

      records.push({ userId: booking.salespersonId, type, title, body, bookingId: booking.id })
    }

    // Query 3: batch upsert — skip already-existing ones
    if (records.length > 0) await db.notification.createMany({ data: records, skipDuplicates: true })

    // Purchase requests stuck in DRAFT (submitted but never verified by Purchasing) —
    // nag Purchasing/Admin daily until someone verifies. requestId isn't part of the
    // Notification unique constraint above (that one's keyed on bookingId), so dedup
    // here is manual: skip a PR that already got a reminder within PR_RENOTIFY_AFTER_MS.
    const staleCutoff = new Date(Date.now() - PR_STALE_AFTER_MS)
    const stalePRs = await db.purchaseRequest.findMany({
      where: { status: 'DRAFT', createdAt: { lte: staleCutoff } },
      select: {
        id: true, prNumber: true, createdAt: true, isUrgent: true, division: true,
        requestedByEmployee: { select: { fullName: true } },
        requestedBy: { select: { name: true } },
      },
    })

    let prGenerated = 0
    if (stalePRs.length > 0) {
      const renotifyCutoff = new Date(Date.now() - PR_RENOTIFY_AFTER_MS)
      const alreadyNotified = await db.notification.findMany({
        where: { type: 'PR_VERIFY_REMINDER', requestId: { in: stalePRs.map(pr => pr.id) }, createdAt: { gte: renotifyCutoff } },
        select: { requestId: true },
      })
      const skip = new Set(alreadyNotified.map(n => n.requestId))
      const dueForReminder = stalePRs.filter(pr => !skip.has(pr.id))

      for (const pr of dueForReminder) {
        const daysOld = Math.max(1, Math.floor((Date.now() - pr.createdAt.getTime()) / 86400000))
        const requesterName = pr.requestedByEmployee?.fullName ?? pr.requestedBy.name ?? 'Seseorang'
        const title = pr.isUrgent
          ? `🔴 Urgent PR belum diverifikasi (${daysOld} hari)`
          : `PR belum diverifikasi (${daysOld} hari)`
        const body = `${pr.prNumber} — diajukan oleh ${requesterName}, sudah ${daysOld} hari menunggu verifikasi. Segera diverifikasi ya.`
        await notifyPurchasingForRequest(db, pr.division, 'PR_VERIFY_REMINDER', title, body, pr.id)
        prGenerated++
      }
    }

    // Legal documents expiring within DOC_WARNING_DAYS (or already overdue) — nag
    // HR/Admin daily until someone updates the expiry (renews it). Dedup is manual via
    // Notification.legalDocumentId, same reasoning as the PR reminder above.
    const docWarningCutoff = new Date(today)
    docWarningCutoff.setDate(docWarningCutoff.getDate() + DOC_WARNING_DAYS)
    const expiringDocs = await db.legalDocument.findMany({
      where: { expiryDate: { not: null, lte: docWarningCutoff } },
      select: { id: true, name: true, expiryDate: true, legalEntity: { select: { name: true } } },
    })

    let docGenerated = 0
    if (expiringDocs.length > 0) {
      const docRenotifyCutoff = new Date(Date.now() - DOC_RENOTIFY_AFTER_MS)
      const alreadyNotifiedDocs = await db.notification.findMany({
        where: { type: 'LEGAL_DOC_EXPIRING', legalDocumentId: { in: expiringDocs.map(d => d.id) }, createdAt: { gte: docRenotifyCutoff } },
        select: { legalDocumentId: true },
      })
      const skipDocs = new Set(alreadyNotifiedDocs.map(n => n.legalDocumentId))
      const dueDocs = expiringDocs.filter(d => !skipDocs.has(d.id))

      if (dueDocs.length > 0) {
        const hrUsers = await db.user.findMany({ where: { role: { in: HR_ROLES as never[] } }, select: { id: true } })
        const docRecords = dueDocs.flatMap(d => {
          const daysLeft = Math.ceil((d.expiryDate!.getTime() - today.getTime()) / 86400000)
          const title = daysLeft < 0
            ? `🔴 Dokumen sudah kedaluwarsa: ${d.name}`
            : daysLeft === 0
              ? `🔴 Dokumen kedaluwarsa hari ini: ${d.name}`
              : `Dokumen akan kedaluwarsa (${daysLeft} hari): ${d.name}`
          const body = `${d.name} — ${d.legalEntity.name}. ${daysLeft < 0 ? `Sudah lewat ${Math.abs(daysLeft)} hari dari tanggal berlaku.` : `Berlaku sampai ${d.expiryDate!.toISOString().slice(0, 10)}.`} Segera diperbarui.`
          return hrUsers.map(u => ({ userId: u.id, type: 'LEGAL_DOC_EXPIRING', title, body, legalDocumentId: d.id }))
        })
        await db.notification.createMany({ data: docRecords })
        docGenerated = docRecords.length
        sendPushToUsers(db, [...new Set(docRecords.map(r => r.userId))], {
          title: 'Dokumen legal akan/telah kedaluwarsa',
          body: `${dueDocs.length} dokumen perlu diperbarui.`,
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true, generated: records.length, prGenerated, docGenerated })
  } catch (error) {
    console.error('Reminder generation failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
