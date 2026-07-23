import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { whereForTab, orderByForTab, isLikelyAutomated, type RecipientTab } from '@/lib/campaign-recipients'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Split out from the main campaign detail route so switching tabs/pages/search
// only re-runs this scoped, paginated query instead of also re-fetching the
// campaign-wide chart data and unsubscribed list on every click.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const url = new URL(req.url)
  const tab = (url.searchParams.get('status') as RecipientTab) || 'SENT'
  const search = (url.searchParams.get('search') ?? '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50') || 50))

  const where = whereForTab(id, tab, search)

  const [recipients, totalCount] = await Promise.all([
    db.campaignRecipient.findMany({
      where,
      orderBy: orderByForTab(tab),
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clicks: { orderBy: { clickedAt: 'desc' } },
        opens: { orderBy: { openedAt: 'desc' } },
      },
      // sourceType/sourceId (via the default select-all include above) let the
      // Failed tab offer a "delete guest/lead" action straight to the source
      // contact, since a hard bounce/failure usually means a dead address.
    }),
    db.campaignRecipient.count({ where }),
  ])

  const recipientsWithFlag = recipients.map(r => ({ ...r, likelyAutomated: isLikelyAutomated(r.clicks) }))

  return NextResponse.json({
    recipients: recipientsWithFlag,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    totalCount,
  })
}
