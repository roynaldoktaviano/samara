import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string; quotationId: string }> }) {
  const { id, itemId, quotationId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'ON_PROCESS') {
    return NextResponse.json({ error: 'Quotations can only be removed while the request is On Process' }, { status: 409 })
  }

  const quotation = await db.purchaseQuotation.findUnique({ where: { id: quotationId }, select: { requestItemId: true } })
  if (!quotation || quotation.requestItemId !== itemId) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

  await db.purchaseQuotation.delete({ where: { id: quotationId } })
  return NextResponse.json({ ok: true })
}
