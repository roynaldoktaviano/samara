import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import crypto from 'crypto'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

// Generates (or reuses) a no-login link crew on a yacht can open to confirm receiving this
// PO's goods — see src/app/po-receive/[token]/page.tsx. Mirrors
// src/app/api/purchasing/transfers/[id]/receive-link/route.ts exactly.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const order = await db.purchaseOrder.findUnique({ where: { id }, select: { status: true, receiveToken: true, receiveTokenExpiresAt: true } })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(order.status))
    return NextResponse.json({ error: 'PO harus berstatus In Transit dulu' }, { status: 400 })

  let token = order.receiveToken
  let expiresAt = order.receiveTokenExpiresAt
  const stillValid = token && expiresAt && new Date(expiresAt) > new Date()
  if (!stillValid) {
    token = crypto.randomBytes(32).toString('hex')
    expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
    await db.purchaseOrder.update({ where: { id }, data: { receiveToken: token, receiveTokenExpiresAt: expiresAt } })
  }

  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const fwdHost  = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const baseUrl  = fwdProto && fwdHost
    ? `${fwdProto}://${fwdHost}`
    : (process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`)
  const link = `${baseUrl}/po-receive/${token}`

  return NextResponse.json({ link, expiresAt })
}
