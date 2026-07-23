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

// GET — list persisted media-kit folders (empty ones included, unlike folders derived
// from MediaFile.folder values, which only "exist" once they hold at least one file)
export async function GET() {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const folders = await db.mediaFolder.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json(folders)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 }) }
}

// POST — create a folder up front, so it persists even before any file is uploaded into it
export async function POST(request: NextRequest) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json().catch(() => ({}))
    const { yachtId, categoryId, name } = body

    if (!categoryId || typeof categoryId !== 'string') return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    const category = await db.mediaCategory.findUnique({ where: { id: categoryId } })
    if (!category) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })

    const scopedYachtId = yachtId || null
    const duplicate = await db.mediaFolder.findFirst({
      where: { yachtId: scopedYachtId, categoryId, name: { equals: trimmedName, mode: 'insensitive' } },
    })
    if (duplicate) return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })

    const folder = await db.mediaFolder.create({ data: { yachtId: scopedYachtId, categoryId, name: trimmedName } })
    return NextResponse.json(folder, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 }) }
}
