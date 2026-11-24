import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole } from '@/lib/auth-guard'
import { canAccessLead } from '@/lib/lead-access'
import { DEAL_ATTRIBUTION_SELECT } from '@/lib/deal-attribution'

// Ad attribution of each of the lead's deals (src/lib/deal-attribution.ts) — per deal, not per person
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)
  const { id } = await params
  if (!(await canAccessLead(db, (auth.session.user as { role?: string }).role, auth.session.user.id, id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const deals = await db.deal.findMany({ where: { leadId: id, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: DEAL_ATTRIBUTION_SELECT })
  return NextResponse.json(deals)
}
