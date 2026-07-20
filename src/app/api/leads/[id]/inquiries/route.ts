import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole } from '@/lib/auth-guard'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)
  const { id } = await params
  const inquiries = await db.inquiry.findMany({ where: { leadId: id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(inquiries)
}
