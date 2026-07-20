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
    const search = searchParams.get('search')
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '500') || 500, 2000)
    const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
    const sort   = searchParams.get('sort') === 'asc' ? 'asc' : 'desc'

    const where: Record<string, unknown> = { deletedAt: null }
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: sort },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.lead.count({ where }),
    ])

    const unsubscribed = await db.emailUnsubscribe.findMany({ select: { email: true } })
    const unsubscribedSet = new Set(unsubscribed.map(u => u.email.toLowerCase()))
    const result = leads.map(l => ({
      ...l,
      isSubscribed: l.email ? !unsubscribedSet.has(l.email.toLowerCase()) : null,
    }))

    // Body stays a plain array for existing callers; the true count (which
    // can exceed the capped `take`) rides along as a header for callers that
    // display it, e.g. the "N registered" label on the Leads page.
    return NextResponse.json(result, { headers: { 'X-Total-Count': String(total) } })
  } catch (error) {
    console.error('Error fetching leads:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { firstName, lastName, nationality, email, phone, notes } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const lead = await db.lead.create({
      data: { name, firstName, lastName, nationality, email, phone, notes },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Lead', entityId: lead.id,
      detail: `Add lead: ${lead.name}`,
    }, db).catch(() => {})

    return NextResponse.json(lead, { status: 201 })
  } catch (error) {
    console.error('Error creating lead:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
