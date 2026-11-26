import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isR2Configured } from '@/lib/r2'
import { PRIVATE_FILE_MAX_SIZE, PRIVATE_FILE_SCOPES, PRIVATE_FILE_TYPES, type PrivateFileScope } from '@/lib/private-files'
import { canUploadPrivate, putPrivateFile } from '@/lib/private-files-server'

/**
 * POST (multipart: `file`, `scope`) — store one HR file privately in R2.
 * Returns { ref } — a `/api/files/private/…` reference to save in the DB.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const form = await req.formData().catch(() => null)
  const scope = String(form?.get('scope') ?? '') as PrivateFileScope
  if (!PRIVATE_FILE_SCOPES.includes(scope)) return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  if (!canUploadPrivate(scope, role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const mime = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (!PRIVATE_FILE_TYPES.includes(mime)) return NextResponse.json({ error: 'Only photos or PDF files are allowed' }, { status: 400 })
  if (file.size > PRIVATE_FILE_MAX_SIZE) return NextResponse.json({ error: 'File must be under 15MB' }, { status: 400 })

  try {
    const ref = await putPrivateFile(scope, Buffer.from(await file.arrayBuffer()), mime, file.name)
    return NextResponse.json({ ref })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
