import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { put } from '@vercel/blob'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const MAX_SIZE = 20 * 1024 * 1024 // 20MB — covers brochures/deck plans/high-res photos

// Uploads the binary for an image or PDF media-kit file to Vercel Blob and returns its
// public URL + metadata. The caller then POSTs to /api/marketing/media to persist the row.
// Video/reel entries skip this route entirely — they're external embed links (§ plan).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'File hosting is not configured (BLOB_READ_WRITE_TOKEN missing)' }, { status: 500 })
  }

  const form = await req.formData()
  const file = form.get('file')
  const yachtId = form.get('yachtId')
  const categoryId = form.get('categoryId')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf'
  if (!isImage && !isPdf) return NextResponse.json({ error: 'File must be an image or a PDF' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File must be under 20MB' }, { status: 400 })

  const folder = typeof yachtId === 'string' && yachtId ? yachtId : 'fleet'
  const cat = typeof categoryId === 'string' && categoryId ? categoryId : 'misc'
  const blob = await put(`media-kit/${folder}/${cat}/${Date.now()}-${file.name}`, file, { access: 'public' })

  return NextResponse.json({ url: blob.url, sizeBytes: file.size, mimeType: file.type })
}
