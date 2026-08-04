import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const WRITE_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [followUps, escalationTargets] = await Promise.all([
    db.purchaseFollowUp.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { name: true } },
        escalatedTo: { select: { name: true } },
      },
    }),
    db.user.findMany({ where: { role: { in: WRITE_ALLOWED as never[] } }, select: { id: true, name: true } }),
  ])

  return NextResponse.json({ followUps, escalationTargets })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !WRITE_ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { note, isEscalation, escalatedToId } = body as { note?: string; isEscalation?: boolean; escalatedToId?: string | null }

  if (!note?.trim()) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

  const order = await db.purchaseOrder.findUnique({ where: { id }, select: { poNumber: true, supplierName: true } })
  if (!order) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

  let cleanEscalatedToId: string | null = null
  if (isEscalation && escalatedToId) {
    const target = await db.user.findUnique({ where: { id: escalatedToId }, select: { id: true } })
    if (!target) return NextResponse.json({ error: 'Escalation target not found' }, { status: 400 })
    cleanEscalatedToId = target.id
  }

  const followUp = await db.purchaseFollowUp.create({
    data: {
      id: crypto.randomUUID(),
      orderId: id,
      note: note.trim(),
      isEscalation: !!isEscalation,
      escalatedToId: cleanEscalatedToId,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { name: true } }, escalatedTo: { select: { name: true } } },
  })

  if (cleanEscalatedToId) {
    db.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: cleanEscalatedToId,
        type: 'PO_FOLLOWUP_ESCALATION',
        title: 'PO Escalation',
        body: `${order.poNumber} (${order.supplierName ?? 'supplier'}): ${note.trim().slice(0, 120)}`,
        orderId: id,
      },
    }).catch(console.error)
  }

  return NextResponse.json(followUp)
}
