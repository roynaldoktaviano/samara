import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { getOrCreateTransferReceiveToken, resolveBaseUrl } from '@/lib/purchasing/receiveLink'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

// Generates (or reuses) a no-login link crew can open to confirm receiving this transfer —
// see src/app/crew-receive/[token]/page.tsx. Mirrors src/app/api/customers/[id]/generate-link/route.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const transfer = await db.stockTransfer.findUnique({ where: { id }, select: { status: true } })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'DISPATCHED') return NextResponse.json({ error: 'Transfer harus berstatus In Transit dulu' }, { status: 400 })

  const { token, expiresAt } = await getOrCreateTransferReceiveToken(db, id)
  const link = `${resolveBaseUrl(req)}/crew-receive/${token}`

  return NextResponse.json({ link, expiresAt })
}
