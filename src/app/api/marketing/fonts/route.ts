import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { putToR2, isR2Configured } from '@/lib/r2'
import { FONT_FORMATS, sanitizeFontFamily, sanitizeFallback } from '@/lib/email-fonts'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']
const DEFAULT_FALLBACK = 'Arial, Helvetica, sans-serif'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const fonts = await db.emailFont.findMany({ orderBy: [{ family: 'asc' }, { weight: 'asc' }, { style: 'asc' }] })
  return NextResponse.json(fonts)
}

/** Multipart upload: file + family (+ optional weight, style, fallback). Font files are hosted on R2 like email images. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File hosting is not configured (R2 env vars missing)' }, { status: 500 })
  }
  const db = await getDb(session)

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const fmt = FONT_FORMATS[ext]
  if (!fmt) return NextResponse.json({ error: 'Font must be a .woff2, .woff, .ttf, or .otf file' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Font file must be under 5MB' }, { status: 400 })

  const family = sanitizeFontFamily(String(form.get('family') ?? ''))
  if (!family) return NextResponse.json({ error: 'Font family name is required' }, { status: 400 })
  const weight = Number(form.get('weight') ?? 400)
  if (!Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) {
    return NextResponse.json({ error: 'Weight must be 100–900' }, { status: 400 })
  }
  const style = form.get('style') === 'italic' ? 'italic' : 'normal'
  const fallback = sanitizeFallback(String(form.get('fallback') ?? '')) || DEFAULT_FALLBACK

  const bytes = Buffer.from(await file.arrayBuffer())
  const fileUrl = await putToR2(`marketing/fonts/${Date.now()}-${file.name}`, bytes, fmt.mime)

  const font = await db.emailFont.create({
    data: {
      family, weight, style, fallback, fileUrl,
      format: fmt.format,
      fileName: file.name,
      createdByUserId: session.user.id,
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
    },
  })
  return NextResponse.json(font, { status: 201 })
}
