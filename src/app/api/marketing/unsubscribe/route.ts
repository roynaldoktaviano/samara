import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'

// Public, unauthenticated — reached from a link in a sent email, so there's no
// staff session and no tenant context. Same lookup-by-token pattern as guest-form.
// The token can belong to either a one-off EmailCampaign send or a recurring
// Automation send — both feed the same unsubscribeToken-keyed lookup here.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const campaignMatch = await resolveTenantByLookup(client =>
    client.campaignRecipient.findUnique({ where: { unsubscribeToken: token }, include: { campaign: { select: { name: true, fromName: true, fromEmail: true } } } })
  )
  if (campaignMatch) {
    return NextResponse.json({
      email: campaignMatch.record.email,
      alreadyUnsubscribed: campaignMatch.record.status === 'SKIPPED_UNSUBSCRIBED',
      campaignName: campaignMatch.record.campaign.name,
      fromName: campaignMatch.record.campaign.fromName ?? campaignMatch.record.campaign.fromEmail,
    })
  }

  const automationMatch = await resolveTenantByLookup(client =>
    client.automationEnrollment.findUnique({ where: { unsubscribeToken: token }, include: { automation: { select: { name: true, fromName: true, fromEmail: true } } } })
  )
  if (automationMatch) {
    return NextResponse.json({
      email: automationMatch.record.email,
      alreadyUnsubscribed: automationMatch.record.status === 'SKIPPED_UNSUBSCRIBED',
      campaignName: automationMatch.record.automation.name,
      fromName: automationMatch.record.automation.fromName ?? automationMatch.record.automation.fromEmail,
    })
  }

  return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
}

export async function POST(req: NextRequest) {
  // Two callers hit this: the confirm page (JSON body `{ token }`, no query string)
  // and mail clients' native one-click unsubscribe button (RFC 8058 — POSTs
  // `List-Unsubscribe=One-Click` as its body straight from the List-Unsubscribe
  // header URL, so the token has to travel via query string instead).
  const token = req.nextUrl.searchParams.get('token') ?? (await req.json().catch(() => null))?.token
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const campaignMatch = await resolveTenantByLookup(client =>
    client.campaignRecipient.findUnique({ where: { unsubscribeToken: token } })
  )
  if (campaignMatch) {
    const { db: tenantDb, record } = campaignMatch
    await tenantDb.campaignRecipient.update({ where: { id: record.id }, data: { status: 'SKIPPED_UNSUBSCRIBED', unsubscribedAt: new Date() } })
    await tenantDb.emailUnsubscribe.upsert({
      where: { email: record.email },
      update: {},
      create: { email: record.email, campaignId: record.campaignId },
    })
    return NextResponse.json({ ok: true, email: record.email })
  }

  const automationMatch = await resolveTenantByLookup(client =>
    client.automationEnrollment.findUnique({ where: { unsubscribeToken: token } })
  )
  if (automationMatch) {
    const { db: tenantDb, record } = automationMatch
    await tenantDb.automationEnrollment.update({ where: { id: record.id }, data: { status: 'SKIPPED_UNSUBSCRIBED' } })
    await tenantDb.emailUnsubscribe.upsert({
      where: { email: record.email },
      update: {},
      create: { email: record.email },
    })
    return NextResponse.json({ ok: true, email: record.email })
  }

  return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
}
