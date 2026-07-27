import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB — direct-to-blob client upload, so this isn't limited by the ~4.5MB serverless body cap

// Issues a client token so the browser can PUT chat attachments straight to Vercel
// Blob (same reasoning as the Media Kit upload — see its route for the story on
// why a plain server-route POST fails on anything but tiny files).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'File hosting is not configured (BLOB_READ_WRITE_TOKEN missing)' }, { status: 500 })
  }

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('whatsapp/')) throw new Error('Invalid path')
        return {
          allowedContentTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
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
