import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole } from '@/lib/auth-guard'
import { canAccessLead } from '@/lib/lead-access'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)
  const { id } = await params
  if (!(await canAccessLead(db, (auth.session.user as { role?: string }).role, auth.session.user.id, id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const inquiries = await db.inquiry.findMany({ where: { leadId: id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(inquiries)
}
