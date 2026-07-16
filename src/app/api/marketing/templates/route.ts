import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { renderBlocksToHtml, normalizeDesign } from '@/lib/email-builder'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const templates = await db.emailTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, description: true, bodyHtml: true, createdByName: true, createdAt: true, updatedAt: true,
      _count: { select: { campaigns: true } },
    },
  })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, description, blocksJson } = await request.json()
  if (!name?.trim() || !blocksJson) {
    return NextResponse.json({ error: 'name and blocksJson are required' }, { status: 400 })
  }
  const design = normalizeDesign(blocksJson)

  const template = await db.emailTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      blocksJson: JSON.parse(JSON.stringify(design)),
      bodyHtml: renderBlocksToHtml(design.blocks, design.settings),
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
    },
  })
  return NextResponse.json(template, { status: 201 })
}
