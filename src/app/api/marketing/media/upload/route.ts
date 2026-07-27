import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const MAX_SIZE = 50 * 1024 * 1024 // 50MB — covers brochures/deck plans (image-heavy PDFs can get big) and high-res photos

// Issues a client token so the browser can PUT the file straight to Vercel Blob,
// bypassing this route (and its ~4.5MB serverless body-size limit) for the actual
// bytes — a plain FormData POST here used to fail/hang on anything past a few MB
// (e.g. a 12MB PDF). The caller still POSTs to /api/marketing/media afterwards to
// persist the row, same as before.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'File hosting is not configured (BLOB_READ_WRITE_TOKEN missing)' }, { status: 500 })
  }

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('media-kit/')) throw new Error('Invalid path')
        return {
          allowedContentTypes: ['image/*', 'application/pdf'],
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: false,
        }
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 400 })
  }
}
