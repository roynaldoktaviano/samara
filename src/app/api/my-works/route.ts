import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { parseTodoInput, todoUploadPrefix } from '@/lib/todo'

// "My Works" — personal task board. Every logged-in user only ever sees/edits their own
// Todo rows (scoped by session.user.id), so there is no role gate beyond being logged in.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const todos = await db.todo.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ todos, uploadPrefix: todoUploadPrefix(session.user.id) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json().catch(() => ({}))
  if (!('title' in body)) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const parsed = parseTodoInput(body, session.user.id)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // New tasks go to the top of their status column.
  const status = (parsed.data.status as string | undefined) ?? 'TODO'
  const first = await db.todo.findFirst({
    where: { userId: session.user.id, status: status as never },
    orderBy: { sortOrder: 'asc' }, select: { sortOrder: true },
  })

  const todo = await db.todo.create({
    data: {
      ...(parsed.data as object),
      title: parsed.data.title as string,
      userId: session.user.id,
      sortOrder: (first?.sortOrder ?? 1) - 1,
    },
  })
  return NextResponse.json({ todo }, { status: 201 })
}
