import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const {
    section, name, category, period, subDetail, fileKey,
    establishDate, expiryDate, issuer, vendor, notes,
  } = await req.json()

  const updated = await db.legalDocument.update({
    where: { id },
    data: {
      ...(section !== undefined && { section: section?.trim() || null }),
      ...(name !== undefined && { name: name.trim() }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(period !== undefined && { period: period?.trim() || null }),
      ...(subDetail !== undefined && { subDetail: subDetail?.trim() || null }),
      ...(fileKey !== undefined && { fileKey: fileKey || null }),
      ...(establishDate !== undefined && { establishDate: establishDate ? new Date(establishDate) : null }),
      ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      ...(issuer !== undefined && { issuer: issuer?.trim() || null }),
      ...(vendor !== undefined && { vendor: vendor?.trim() || null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.legalDocument.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
