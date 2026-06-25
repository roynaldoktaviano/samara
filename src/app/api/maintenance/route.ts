import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  const db = await getDb()
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const yachtId = searchParams.get('yachtId')

    const where: any = {}
    if (status) where.status = status
    if (yachtId) where.yachtId = yachtId

    const maintenanceTasks = await db.maintenance.findMany({
      where,
      include: { yacht: { select: { name: true } } },
      orderBy: { scheduledDate: 'desc' },
    })

    const result = maintenanceTasks.map(({ yacht, ...task }) => ({
      ...task,
      yachtName: yacht.name,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching maintenance tasks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch maintenance tasks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const {
      yachtId,
      title,
      description,
      scheduledDate,
      cost
    } = body

    if (!yachtId || !title || !scheduledDate) {
      return NextResponse.json(
        { error: 'Yacht ID, title, and scheduled date are required' },
        { status: 400 }
      )
    }

    const maintenance = await db.maintenance.create({
      data: {
        yachtId,
        title,
        description,
        scheduledDate: new Date(scheduledDate),
        cost: cost ? parseFloat(cost) : null,
        status: 'scheduled'
      }
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Maintenance', entityId: maintenance.id,
      detail: `Jadwal maintenance: ${title}`,
    }).catch(() => {})

    return NextResponse.json(maintenance, { status: 201 })
  } catch (error) {
    console.error('Error creating maintenance task:', error)
    return NextResponse.json(
      { error: 'Failed to create maintenance task' },
      { status: 500 }
    )
  }
}
