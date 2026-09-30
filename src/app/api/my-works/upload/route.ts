import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { presignUpload, r2PublicUrl, isR2Configured } from '@/lib/r2'
import { TODO_ATTACHMENT_MAX_SIZE, todoUploadPrefix } from '@/lib/todo'

// Presigned R2 PUT for My Works task attachments — any logged-in user, but only into
// their own my-works/<userId>/ folder (the task PATCH re-checks that prefix too).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const { pathname, contentType, size } = await req.json().catch(() => ({}))
  if (typeof pathname !== 'string' || !pathname.startsWith(todoUploadPrefix(session.user.id)) || pathname.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (typeof size === 'number' && size > TODO_ATTACHMENT_MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 25MB' }, { status: 400 })
  }

  try {
    const url = await presignUpload(pathname, contentType || 'application/octet-stream')
    return NextResponse.json({ url, publicUrl: r2PublicUrl(pathname) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
