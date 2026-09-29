import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sanitizeFontFamily, sanitizeFallback } from '@/lib/email-fonts'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// PUT — edit a face's metadata (the file itself is replaced by deleting and re-uploading).
// Renaming a family doesn't rewrite designs that already use the old name; those blocks
// simply stop matching and show their fallback font until re-picked in the builder.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json().catch(() => ({}))
  const data: { family?: string; weight?: number; style?: string; fallback?: string } = {}
  if (body.family !== undefined) {
    const family = sanitizeFontFamily(String(body.family))
    if (!family) return NextResponse.json({ error: 'Font family name is required' }, { status: 400 })
    data.family = family
  }
  if (body.weight !== undefined) {
    const weight = Number(body.weight)
    if (!Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) {
      return NextResponse.json({ error: 'Weight must be 100–900' }, { status: 400 })
    }
    data.weight = weight
  }
  if (body.style !== undefined) data.style = body.style === 'italic' ? 'italic' : 'normal'
  if (body.fallback !== undefined) data.fallback = sanitizeFallback(String(body.fallback)) || 'Arial, Helvetica, sans-serif'

  const font = await db.emailFont.update({ where: { id }, data })
  return NextResponse.json(font)
}

// Removes the face from the library only — the R2 file is deliberately kept, because
// emails that already went out still reference its URL in their @font-face rule. Future
// renders of a design still using the family just fall back to the web-safe stack.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const font = await db.emailFont.findUnique({ where: { id } })
  if (!font) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.emailFont.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
