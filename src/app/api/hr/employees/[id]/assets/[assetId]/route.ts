import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { assetId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { itemName, category, serialNumber, condition, assignedDate, notes, isReturned, returnedAt, returnCondition, returnNotes } = await req.json()

  const asset = await db.employeeAsset.update({
    where: { id: assetId },
    data: {
      ...(itemName !== undefined && { itemName: itemName.trim() }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(serialNumber !== undefined && { serialNumber: serialNumber?.trim() || null }),
      ...(condition !== undefined && { condition: condition?.trim() || null }),
      ...(assignedDate !== undefined && { assignedDate: assignedDate ? new Date(assignedDate) : new Date() }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(isReturned !== undefined && {
        isReturned,
        returnedAt: isReturned ? (returnedAt ? new Date(returnedAt) : new Date()) : null,
        returnCondition: isReturned ? (returnCondition?.trim() || null) : null,
        returnNotes: isReturned ? (returnNotes?.trim() || null) : null,
      }),
    },
  })
  return NextResponse.json(asset)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { assetId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.employeeAsset.delete({ where: { id: assetId } })
  return NextResponse.json({ ok: true })
}
