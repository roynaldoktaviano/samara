import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { parseAddress } from '@/lib/email-inbox'
import { normalizeEmailSignature } from '@/lib/email-signature'

// The signed-in user's own Chat › Email signature. Only the values are editable — the
// layout lives in src/lib/email-signature.ts.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, emailSignature: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const sharedFrom = tenantId ? await getTenantSecret(tenantId, 'emailInboxFromAddress') : null

  return NextResponse.json({
    signature: normalizeEmailSignature(user.emailSignature),
    defaults: { name: user.name ?? '', email: user.email, company: parseAddress(sharedFrom).name },
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const signature = normalizeEmailSignature(body?.signature)
  if (signature?.enabled && !signature.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const db = await getDb(session)
  await db.user.update({
    where: { id: session.user.id },
    data: { emailSignature: signature ? (signature as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
  })
  return NextResponse.json({ signature })
}
