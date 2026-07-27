import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { putToR2, isR2Configured } from '@/lib/r2'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

/**
 * Email images need a real public HTTPS URL (not the base64 data-URLs used
 * elsewhere in the app) — large inline images cause Gmail to clip messages
 * and hurt deliverability. Uses Cloudflare R2 for public hosting.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'Image hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const url = await putToR2(`marketing/${Date.now()}-${file.name}`, bytes, file.type)
  return NextResponse.json({ url })
}
