import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const yachtId = searchParams.get('yachtId')

    const where: any = {}
    if (status) where.status = status
    if (yachtId) where.yachtId = yachtId

    const maintenanceTasks = await db.maintenance.findMany({
      where,
      orderBy: { scheduledDate: 'desc' }
    })

    // Enhance with yacht names
    const tasksWithYachtNames = await Promise.all(
      maintenanceTasks.map(async (task) => {
        const yacht = await db.yacht.findUnique({
          where: { id: task.yachtId },
          select: { name: true }
        })
        return {
          ...task,
          yachtName: yacht?.name || 'Unknown'
        }
      })
    )

    return NextResponse.json(tasksWithYachtNames)
  } catch (error) {
    console.error('Error fetching maintenance tasks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch maintenance tasks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json(maintenance, { status: 201 })
  } catch (error) {
    console.error('Error creating maintenance task:', error)
    return NextResponse.json(
      { error: 'Failed to create maintenance task' },
      { status: 500 }
    )
  }
}
