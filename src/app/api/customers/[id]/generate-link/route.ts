import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import crypto from 'crypto'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await (prisma.customer as any).update({
    where: { id },
    data: { guestFormToken: token, guestFormExpiresAt: expiresAt },
  })

  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const link = `${baseUrl}/guest-form/${token}`

  return NextResponse.json({ link, expiresAt })
}
