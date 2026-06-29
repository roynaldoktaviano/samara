import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function PATCH(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {

    const { id } = await params
    await db.notification.update({
      where: { id, userId: session.user.id },
      data: { isRead: true },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error marking notification read:', error)
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
