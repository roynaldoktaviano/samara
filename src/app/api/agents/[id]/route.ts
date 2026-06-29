import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null
  return session
}

async function requireManage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(role)) return null
  return session
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
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
  const db = await getDb()
  try {
    const session = await requireManage()
    if (!session) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()

    // ── Void contract action ──────────────────────────────────────────────────
    if (body.action === 'void_contract') {
      const agent = await db.agent.update({
        where: { id },
        data: { contract: null, contractFile: null, contractFileName: null },
      })
      logActivity({
        userId:   session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        userRole: (session.user as { role?: string }).role ?? '',
        action: 'UPDATE', entity: 'Agent', entityId: id,
        detail: `Void contract for agent: ${agent.name}`,
      }, db).catch(() => {})
      return NextResponse.json(agent)
    }

    const { name, commission, commissionOpenTrip, commissionPrivateCharter, isActive, salespersonId, country, address, email, whatsapp, note, website, instagram, source, currentCondition, contract, contractFile, contractFileName } = body

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const duplicate = await db.agent.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' }, NOT: { id } },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({ error: `Agent dengan nama "${name.trim()}" sudah ada` }, { status: 409 })
    }

    const agent = await db.agent.update({
      where: { id },
      data: {
        name,
        commission:                  commission               !== undefined ? parseFloat(String(commission)) || 0               : undefined,
        commissionOpenTrip:          commissionOpenTrip       !== undefined ? parseFloat(String(commissionOpenTrip)) || 0       : undefined,
        commissionPrivateCharter:    commissionPrivateCharter !== undefined ? parseFloat(String(commissionPrivateCharter)) || 0 : undefined,
        isActive:                    isActive                 !== undefined ? Boolean(isActive)                                : undefined,
        salespersonId: salespersonId !== undefined ? (salespersonId || null)          : undefined,
        country:          country          !== undefined ? (country          || null) : undefined,
        address:          address          !== undefined ? (address          || null) : undefined,
        email:            email            !== undefined ? (email            || null) : undefined,
        whatsapp:         whatsapp         !== undefined ? (whatsapp         || null) : undefined,
        note:             note             !== undefined ? (note             || null) : undefined,
        website:          website          !== undefined ? (website          || null) : undefined,
        instagram:        instagram        !== undefined ? (instagram        || null) : undefined,
        source:           source           !== undefined ? (source           || null) : undefined,
        currentCondition: currentCondition !== undefined ? (currentCondition || null) : undefined,
        contract:         contract         !== undefined ? (contract         || null) : undefined,
        contractFile:     contractFile     !== undefined ? (contractFile     || null) : undefined,
        contractFileName: contractFileName !== undefined ? (contractFileName || null) : undefined,
      },
    })

    logActivity({
      userId:   session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `Update agent: ${name}`,
    }, db).catch(() => {})

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const existing = await db.agent.findUnique({ where: { id }, select: { name: true } })
    await db.agent.update({ where: { id }, data: { isActive: false } })

    logActivity({
      userId:   session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'DELETE', entity: 'Agent', entityId: id,
      detail: `Nonaktifkan agent: ${existing?.name ?? id}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deactivating agent:', error)
    return NextResponse.json({ error: 'Failed to deactivate agent' }, { status: 500 })
  }
}
