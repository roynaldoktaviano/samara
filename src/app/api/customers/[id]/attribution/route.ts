import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole } from '@/lib/auth-guard'
import { findLinkedLeadId } from '@/lib/customer-lead-link'
import { DEAL_ATTRIBUTION_SELECT } from '@/lib/deal-attribution'

// Ad attribution of each of the guest's deals (incl. the lead they enquired as) — per deal
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)
  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { email: true, phone: true } })
  const leadId = customer ? await findLinkedLeadId(db, customer) : null
  const deals = await db.deal.findMany({
    where: { deletedAt: null, OR: [{ customerId: id }, ...(leadId ? [{ leadId }] : [])] },
    orderBy: { createdAt: 'desc' },
    select: DEAL_ATTRIBUTION_SELECT,
  })
  return NextResponse.json(deals)
}
