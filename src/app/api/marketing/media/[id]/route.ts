import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { del } from '@vercel/blob'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return null
  return session
}

// DELETE — remove a media-kit file's row, and its Blob object if it's a real upload
// (external video/reel embed links have no Blob object to clean up)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const file = await db.mediaFile.findUnique({ where: { id } })
    if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (file.sizeBytes != null) {
      await del(file.url).catch(e => console.error('[marketing/media] blob delete failed:', e))
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
