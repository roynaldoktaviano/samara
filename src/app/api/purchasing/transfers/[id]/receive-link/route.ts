import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import crypto from 'crypto'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

// Generates (or reuses) a no-login link crew can open to confirm receiving this transfer —
// see src/app/crew-receive/[token]/page.tsx. Mirrors src/app/api/customers/[id]/generate-link/route.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const transfer = await db.stockTransfer.findUnique({ where: { id }, select: { status: true, receiveToken: true, receiveTokenExpiresAt: true } })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'DISPATCHED') return NextResponse.json({ error: 'Transfer harus berstatus In Transit dulu' }, { status: 400 })

  let token = transfer.receiveToken
  let expiresAt = transfer.receiveTokenExpiresAt
  const stillValid = token && expiresAt && new Date(expiresAt) > new Date()
  if (!stillValid) {
    token = crypto.randomBytes(32).toString('hex')
    expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
    await db.stockTransfer.update({ where: { id }, data: { receiveToken: token, receiveTokenExpiresAt: expiresAt } })
  }

  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const fwdHost  = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const baseUrl  = fwdProto && fwdHost
    ? `${fwdProto}://${fwdHost}`
    : (process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`)
  const link = `${baseUrl}/crew-receive/${token}`

  return NextResponse.json({ link, expiresAt })
}
