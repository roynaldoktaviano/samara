import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { presignUpload, r2PublicUrl, isR2Configured } from '@/lib/r2'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// Presigned upload for the signature photo — each user may only write under their own prefix.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const { pathname, contentType, size } = await req.json().catch(() => ({}))
  if (typeof pathname !== 'string' || !pathname.startsWith(`email-signatures/${session.user.id}/`) || pathname.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (typeof contentType !== 'string' || !/^image\/(png|jpeg)$/.test(contentType)) {
    return NextResponse.json({ error: 'Photo must be a PNG or JPG image' }, { status: 400 })
  }
  if (typeof size === 'number' && size > MAX_SIZE) {
    return NextResponse.json({ error: 'Photo must be under 5MB' }, { status: 400 })
  }

  try {
    const url = await presignUpload(pathname, contentType)
    return NextResponse.json({ url, publicUrl: r2PublicUrl(pathname) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
