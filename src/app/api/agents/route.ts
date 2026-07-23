import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {

    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'

    const agents = await db.agent.findMany({
      where: all ? undefined : { isActive: true },
      select: {
        id: true, name: true, commission: true, commissionOpenTrip: true, commissionPrivateCharter: true, isActive: true, createdAt: true,
        country: true, address: true, email: true, whatsapp: true, note: true, website: true, instagram: true, source: true, currentCondition: true, contract: true, contractFileName: true,
        calendarToken: true, calendarActive: true,
        portalPasswordHash: true, portalActive: true,
        salespersonId: true,
        salesperson: { select: { id: true, name: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { name: 'asc' },
    })
    // Never expose the password hash — reduce it to a boolean.
    const result = agents.map(({ portalPasswordHash, ...a }) => ({ ...a, hasPortalPassword: !!portalPasswordHash }))
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true
  const isSales = userRole === 'SALES'
  if (!isSuperAdmin && userRole !== 'ADMIN' && !isSales) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { name, commission, commissionOpenTrip, commissionPrivateCharter, salespersonId, country, address, email, whatsapp, note, website, instagram, source, currentCondition, contract, contractFile, contractFileName } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const duplicate = await db.agent.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({ error: `Agent dengan nama "${name.trim()}" sudah ada` }, { status: 409 })
    }

    const agent = await db.agent.create({
      data: {
        name,
        commission:                   commission ? parseFloat(commission) : 0,
        commissionOpenTrip:           commissionOpenTrip ? parseFloat(commissionOpenTrip) : 0,
        commissionPrivateCharter:     commissionPrivateCharter ? parseFloat(commissionPrivateCharter) : 0,
        salespersonId: isSales ? (session!.user.id ?? null) : (salespersonId || null),
        country:          country          || null,
        address:          address          || null,
        email:            email            || null,
        whatsapp:         whatsapp         || null,
        note:             note             || null,
        website:          website          || null,
        instagram:        instagram        || null,
        source:           source           || null,
        currentCondition: currentCondition || null,
        contract:         contract         || null,
        contractFile:     contractFile     || null,
        contractFileName: contractFileName || null,
      },
    })

    logActivity({
      userId:   session!.user.id,
      userName: session!.user.name ?? session!.user.email ?? 'Unknown',
      userRole: (session!.user as { role?: string }).role ?? '',
      action: 'CREATE', entity: 'Agent', entityId: agent.id,
      detail: `Add agent: ${agent.name}`,
    }, db).catch(() => {})

    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}
