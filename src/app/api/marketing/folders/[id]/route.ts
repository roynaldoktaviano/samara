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
  return del(url).catch(e => console.error('[marketing/folders] blob delete failed:', e))
}

// DELETE — an empty folder is removed directly. A folder with files/subfolders is only
// removed with ?force=1 (the UI sends it after the user ticks the confirmation checkbox):
// then every subfolder and every file inside, at any depth, is deleted too — including
// the stored objects, so nothing is left orphaned in R2/Blob.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const force = request.nextUrl.searchParams.get('force') === '1'
    const folder = await db.mediaFolder.findUnique({ where: { id } })
    if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Collect this folder and all descendants (breadth-first).
    const folderIds = [id]
    for (let frontier = [id]; frontier.length;) {
      const children = await db.mediaFolder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } })
      frontier = children.map(c => c.id)
      folderIds.push(...frontier)
    }
    const files = await db.mediaFile.findMany({ where: { folderId: { in: folderIds } }, select: { id: true, url: true, sizeBytes: true } })

    if (!force && (files.length > 0 || folderIds.length > 1)) {
      return NextResponse.json({ error: 'This folder still has files or subfolders inside it' }, { status: 409 })
    }

    await Promise.all(files.filter(f => f.sizeBytes != null).map(f => deleteStoredFile(f.url)))
    await db.$transaction([
      db.mediaFile.deleteMany({ where: { id: { in: files.map(f => f.id) } } }),
      // Subfolders go with it via the parent onDelete: Cascade.
      db.mediaFolder.delete({ where: { id } }),
    ])

    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'DELETE', entity: 'MediaFolder', entityId: id,
      detail: `Delete media kit folder: ${folder.name} (${files.length} file${files.length === 1 ? '' : 's'}, ${folderIds.length - 1} subfolder${folderIds.length - 1 === 1 ? '' : 's'})`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true, deletedFiles: files.length, deletedFolders: folderIds.length })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 }) }
}
