import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET() {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json([], { status: 401 })

    const notifications = await db.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json(notifications)
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// Mark all as read
export async function PATCH() {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await db.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error marking notifications read:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
