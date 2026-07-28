import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { presignUpload, r2PublicUrl, isR2Configured } from '@/lib/r2'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const { pathname, contentType, size } = await req.json().catch(() => ({}))
  if (typeof pathname !== 'string' || !pathname.startsWith('email-inbox/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (typeof size === 'number' && size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 20MB' }, { status: 400 })
  }

  try {
    const url = await presignUpload(pathname, contentType || 'application/octet-stream')
    return NextResponse.json({ url, publicUrl: r2PublicUrl(pathname) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
