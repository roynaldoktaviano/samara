import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { presignUpload, r2PublicUrl, isR2Configured } from '@/lib/r2'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const MAX_SIZE = 50 * 1024 * 1024 // 50MB — covers brochures/deck plans (image-heavy PDFs can get big) and high-res photos
const ALLOWED_TYPES = [/^image\//, /^application\/pdf$/]

// Issues a presigned PUT URL so the browser can upload straight to Cloudflare R2,
// bypassing this route (and its ~4.5MB serverless body-size limit) for the actual
// bytes — a plain FormData POST here used to fail/hang on anything past a few MB
// (e.g. a 12MB PDF). The caller PUTs the file to the presigned URL, then POSTs to
// /api/marketing/media to persist the row using the returned publicUrl.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const { pathname, contentType, size } = await req.json().catch(() => ({}))
  if (typeof pathname !== 'string' || !pathname.startsWith('media-kit/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (typeof contentType !== 'string' || !ALLOWED_TYPES.some(re => re.test(contentType))) {
    return NextResponse.json({ error: 'File must be an image or a PDF' }, { status: 400 })
  }
  if (typeof size === 'number' && size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 })
  }

  try {
    const url = await presignUpload(pathname, contentType)
    return NextResponse.json({ url, publicUrl: r2PublicUrl(pathname) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
