import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const automation = await db.automation.findUnique({ where: { id } })
  if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(automation)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const { name, description, triggerType, offsetDays, templateId, subject, fromEmail, fromName, status } = await req.json()

  const automation = await db.automation.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(triggerType !== undefined && { triggerType }),
      ...(offsetDays !== undefined && { offsetDays: Number.isFinite(offsetDays) ? offsetDays : 0 }),
      ...(templateId !== undefined && { templateId }),
      ...(subject !== undefined && { subject: subject.trim() }),
      ...(fromEmail !== undefined && { fromEmail: fromEmail.trim() }),
      ...(fromName !== undefined && { fromName: fromName?.trim() || null }),
      ...(status !== undefined && { status }),
    },
  }).catch(() => null)
  if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'UPDATE', entity: 'Automation', entityId: automation.id,
    detail: `Update automation: ${automation.name}`,
  }, db).catch(() => {})

  return NextResponse.json(automation)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const automation = await db.automation.delete({ where: { id } }).catch(() => null)
  if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'DELETE', entity: 'Automation', entityId: automation.id,
    detail: `Delete automation: ${automation.name}`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true })
}
