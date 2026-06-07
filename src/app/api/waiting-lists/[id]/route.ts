import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id }   = await params
    const body     = await request.json()
    const { priority, notes, contactName, contactPhone, contactEmail, status } = body

    const existing = await db.waitingList.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await db.waitingList.update({
      where: { id },
      data: {
        ...(priority     !== undefined && { priority }),
        ...(notes        !== undefined && { notes: notes || null }),
        ...(contactName  !== undefined && { contactName: contactName.trim() }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone?.trim() || null }),
        ...(contactEmail !== undefined && { contactEmail: contactEmail?.trim() || null }),
        ...(status       !== undefined && { status }),
      },
      include: {
        customer:    { select: { id: true, name: true } },
        salesperson: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('waiting-list PUT error:', error)
    return NextResponse.json({ error: 'Failed to update waiting list entry' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const existing = await db.waitingList.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.waitingList.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('waiting-list DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete waiting list entry' }, { status: 500 })
  }
}
