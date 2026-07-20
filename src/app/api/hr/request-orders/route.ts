import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'

// Public, unauthenticated: internal employees (who may not have an ERP login) submit
// requests here. Each submission becomes a DRAFT PurchaseRequest that the purchasing
// team reviews and formally submits through the normal approval flow.
// `?token=<per-tenant token>` identifies which company this submission belongs to.

const SYSTEM_REQUESTER_EMAIL = 'system+employee-requests@samara.internal'

async function getSystemRequesterId(db: PrismaClient): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: SYSTEM_REQUESTER_EMAIL }, select: { id: true } })
  if (existing) return existing.id
  const password = await bcrypt.hash(crypto.randomUUID() + crypto.randomUUID(), 12)
  const created = await db.user.create({
    data: { id: crypto.randomUUID(), email: SYSTEM_REQUESTER_EMAIL, name: 'Employee Request Portal', password, role: 'MARKETING' },
    select: { id: true },
  })
  return created.id
}

async function generatePrNumber(db: PrismaClient) {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const prefix = `PR-${year}${month}-`
  const last = await db.purchaseRequest.findFirst({
    where: { prNumber: { startsWith: prefix } },
    orderBy: { prNumber: 'desc' },
    select: { prNumber: true },
  })
  const seq = last ? (parseInt(last.prNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

interface RequestItemInput {
  itemId?: string
  itemName: string
  quantity: number
  unit: string
  notes?: string
  imageKeys?: string[]
}

export async function POST(req: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(req.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved

  const body = await req.json()
  const { employeeId, locationId, notes, items } = body as {
    employeeId?: string; locationId?: string; notes?: string; items?: RequestItemInput[]
  }

  if (!employeeId) return NextResponse.json({ error: 'Please select who is requesting' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Add at least one item to the request' }, { status: 400 })
  }
  for (const it of items) {
    if (!it.itemName?.trim()) return NextResponse.json({ error: 'Every item needs a name or description' }, { status: 400 })
    if (!it.quantity || Number(it.quantity) <= 0) return NextResponse.json({ error: `Quantity for "${it.itemName}" must be greater than 0` }, { status: 400 })
  }

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, isActive: true, fullName: true } })
  if (!employee || !employee.isActive) return NextResponse.json({ error: 'Selected requester was not found' }, { status: 400 })

  if (locationId) {
    const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true } })
    if (!loc) return NextResponse.json({ error: 'Selected vessel/location was not found' }, { status: 400 })
  }

  const [requestedById, prNumber] = await Promise.all([getSystemRequesterId(db), generatePrNumber(db)])

  const request = await db.purchaseRequest.create({
    data: {
      id: crypto.randomUUID(),
      prNumber,
      requestedById,
      requestedByEmployeeId: employeeId,
      deliveryLocationId: locationId || null,
      notes: notes?.trim() || null,
      status: 'REQUESTED',
      updatedAt: new Date(),
      items: {
        create: items.map(it => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName.trim(),
          quantity: Number(it.quantity),
          unit: it.unit?.trim() || 'pcs',
          notes: it.notes?.trim() || null,
          imageKeys: Array.isArray(it.imageKeys) ? it.imageKeys.filter(Boolean) : [],
        })),
      },
    },
    include: { items: true },
  })

  // Notify the purchasing team so they know a new draft is waiting for review.
  const purchasingUsers = await db.user.findMany({
    where: { role: { in: ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  })
  if (purchasingUsers.length) {
    await db.notification.createMany({
      data: purchasingUsers.map(u => ({
        userId: u.id,
        type: 'REQUEST_ORDER_SUBMITTED',
        title: 'New request order submitted',
        body: `${employee.fullName} requested ${request.items.length} item${request.items.length !== 1 ? 's' : ''} — ${prNumber} is waiting for review.`,
        requestId: request.id,
      })),
    }).catch(() => {})
  }

  return NextResponse.json(request, { status: 201 })
}
