import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const lead = await db.lead.findUnique({ where: { id } })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(lead)
  } catch (error) {
    console.error('Error fetching lead:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
    const { id } = await params
    const existing = await db.lead.findUnique({ where: { id }, select: { name: true } })
    await db.lead.update({ where: { id }, data: { deletedAt: new Date() } })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'DELETE', entity: 'Lead', entityId: id,
      detail: `Hapus lead: ${existing?.name ?? id}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting lead:', error)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const { firstName, lastName, nationality, email, phone, notes } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const lead = await db.lead.update({
      where: { id },
      data: { name, firstName, lastName, nationality, email, phone, notes },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'UPDATE', entity: 'Lead', entityId: id,
      detail: `Update lead: ${lead.name}`,
    }, db).catch(() => {})

    return NextResponse.json(lead)
  } catch (error) {
    console.error('Error updating lead:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}
