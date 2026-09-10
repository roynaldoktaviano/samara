import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getWhatsappDistributionMethod, setWhatsappDistributionMethod, type WhatsappDistributionMethod } from '@/lib/whatsapp-distribution'

// Admin-only settings screen for how new WhatsApp chats get handed out to sales —
// either round-robin across a chosen pool, or a fixed percentage split. See
// src/lib/whatsapp-distribution.ts for the assignment logic this configures.

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  const [salesUsers, participants, method] = await Promise.all([
    db.user.findMany({ where: { role: 'SALES' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    db.whatsappDistributionParticipant.findMany({ orderBy: { createdAt: 'asc' }, select: { userId: true, percentage: true } }),
    getWhatsappDistributionMethod(db),
  ])

  return NextResponse.json({ method, salesUsers, participants })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const method: string = body.method
  const rawParticipants: { userId?: string; percentage?: number }[] = Array.isArray(body.participants) ? body.participants : []

  if (method !== 'ROUND_ROBIN' && method !== 'PERCENTAGE') {
    return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
  }
  const participants = rawParticipants
    .filter((p): p is { userId: string; percentage?: number } => typeof p.userId === 'string')
    .map(p => ({ userId: p.userId, percentage: Math.max(0, Math.min(100, Math.round(Number(p.percentage) || 0))) }))
  if (participants.length === 0) {
    return NextResponse.json({ error: 'Select at least 1 sales rep for the rotation' }, { status: 400 })
  }

  const db = await getDb(session)

  const validUsers = await db.user.findMany({
    where: { id: { in: participants.map(p => p.userId) }, role: 'SALES' },
    select: { id: true },
  })
  const validIds = new Set(validUsers.map(u => u.id))
  if (participants.some(p => !validIds.has(p.userId))) {
    return NextResponse.json({ error: 'One or more selected sales reps are invalid' }, { status: 400 })
  }

  if (method === 'PERCENTAGE') {
    const total = participants.reduce((sum, p) => sum + p.percentage, 0)
    if (total !== 100) {
      return NextResponse.json({ error: `Percentages must add up to 100% (currently ${total}%)` }, { status: 400 })
    }
  }

  const keepIds = participants.map(p => p.userId)
  await db.$transaction([
    db.whatsappDistributionParticipant.deleteMany({ where: { userId: { notIn: keepIds } } }),
    ...participants.map(p => db.whatsappDistributionParticipant.upsert({
      where: { userId: p.userId },
      create: { userId: p.userId, percentage: method === 'PERCENTAGE' ? p.percentage : 0 },
      update: { percentage: method === 'PERCENTAGE' ? p.percentage : 0 },
    })),
  ])
  await setWhatsappDistributionMethod(db, method as WhatsappDistributionMethod, session.user.id)

  return NextResponse.json({ ok: true })
}
