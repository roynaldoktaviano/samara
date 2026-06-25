import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const KEY = 'tnc_pdf'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) return null
  return session
}

// GET — info only (no binary)
export async function GET() {
  const db = await getDb()
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const setting = await db.systemSetting.findUnique({
    where: { key: KEY },
    select: { fileName: true, mimeType: true, updatedAt: true, updatedBy: true, blobValue: false },
  })

  if (!setting?.fileName) return NextResponse.json({ uploaded: false })

  return NextResponse.json({
    uploaded:   true,
    fileName:   setting.fileName,
    updatedAt:  setting.updatedAt,
    updatedBy:  setting.updatedBy,
  })
}

// POST — upload new PDF
export async function POST(request: NextRequest) {
  const db = await getDb()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  await db.systemSetting.upsert({
    where:  { key: KEY },
    create: { key: KEY, blobValue: buffer, mimeType: 'application/pdf', fileName: file.name, updatedBy: session.user.name ?? session.user.email ?? 'Admin' },
    update: { blobValue: buffer, mimeType: 'application/pdf', fileName: file.name, updatedBy: session.user.name ?? session.user.email ?? 'Admin' },
  })

  return NextResponse.json({ ok: true, fileName: file.name })
}

// DELETE — remove PDF
export async function DELETE() {
  const db = await getDb()
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.systemSetting.deleteMany({ where: { key: KEY } })
  return NextResponse.json({ ok: true })
}
