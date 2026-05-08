import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (role !== 'ADMIN') return null
  return session
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const agent = await db.agent.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    })
    if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireAdmin()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()
    const { name, email, phone, company, commission, isActive } = body

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const agent = await db.agent.update({
      where: { id },
      data: {
        name,
        email:      email      !== undefined ? (email      || null)                  : undefined,
        phone:      phone      !== undefined ? (phone      || null)                  : undefined,
        company:    company    !== undefined ? (company    || null)                  : undefined,
        commission: commission !== undefined ? parseFloat(String(commission)) || 0   : undefined,
        isActive:   isActive   !== undefined ? Boolean(isActive)                     : undefined,
      },
    })
    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireAdmin()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    // Soft-delete: preserve booking history, just hide from new booking selections
    await db.agent.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deactivating agent:', error)
    return NextResponse.json({ error: 'Failed to deactivate agent' }, { status: 500 })
  }
}
