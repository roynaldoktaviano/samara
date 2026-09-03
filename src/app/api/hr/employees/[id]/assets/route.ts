import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const assets = await db.employeeAsset.findMany({ where: { employeeId: id }, orderBy: { assignedDate: 'desc' } })
  return NextResponse.json(assets)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { itemName, category, serialNumber, condition, assignedDate, notes } = await req.json()
  if (!itemName?.trim()) return NextResponse.json({ error: 'Item name is required' }, { status: 400 })

  const asset = await db.employeeAsset.create({
    data: {
      employeeId: id,
      itemName: itemName.trim(),
      category: category?.trim() || null,
      serialNumber: serialNumber?.trim() || null,
      condition: condition?.trim() || null,
      assignedDate: assignedDate ? new Date(assignedDate) : new Date(),
      notes: notes?.trim() || null,
    },
  })
  return NextResponse.json(asset, { status: 201 })
}
