import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

// DELETE — only allowed while the folder is empty (no direct files AND no subfolders), so
// deleting it never silently orphans or strands anything. Subfolders must be emptied and
// removed one at a time, bottom-up — no recursive delete.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const folder = await db.mediaFolder.findUnique({ where: { id } })
    if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [fileCount, childCount] = await Promise.all([
      db.mediaFile.count({ where: { folderId: id } }),
      db.mediaFolder.count({ where: { parentId: id } }),
    ])
    if (fileCount > 0 || childCount > 0) {
      return NextResponse.json({ error: 'This folder still has files or subfolders inside it' }, { status: 409 })
    }

    await db.mediaFolder.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 }) }
}
