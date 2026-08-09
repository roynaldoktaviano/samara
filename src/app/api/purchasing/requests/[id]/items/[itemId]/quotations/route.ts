import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { invalidateQuotationApproval } from '@/lib/purchasing/quotationApproval'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const item = await db.purchaseRequestItem.findUnique({ where: { id: itemId }, select: { id: true, requestId: true } })
  if (!item || item.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const quotations = await db.purchaseQuotation.findMany({ where: { requestItemId: itemId }, orderBy: { price: 'asc' } })
  return NextResponse.json({ quotations })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'ON_PROCESS') {
    return NextResponse.json({ error: 'Quotations can only be added while the request is On Process' }, { status: 409 })
  }

  const item = await db.purchaseRequestItem.findUnique({ where: { id: itemId }, select: { id: true, requestId: true } })
  if (!item || item.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const body = await req.json()
  const { supplierId, supplierName, price, fileKey, submittedAt } = body as {
    supplierId?: string; supplierName?: string; price?: number; fileKey?: string; submittedAt?: string
  }

  if (!supplierName?.trim()) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
  if (!price || Number(price) <= 0) return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 })

  let resolvedSupplierId: string | null = supplierId || null
  if (!resolvedSupplierId) {
    const trimmed = supplierName.trim()
    resolvedSupplierId = (await db.supplier.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null
  }

  const quotation = await db.purchaseQuotation.create({
    data: {
      id: crypto.randomUUID(),
      requestItemId: itemId,
      supplierId: resolvedSupplierId,
      supplierName: supplierName.trim(),
      price: Number(price),
      fileKey: fileKey || null,
      submittedAt: submittedAt ? new Date(submittedAt) : new Date(),
      createdById: session.user.id,
    },
  })
  // New evidence invalidates any approval already on file — it was made on an
  // incomplete quotation set.
  await invalidateQuotationApproval(db, itemId)
  return NextResponse.json(quotation)
}
