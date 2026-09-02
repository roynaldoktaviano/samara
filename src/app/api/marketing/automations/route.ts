import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const automations = await db.automation.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, description: true, triggerType: true, offsetDays: true, status: true,
      templateId: true, template: { select: { name: true } }, subject: true, fromEmail: true, fromName: true,
      createdByName: true, createdAt: true, updatedAt: true,
      enrollments: { select: { status: true } },
    },
  })
  const withStats = automations.map(({ enrollments, ...a }) => ({
    ...a,
    sentCount: enrollments.filter(e => e.status === 'SENT').length,
    pendingCount: enrollments.filter(e => e.status === 'PENDING').length,
    failedCount: enrollments.filter(e => e.status === 'FAILED').length,
  }))
  return NextResponse.json(withStats)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, description, triggerType, offsetDays, templateId, subject, fromEmail, fromName, status } = await request.json()
  if (!name?.trim() || !triggerType || !templateId || !subject?.trim() || !fromEmail?.trim()) {
    return NextResponse.json({ error: 'name, triggerType, templateId, subject and fromEmail are required' }, { status: 400 })
  }

  const automation = await db.automation.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      triggerType,
      offsetDays: Number.isFinite(offsetDays) ? offsetDays : 0,
      status: status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      templateId,
      subject: subject.trim(),
      fromEmail: fromEmail.trim(),
      fromName: fromName?.trim() || null,
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
    },
  })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'CREATE', entity: 'Automation', entityId: automation.id,
    detail: `Create automation: ${automation.name}`,
  }, db).catch(() => {})

  return NextResponse.json(automation, { status: 201 })
}
