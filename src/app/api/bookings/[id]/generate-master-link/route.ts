import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import crypto from 'crypto'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Reuse the existing link if it's still valid instead of always minting a new one — a
  // fresh token here silently breaks any copy of the old link already sent to the guest,
  // even though it still had weeks left before its real 30-day expiry. Only actually
  // generate a new token when there isn't one yet, or the old one has expired.
  const hasValidToken = booking.masterFormToken && booking.masterFormExpiresAt && booking.masterFormExpiresAt > new Date()
  const token     = hasValidToken ? booking.masterFormToken! : crypto.randomBytes(32).toString('hex')
  const expiresAt = hasValidToken ? booking.masterFormExpiresAt! : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  if (!hasValidToken) {
    await db.booking.update({
      where: { id },
      data: { masterFormToken: token, masterFormExpiresAt: expiresAt },
    })
  }

  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const fwdHost  = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const baseUrl  = fwdProto && fwdHost
    ? `${fwdProto}://${fwdHost}`
    : (process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`)
  const link = `${baseUrl}/guest-form/booking/${token}`

  return NextResponse.json({ link, expiresAt, reused: hasValidToken })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.booking.update({
    where: { id },
    data: { masterFormToken: null, masterFormExpiresAt: null },
  })

  return NextResponse.json({ ok: true })
}
