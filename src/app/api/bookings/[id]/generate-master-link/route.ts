import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import crypto from 'crypto'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token    = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await (db.booking as any).update({
    where: { id },
    data: { masterFormToken: token, masterFormExpiresAt: expiresAt },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const link = `${baseUrl}/guest-form/booking/${token}`

  return NextResponse.json({ link, expiresAt })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await (db.booking as any).update({
    where: { id },
    data: { masterFormToken: null, masterFormExpiresAt: null },
  })

  return NextResponse.json({ ok: true })
}
