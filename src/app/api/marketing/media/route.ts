import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const CATEGORIES = ['brochure', 'itinerary', 'deck_plan', 'rates_terms', 'press_kit', 'testimonial', 'photo', 'video', 'reel']
const TYPES = ['image', 'document', 'video']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return null
  return session
}

// GET — list media-kit files, optionally scoped to one yacht (+ fleet-wide items)
export async function GET(request: NextRequest) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const yachtId = searchParams.get('yachtId')

    const files = await db.mediaFile.findMany({
      where: yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : undefined,
      include: { uploadedBy: { select: { name: true, email: true } }, yacht: { select: { id: true, name: true } } },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json(files)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch media files' }, { status: 500 }) }
}

// POST — persist a media-kit file's metadata (the binary is already in Blob for
// image/document, or `url` is an external embed link for video/reel)
export async function POST(request: NextRequest) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json().catch(() => ({}))
    const { yachtId, category, type, name, url, folder, sizeBytes, mimeType } = body

    if (!category || !CATEGORIES.includes(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    if (!type || !TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    if (!name || typeof name !== 'string') return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    const file = await db.mediaFile.create({
      data: {
        yachtId: yachtId || null,
        category, type, name, url,
        folder: folder || null,
        sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : null,
        mimeType: mimeType || null,
        uploadedById: session.user.id,
      },
      include: { uploadedBy: { select: { name: true, email: true } }, yacht: { select: { id: true, name: true } } },
    })

    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'CREATE', entity: 'MediaFile', entityId: file.id,
      detail: `Upload media kit file: ${file.name} (${category})`,
    }, db).catch(() => {})

    return NextResponse.json(file, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to save media file' }, { status: 500 }) }
}
