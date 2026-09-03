import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { presignUpload, r2PublicUrl, isR2Configured } from '@/lib/r2'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const MAX_SIZE = 200 * 1024 * 1024 // 200MB — covers Reels/video ads, not just stills
const ALLOWED_TYPES = [/^image\//, /^video\//, /^application\/pdf$/]

// Same presigned-PUT pattern as /api/marketing/media/upload: the browser uploads straight
// to R2, then POSTs to /api/marketing/content/[id]/versions to record the version row.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const { pathname, contentType, size } = await req.json().catch(() => ({}))
  if (typeof pathname !== 'string' || !pathname.startsWith('content-studio/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (typeof contentType !== 'string' || !ALLOWED_TYPES.some(re => re.test(contentType))) {
    return NextResponse.json({ error: 'File must be an image, video, or PDF' }, { status: 400 })
  }
  if (typeof size === 'number' && size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 200MB' }, { status: 400 })
  }

  try {
    const url = await presignUpload(pathname, contentType)
    return NextResponse.json({ url, publicUrl: r2PublicUrl(pathname) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
