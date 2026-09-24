import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { parseTemplateInput } from '../parse'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = parseTemplateInput(await req.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = await getDb(session)
  const existing = await db.whatsappTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const clash = await db.whatsappTemplate.findUnique({ where: { brand_name_language: { brand: existing.brand, name: parsed.name, language: parsed.language } } })
  if (clash && clash.id !== id) return NextResponse.json({ error: 'This template (name + language) is already registered for this brand' }, { status: 409 })

  return NextResponse.json(await db.whatsappTemplate.update({ where: { id }, data: parsed }))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  await db.whatsappTemplate.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
