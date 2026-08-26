import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { isDuplicateAgent } from '@/lib/agent-duplicate'

async function requireManage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'SALES'])) return null
  return session
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
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
  const session = await requireManage()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
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

    const before = await db.agent.findUnique({ where: { id }, select: { isActive: true, note: true } })

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

    // Notify the assigned salesperson the moment their agent gets flagged as a
    // duplicate (isActive turned false + note written in the "duplikat dari agent ..."
    // format) — only on the transition, so re-saving an already-flagged row doesn't spam.
    const wasDuplicate = before ? isDuplicateAgent(before) : false
    const isDuplicateNow = isDuplicateAgent(agent)
    if (!wasDuplicate && isDuplicateNow && agent.salespersonId) {
      const title = 'Agent ditandai duplikat'
      const notifBody = `${agent.name} yang kamu input ditandai sebagai duplikat dari agent yang sudah ada. Silakan cek dan hapus jika memang sama.`
      await db.notification.create({
        data: { userId: agent.salespersonId, type: 'AGENT_DUPLICATE_FLAGGED', title, body: notifBody },
      }).catch(() => {})
      sendPushToUsers(db, [agent.salespersonId], { title, body: notifBody }).catch(() => {})
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const existing = await db.agent.findUnique({ where: { id }, select: { name: true, isActive: true, note: true, salespersonId: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'
    if (!isAdmin && existing.salespersonId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only a confirmed duplicate-flagged agent can be permanently removed here — this
    // route is not a general-purpose hard delete, just the cleanup step for mistaken
    // duplicate entries. Anything else should keep going through PATCH { isActive: false }.
    if (!isDuplicateAgent(existing)) {
      return NextResponse.json({ error: 'Only agents flagged as duplicates can be deleted here — deactivate instead' }, { status: 400 })
    }

    await db.agent.delete({ where: { id } })

    logActivity({
      userId:   session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: role,
      action: 'DELETE', entity: 'Agent', entityId: id,
      detail: `Delete duplicate agent: ${existing.name}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting agent:', error)
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
  }
}
