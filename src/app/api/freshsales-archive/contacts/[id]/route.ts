import { NextRequest, NextResponse } from 'next/server'
import { archiveAccess, contactDetail } from '@/lib/freshsales-archive-view'

// One archived contact: profile, every deal it is on, and its merged history.
// Also reachable by ERP record: ?lead=<leadId> or ?customer=<customerId> with id "by-erp".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await archiveAccess()
  if ('error' in access) return access.error
  const { db } = access
  const sp = req.nextUrl.searchParams

  const contact = id === 'by-erp'
    ? await db.freshsalesContact.findFirst({ where: sp.get('lead') ? { leadId: sp.get('lead') } : { customerId: sp.get('customer') ?? '' } })
    : await db.freshsalesContact.findUnique({ where: { id } })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(await contactDetail(db, contact))
}
