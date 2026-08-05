import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const suppliers = await db.supplier.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { orders: true } } },
  })
  return NextResponse.json(suppliers)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { name, locations, contact, phone, email, notes } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
  const existing = await db.supplier.findFirst({ where: { name: { equals: name.trim(), mode: 'insensitive' } } })
  if (existing) return NextResponse.json({ error: `Supplier "${name}" already exists` }, { status: 409 })
  const supplier = await db.supplier.create({
    data: {
      id: crypto.randomUUID(),
      name: name.trim(),
      locations: Array.isArray(locations) ? locations : [],
      contact: contact?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    },
  })
  return NextResponse.json(supplier, { status: 201 })
}
