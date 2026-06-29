import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

function pick(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = data[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return ''
}

export async function POST(request: NextRequest) {
  const db = await getDb()
  try {
    // ── Verify secret token ──────────────────────────────────────────────────
    const secret   = request.nextUrl.searchParams.get('secret')
    const expected = process.env.CF7_WEBHOOK_SECRET
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse body (JSON or form-encoded) ────────────────────────────────────
    const contentType = request.headers.get('content-type') ?? ''
    let data: Record<string, unknown> = {}

    if (contentType.includes('application/json')) {
      data = await request.json()
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await request.formData()
      for (const [k, v] of form.entries()) data[k] = v
    } else {
      const text = await request.text()
      try {
        data = JSON.parse(text)
      } catch {
        for (const [k, v] of new URLSearchParams(text).entries()) data[k] = v
      }
    }

    // ── Extract fields ────────────────────────────────────────────────────────
    const firstName = pick(data, 'first-name', 'first_name', 'firstName', 'your-first-name')
    const lastName  = pick(data, 'last-name',  'last_name',  'lastName',  'your-last-name')
    const email     = pick(data, 'email',       'your-email', 'Email')
    const phone     = pick(data, 'phone',       'phone-wa',   'phone_wa',  'your-phone', 'Phone')
    const numGuests = pick(data, 'number-of-guests', 'num-guests', 'number_of_guests', 'guests', 'guest-count')
    const checkIn   = pick(data, 'check-in-date',  'checkin',  'check_in',  'start-date', 'check-in')
    const checkOut  = pick(data, 'check-out-date', 'checkout', 'check_out', 'end-date',   'check-out')
    const tripType  = pick(data, 'trip-type',  'trip_type',  'tripType',  'trip')
    const message   = pick(data, 'request',    'message',    'your-message', 'Request', 'Message')

    if (!firstName && !email && !phone) {
      return NextResponse.json({ error: 'Insufficient contact data' }, { status: 400 })
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email || phone

    // ── Build inquiry note ────────────────────────────────────────────────────
    const timestamp  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })
    const noteLines  = [
      `[Website Inquiry — ${timestamp}]`,
      checkIn   && `Check-in   : ${checkIn}`,
      checkOut  && `Check-out  : ${checkOut}`,
      numGuests && `Guests     : ${numGuests}`,
      tripType  && `Trip type  : ${tripType}`,
      message   && `Request    : ${message}`,
    ].filter(Boolean).join('\n')

    // ── Upsert customer ───────────────────────────────────────────────────────
    let existingCustomer = await (email
      ? db.customer.findFirst({ where: { email, deletedAt: null } })
      : Promise.resolve(null))
    if (!existingCustomer && phone) {
      existingCustomer = await db.customer.findFirst({ where: { phone, deletedAt: null } })
    }

    let customerId: string
    if (existingCustomer) {
      const existingNotes = existingCustomer.operationalNotes ?? ''
      const updatedNotes  = existingNotes ? `${existingNotes}\n\n${noteLines}` : noteLines
      const updated = await db.customer.update({
        where: { id: existingCustomer.id },
        data: {
          name: fullName,
          ...(firstName && { firstName }),
          ...(lastName  && { lastName  }),
          ...(email     && { email     }),
          ...(phone     && { phone     }),
          operationalNotes: updatedNotes,
        },
        select: { id: true },
      })
      customerId = updated.id
    } else {
      const created = await db.customer.create({
        data: {
          name:             fullName,
          firstName:        firstName || null,
          lastName:         lastName  || null,
          email:            email     || null,
          phone:            phone     || null,
          operationalNotes: noteLines,
        },
        select: { id: true },
      })
      customerId = created.id
    }

    logActivity({
      userId: '', userName: 'Website CF7', userRole: 'SYSTEM',
      action: 'CREATE', entity: 'Customer', entityId: customerId,
      detail: `Website inquiry: ${fullName} · ${noteLines.replace(/\n/g, ' ')}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true, customerId })
  } catch (error) {
    console.error('[CF7 webhook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
