import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { notifyByRoleForRequest, PURCHASING_ROLES } from '@/lib/notify-purchasing'
import { sendPushToUser } from '@/lib/push'

const OPNAME_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const entry = await db.inventoryOpnameEntry.findUnique({
    where: { id: entryId },
    include: {
      item: { select: { id: true, name: true, itemNumber: true, unitPrice: true, vendorName: true } },
      opname: { select: { id: true, opnameNumber: true, locationId: true, room: { select: { name: true } } } },
    },
  })
  if (!entry || entry.opnameId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (entry.rating === null || entry.rating > 2) {
    return NextResponse.json({ error: 'Only units rated 2 stars or below can request a replacement' }, { status: 400 })
  }
  if (entry.replacementRequestItemId) {
    return NextResponse.json({ error: 'A replacement for this unit has already been requested' }, { status: 409 })
  }

  const requesterEmployee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, managerId: true },
  })
  const manager = requesterEmployee?.managerId
    ? await db.employee.findUnique({ where: { id: requesterEmployee.managerId }, select: { id: true, userId: true } })
    : null
  const approverEmployeeId = manager?.userId ? manager.id : null

  const prNumber = await generatePrNumber(db)

  const { request, createdItem } = await db.$transaction(async (tx) => {
    const fresh = await tx.inventoryOpnameEntry.findUnique({ where: { id: entryId }, select: { replacementRequestItemId: true } })
    if (fresh?.replacementRequestItemId) throw new Error('ALREADY_REQUESTED')

    const request = await tx.purchaseRequest.create({
      data: {
        id: crypto.randomUUID(),
        prNumber,
        requestedById: session.user.id,
        requestedByEmployeeId: requesterEmployee?.id || null,
        approverEmployeeId,
        deliveryLocationId: entry.opname.locationId,
        purpose: 'REPLACEMENT',
        status: approverEmployeeId ? 'PENDING_APPROVAL' : 'DRAFT',
        updatedAt: new Date(),
        items: {
          create: [{
            id: crypto.randomUUID(),
            itemName: `${entry.item.name} (Replacement — ${entry.item.itemNumber})`,
            quantity: 1,
            unit: 'pcs',
            estimatedCost: entry.item.unitPrice,
            supplierName: entry.item.vendorName || null,
            notes: `Damaged condition (${entry.rating}/5) found during Stock Opname ${entry.opname.opnameNumber}, room ${entry.opname.room.name}.${entry.notes ? ' ' + entry.notes : ''}`,
            imageKeys: entry.photoKey ? [entry.photoKey] : [],
            sourceInventoryItemId: entry.itemId,
          }],
        },
      },
      include: { items: true },
    })

    const createdItem = request.items[0]
    await tx.inventoryOpnameEntry.update({ where: { id: entryId }, data: { replacementRequestItemId: createdItem.id } })

    return { request, createdItem }
  }).catch((e) => {
    if (e instanceof Error && e.message === 'ALREADY_REQUESTED') return null
    throw e
  }) ?? {}

  if (!request) {
    return NextResponse.json({ error: 'A replacement for this unit has already been requested' }, { status: 409 })
  }

  if (approverEmployeeId && manager?.userId) {
    db.notification.create({
      data: {
        userId: manager.userId,
        type: 'PR_APPROVAL_NEEDED',
        title: 'Request needs your approval',
        body: `${requesterEmployee?.fullName ?? 'A request'} — ${prNumber} (damaged item replacement) is waiting for your approval.`,
        requestId: request.id,
      },
    }).catch(() => {})
    sendPushToUser(db, manager.userId, {
      title: 'Request needs your approval',
      body: `${requesterEmployee?.fullName ?? 'A request'} — ${prNumber} is waiting for your approval.`,
      url: '/',
    }).catch(() => {})
  } else if (!roleMatches(role, PURCHASING_ROLES)) {
    notifyByRoleForRequest(
      db, PURCHASING_ROLES, 'REQUEST_ORDER_SUBMITTED', 'New replacement request submitted',
      `${prNumber} was submitted for a damaged inventory item and is waiting for review.`,
      request.id,
    ).catch(() => {})
  }

  return NextResponse.json({ prNumber, requestId: request.id, status: request.status, itemId: createdItem?.id }, { status: 201 })
}
