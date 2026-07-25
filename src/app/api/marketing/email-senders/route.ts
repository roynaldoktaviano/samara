import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const senders = await db.emailSenderIdentity.findMany({ orderBy: { fromName: 'asc' } })
  return NextResponse.json(senders)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { fromEmail, fromName } = await req.json()
  if (!fromEmail?.trim()) return NextResponse.json({ error: 'From email is required' }, { status: 400 })

  const existing = await db.emailSenderIdentity.findFirst({
    where: { fromEmail: { equals: fromEmail.trim(), mode: 'insensitive' } },
  })
  if (existing) return NextResponse.json(existing)

  const sender = await db.emailSenderIdentity.create({
    data: { fromEmail: fromEmail.trim(), fromName: (fromName ?? '').trim() },
  })
  return NextResponse.json(sender, { status: 201 })
}
