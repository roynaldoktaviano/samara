import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'

    const agents = await db.agent.findMany({
      where: all ? undefined : { isActive: true },
      select: {
        id: true, name: true, commission: true, commissionOpenTrip: true, commissionPrivateCharter: true, isActive: true, createdAt: true,
        country: true, address: true, email: true, whatsapp: true, note: true, contract: true, contractFileName: true,
        calendarToken: true, calendarActive: true,
        salespersonId: true,
        salesperson: { select: { id: true, name: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(agents)
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userRole = (session?.user as { role?: string })?.role ?? ''
    if (!['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, commission, commissionOpenTrip, commissionPrivateCharter, salespersonId, country, address, email, whatsapp, note, contract, contractFile, contractFileName } = body

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
        salespersonId: salespersonId || null,
        country:          country          || null,
        address:          address          || null,
        email:            email            || null,
        whatsapp:         whatsapp         || null,
        note:             note             || null,
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
    }).catch(() => {})

    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}
