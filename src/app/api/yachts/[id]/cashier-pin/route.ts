import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

async function auth() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return { session, db: await getDb(session) }
}

// GET → whether this yacht's cashier terminal has a PIN (never returns the PIN itself).
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const t = await a.db.cashierTerminal.findUnique({ where: { yachtId: id }, select: { pinSetAt: true, pinLength: true } })
  return NextResponse.json({ isSet: !!t, pinSetAt: t?.pinSetAt ?? null, pinLength: t?.pinLength ?? null })
}

// PUT { pin } → set/replace the PIN. Bumping pinSetAt signs every open terminal of this yacht out.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { pin } = await req.json().catch(() => ({}))
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 })

  const yacht = await a.db.yacht.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!yacht) return NextResponse.json({ error: 'Yacht not found' }, { status: 404 })

  const data = { pinHash: await bcrypt.hash(pin, 10), pinLength: pin.length, pinSetAt: new Date(), pinSetById: a.session.user.id }
  await a.db.cashierTerminal.upsert({ where: { yachtId: id }, create: { yachtId: id, ...data }, update: data })
  return NextResponse.json({ ok: true })
}
