import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params
  const body = await req.json()
  const { name, companyName, address, logoUrl, facebookUrl, instagramUrl, whatsappNumber, linkedinUrl, websiteUrl, isActive } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Brand name is required' }, { status: 400 })
  if (!companyName?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  try {
    const brand = await db.brand.update({
      where: { id },
      data: {
        name: name.trim(),
        companyName: companyName.trim(),
        address: address || null,
        logoUrl: logoUrl || null,
        facebookUrl: facebookUrl || null,
        instagramUrl: instagramUrl || null,
        whatsappNumber: whatsappNumber || null,
        linkedinUrl: linkedinUrl || null,
        websiteUrl: websiteUrl || null,
        isActive: isActive ?? true,
      },
    })
    return NextResponse.json(brand)
  } catch {
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params
  try {
    await db.brand.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 })
  }
}
