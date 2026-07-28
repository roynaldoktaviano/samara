import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { del } from '@vercel/blob'
import { deleteFromR2, keyFromR2Url } from '@/lib/r2'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

// Files uploaded before the Cloudflare R2 migration are still hosted on Vercel
// Blob — delete from whichever store the URL actually points at.
async function deleteStoredFile(url: string) {
  const r2Key = keyFromR2Url(url)
  if (r2Key) return deleteFromR2(r2Key)
  return del(url).catch(e => console.error('[marketing/media] blob delete failed:', e))
}

// PATCH — move a file into a different folder (or to the category root with folderId: null)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    if (!('folderId' in body)) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    const { folderId } = body as { folderId: string | null }

    const file = await db.mediaFile.findUnique({ where: { id } })
    if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (folderId) {
      const folder = await db.mediaFolder.findUnique({ where: { id: folderId } })
      if (!folder || folder.categoryId !== file.categoryId || (folder.yachtId ?? null) !== (file.yachtId ?? null)) {
        return NextResponse.json({ error: 'Invalid target folder' }, { status: 400 })
      }
    }

    const updated = await db.mediaFile.update({
      where: { id },
      data: { folderId: folderId || null },
      include: { uploadedBy: { select: { name: true, email: true } }, yacht: { select: { id: true, name: true } } },
    })
    return NextResponse.json(updated)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to move media file' }, { status: 500 }) }
}

// DELETE — remove a media-kit file's row, and its stored object if it's a real upload
// (external video/reel embed links have no object to clean up)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const file = await db.mediaFile.findUnique({ where: { id } })
    if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (file.sizeBytes != null) {
      await deleteStoredFile(file.url)
    }

    await db.mediaFile.delete({ where: { id } })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'DELETE', entity: 'MediaFile', entityId: id,
      detail: `Delete media kit file: ${file.name}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete media file' }, { status: 500 }) }
}
