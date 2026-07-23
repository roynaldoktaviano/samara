import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return null
  return session
}

// DELETE — only allowed while the folder is empty, so deleting it can't silently strand
// files that still carry its name in their (plain-string) MediaFile.folder field.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const folder = await db.mediaFolder.findUnique({ where: { id } })
    if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const fileCount = await db.mediaFile.count({
      where: { yachtId: folder.yachtId, categoryId: folder.categoryId, folder: { equals: folder.name, mode: 'insensitive' } },
    })
    if (fileCount > 0) return NextResponse.json({ error: 'Move or delete the files inside this folder first' }, { status: 409 })

    await db.mediaFolder.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 }) }
}
