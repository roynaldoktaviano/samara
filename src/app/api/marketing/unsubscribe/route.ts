import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'

// Public, unauthenticated — reached from a link in a sent email, so there's no
// staff session and no tenant context. Same lookup-by-token pattern as guest-form.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const found = await resolveTenantByLookup(client =>
    client.campaignRecipient.findUnique({ where: { unsubscribeToken: token }, include: { campaign: { select: { name: true, fromName: true, fromEmail: true } } } })
  )
  if (!found) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  return NextResponse.json({
    email: found.record.email,
    alreadyUnsubscribed: found.record.status === 'SKIPPED_UNSUBSCRIBED',
    campaignName: found.record.campaign.name,
    fromName: found.record.campaign.fromName ?? found.record.campaign.fromEmail,
  })
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const found = await resolveTenantByLookup(client =>
    client.campaignRecipient.findUnique({ where: { unsubscribeToken: token } })
  )
  if (!found) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  const { db: tenantDb, record } = found
  await tenantDb.campaignRecipient.update({ where: { id: record.id }, data: { status: 'SKIPPED_UNSUBSCRIBED' } })
  await tenantDb.emailUnsubscribe.upsert({
    where: { email: record.email },
    update: {},
    create: { email: record.email, campaignId: record.campaignId },
  })

  return NextResponse.json({ ok: true, email: record.email })
}
