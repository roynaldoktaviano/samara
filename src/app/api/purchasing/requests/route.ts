import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { notifyByRoleForRequest } from '@/lib/notify-purchasing'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const PURCHASING_ROLES = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

async function generatePrNumber(db: Awaited<ReturnType<typeof getDb>>) {
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

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  // Warehouse only requests items for warehouse stock (or forwards a ship's request) —
  // they should only ever see their own submissions, not Purchasing's full queue.
  const isWarehouse = role === 'WAREHOUSE'
  const requests = await db.purchaseRequest.findMany({
    where: {
      // PRs still awaiting the requester's manager haven't been approved yet — Purchasing
      // shouldn't see them until the approval endpoint flips them to DRAFT.
      status: { not: 'PENDING_APPROVAL' },
      ...(isWarehouse ? { requestedById: session.user.id } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, quantity: true, estimatedCost: true } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
      verifiedBy: { select: { id: true, name: true } },
    },
  })
  const userIds = [...new Set(requests.map(r => r.requestedById))]
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const userMap = new Map(users.map(u => [u.id, u]))
  return NextResponse.json(
    requests.map(r => ({
      ...r,
      itemCount: r.items.length,
      totalBudget: r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0),
      // createdBy is always the ERP login that submitted the PR (e.g. a warehouse account).
      // requestedByEmployee (already in the include) is who it's actually for — optional,
      // e.g. warehouse forwarding a specific ship crew member's request. Both are exposed
      // separately so the UI can show "Created by X · Requested by Y" instead of picking one.
      createdBy: userMap.get(r.requestedById) ?? null,
      // Requests submitted via the internal Request Order page carry a real requestedByEmployee;
      // prefer that for display, falling back to the ERP user for requests created inside Purchasing.
      requestedBy: r.requestedByEmployee
        ? { name: `${r.requestedByEmployee.fullName} (${r.requestedByEmployee.employeeNumber})` }
        : (userMap.get(r.requestedById) ?? null),
      items: undefined,
    })),
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { deliveryLocationId, notes, items, requestedByEmployeeId } = body
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })
  }
  const prNumber = await generatePrNumber(db)
  const request = await db.purchaseRequest.create({
    data: {
      id: crypto.randomUUID(),
      prNumber,
      requestedById: session.user.id,
      requestedByEmployeeId: requestedByEmployeeId || null,
      deliveryLocationId: deliveryLocationId || null,
      notes: notes?.trim() || null,
      status: 'DRAFT',
      updatedAt: new Date(),
      items: {
        create: items.map((it: { itemId?: string; itemName: string; quantity: number; unit: string; estimatedCost?: number; supplierId?: string; supplierName?: string; notes?: string; imageKeys?: string[] }) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName,
          quantity: Number(it.quantity),
          unit: it.unit,
          estimatedCost: Number(it.estimatedCost) || 0,
          supplierId: it.supplierId || null,
          supplierName: it.supplierName?.trim() || null,
          notes: it.notes?.trim() || null,
          imageKeys: Array.isArray(it.imageKeys) ? it.imageKeys.filter(Boolean) : [],
        })),
      },
    },
    include: { items: true },
  })

  // Notify Purchasing so a new PR doesn't sit unseen — skip when Purchasing/Admin
  // themselves created it, since they don't need to be told about their own action.
  if (!roleMatches(role, PURCHASING_ROLES)) {
    notifyByRoleForRequest(
      db, PURCHASING_ROLES, 'REQUEST_ORDER_SUBMITTED', 'New purchase request submitted',
      `${prNumber} was submitted with ${request.items.length} item${request.items.length !== 1 ? 's' : ''} and is waiting for review.`,
      request.id,
    ).catch(() => {})
  }

  return NextResponse.json(request, { status: 201 })
}
