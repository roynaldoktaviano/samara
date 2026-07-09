import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const destinations = await db.destination.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(destinations)
  } catch (error) {
    console.error('Error fetching destinations:', error)
    return NextResponse.json({ error: 'Failed to fetch destinations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { name, region } = body
    if (!name || !name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const existing = await db.destination.findUnique({ where: { name: name.trim() } })
    if (existing) return NextResponse.json({ error: `Destination "${name.trim()}" already exists` }, { status: 409 })

    const destination = await db.destination.create({
      data: { name: name.trim(), region: region?.trim() || null },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Destination', entityId: destination.id,
      detail: `Add destination: ${destination.name}`,
    }, db).catch(() => {})

    return NextResponse.json(destination, { status: 201 })
  } catch (error) {
    console.error('Error creating destination:', error)
    return NextResponse.json({ error: 'Failed to create destination' }, { status: 500 })
  }
}
