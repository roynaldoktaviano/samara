import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { parseTodoInput, attachmentsOf, deleteTodoFiles } from '@/lib/todo'

// Only the owner can touch a Todo — a row belonging to someone else is reported as 404
// rather than 403 so ids of other users' tasks can't be probed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const existing = await db.todo.findFirst({ where: { id, userId: session.user.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = parseTodoInput(body, session.user.id, existing.completedAt)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // Cross-check the range when only one end is being changed.
  const start = 'startDate' in parsed.data ? parsed.data.startDate as Date | null : existing.startDate
  const due = 'dueDate' in parsed.data ? parsed.data.dueDate as Date | null : existing.dueDate
  if (start && due && due < start) return NextResponse.json({ error: 'End date must be on or after the start date' }, { status: 400 })

  const todo = await db.todo.update({ where: { id }, data: parsed.data })
  if ('attachments' in parsed.data) {
    const kept = new Set(attachmentsOf(todo.attachments).map(a => a.url))
    await deleteTodoFiles(attachmentsOf(existing.attachments).filter(a => !kept.has(a.url)))
  }
  return NextResponse.json({ todo })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const existing = await db.todo.findFirst({ where: { id, userId: session.user.id }, select: { attachments: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.todo.delete({ where: { id } })
  await deleteTodoFiles(attachmentsOf(existing.attachments))
  return NextResponse.json({ ok: true })
}
