import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { resolveTenantBySlug } from '@/lib/resolve-tenant'

// Resend delivers events (email.opened, email.delivered, email.bounced, ...) via
// a Svix-signed webhook. Configure this URL in the Resend dashboard as
// `https://<app-domain>/api/webhooks/resend?tenant=<slug>` (defaults to 'samara'
// when omitted, matching the CF7 webhook convention) and subscribe to at least
// `email.opened`, `email.clicked` and `email.bounced`.
const TRACKED_EVENTS = new Set(['email.opened', 'email.clicked', 'email.bounced'])

type ResendEvent = {
  type?: string
  data?: {
    email_id?: string
    bounce?: { message?: string }
    click?: { link?: string }
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET not configured' }, { status: 500 })

  const rawBody = await request.text()
  const svixHeaders = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  let event: ResendEvent
  try {
    event = new Webhook(secret).verify(rawBody, svixHeaders) as ResendEvent
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

  const buildUpdate = (prevOpenedAt: Date | null, prevClickedAt: Date | null) => {
    if (event.type === 'email.opened') {
      return { openedAt: prevOpenedAt ?? new Date(), openCount: { increment: 1 } }
    }
    if (event.type === 'email.clicked') {
      return {
        clickedAt: prevClickedAt ?? new Date(),
        clickCount: { increment: 1 },
        lastClickUrl: event.data?.click?.link,
      }
    }
    return { status: 'BOUNCED' as const, errorMessage: event.data?.bounce?.message ?? 'Bounced' }
  }

  const clickedUrl = event.data?.click?.link

  const campaignRecipient = await db.campaignRecipient.findFirst({ where: { resendId: emailId } })
  if (campaignRecipient) {
    await db.campaignRecipient.update({
      where: { id: campaignRecipient.id },
      data: buildUpdate(campaignRecipient.openedAt, campaignRecipient.clickedAt),
    })
    if (event.type === 'email.clicked' && clickedUrl) {
      await db.campaignClickEvent.create({ data: { recipientId: campaignRecipient.id, url: clickedUrl } })
    }
    return NextResponse.json({ ok: true })
  }

  const newsletterRecipient = await db.newsletterRecipient.findFirst({ where: { resendId: emailId } })
  if (newsletterRecipient) {
    await db.newsletterRecipient.update({
      where: { id: newsletterRecipient.id },
      data: buildUpdate(newsletterRecipient.openedAt, newsletterRecipient.clickedAt),
    })
    if (event.type === 'email.clicked' && clickedUrl) {
      await db.newsletterClickEvent.create({ data: { recipientId: newsletterRecipient.id, url: clickedUrl } })
    }
  }

  return NextResponse.json({ ok: true })
}
