import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole } from '@/lib/auth-guard'
import { findLinkedLeadId } from '@/lib/customer-lead-link'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)
  const { id } = await params

  const customer = await db.customer.findUnique({ where: { id }, select: { email: true, phone: true } })
  const leadId = customer ? await findLinkedLeadId(db, customer) : null

  const pageViews = await db.pageView.findMany({
    // A customer who first browsed/inquired as a Lead has those page views
    // attached to that Lead, not to this Customer — pull those in too.
    where: leadId ? { OR: [{ customerId: id }, { leadId }] } : { customerId: id },
    orderBy: { occurredAt: 'desc' },
  })
  return NextResponse.json(pageViews)
}
