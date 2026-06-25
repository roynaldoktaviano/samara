import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string })?.role ?? ''
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const logs = await db.calendarAccessLog.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, ip: true, userAgent: true, isSuspicious: true, createdAt: true },
    })

    const totalAccess    = logs.length
    const suspiciousCount = logs.filter(l => l.isSuspicious).length
    const lastAccess     = logs[0]?.createdAt ?? null

    // Access per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentLogs = await db.calendarAccessLog.findMany({
      where: { agentId: id, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, isSuspicious: true },
      orderBy: { createdAt: 'asc' },
    })

    const perDay: Record<string, { total: number; suspicious: number }> = {}
    recentLogs.forEach(l => {
      const day = l.createdAt.toISOString().split('T')[0]
      if (!perDay[day]) perDay[day] = { total: 0, suspicious: 0 }
      perDay[day].total++
      if (l.isSuspicious) perDay[day].suspicious++
    })

    return NextResponse.json({
      totalAccess,
      suspiciousCount,
      lastAccess,
      recentLogs: logs.slice(0, 20),
      perDay,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
