import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { resolveTenantBySlug } from '@/lib/resolve-tenant'

// Resend delivers events (email.opened, email.delivered, email.bounced, ...) via
// a Svix-signed webhook. Configure this URL in the Resend dashboard as
// `https://<app-domain>/api/webhooks/resend?tenant=<slug>` (defaults to 'samara'
// when omitted, matching the CF7 webhook convention) and subscribe to at least
// `email.opened` and `email.bounced`.
const TRACKED_EVENTS = new Set(['email.opened', 'email.bounced'])

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET not configured' }, { status: 500 })

  const rawBody = await request.text()
  const svixHeaders = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  let event: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } }
  try {
    event = new Webhook(secret).verify(rawBody, svixHeaders) as typeof event
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const emailId = event.data?.email_id
  if (!event.type || !TRACKED_EVENTS.has(event.type) || !emailId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const db = await resolveTenantBySlug(tenantSlug)
  if (!db) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })

  const campaignRecipient = await db.campaignRecipient.findFirst({ where: { resendId: emailId } })
  if (campaignRecipient) {
    if (event.type === 'email.opened') {
      await db.campaignRecipient.update({
        where: { id: campaignRecipient.id },
        data: { openedAt: campaignRecipient.openedAt ?? new Date(), openCount: { increment: 1 } },
      })
    } else {
      await db.campaignRecipient.update({
        where: { id: campaignRecipient.id },
        data: { status: 'BOUNCED', errorMessage: event.data?.bounce?.message ?? 'Bounced' },
      })
    }
    return NextResponse.json({ ok: true })
  }

  const newsletterRecipient = await db.newsletterRecipient.findFirst({ where: { resendId: emailId } })
  if (newsletterRecipient) {
    if (event.type === 'email.opened') {
      await db.newsletterRecipient.update({
        where: { id: newsletterRecipient.id },
        data: { openedAt: newsletterRecipient.openedAt ?? new Date(), openCount: { increment: 1 } },
      })
    } else {
      await db.newsletterRecipient.update({
        where: { id: newsletterRecipient.id },
        data: { status: 'BOUNCED', errorMessage: event.data?.bounce?.message ?? 'Bounced' },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
