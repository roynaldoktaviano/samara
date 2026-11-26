import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { putToR2, isR2Configured } from '@/lib/r2'
import {
  canManageCollaboration, COLLAB_CONTRACT_MAX_SIZE, COLLAB_CONTRACT_PREFIX, COLLAB_CONTRACT_TYPES,
} from '@/lib/collaboration-budget'

/**
 * POST (multipart, field `file`) — upload one Collaboration Book contract (image or PDF, ≤10MB)
 * to R2 and return its public URL. Not tied to a booking yet: the wizard uploads before the
 * booking exists, then sends the URLs in `collaborationContracts` on create / PUT contracts.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session?.user?.id || !canManageCollaboration(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!COLLAB_CONTRACT_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, WEBP or PDF files are allowed' }, { status: 400 })
  }
  if (file.size > COLLAB_CONTRACT_MAX_SIZE) return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })

  const safe = (file.name || 'contract').replace(/[^\w.\-]+/g, '_').slice(-120)
  try {
    const url = await putToR2(`${COLLAB_CONTRACT_PREFIX}${Date.now()}-${safe}`, Buffer.from(await file.arrayBuffer()), file.type)
    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
  }
}
