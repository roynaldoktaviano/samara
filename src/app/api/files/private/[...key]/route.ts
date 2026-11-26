import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { presignDownload } from '@/lib/r2'
import { canViewPrivate } from '@/lib/private-files-server'

/**
 * GET /api/files/private/<scope>/<id>/<name> — open a private HR file. Checks the staff
 * session + role for that scope, then redirects to a 5-minute signed R2 URL.
 * `?download=<filename>` makes the browser save it instead of showing it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key: parts } = await params
  if (!parts?.length || parts.length < 3 || parts.some(p => !p || p === '..' || p === '.')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!canViewPrivate(parts[0], role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const download = req.nextUrl.searchParams.get('download')
  const url = await presignDownload(`private/${parts.join('/')}`, {
    expiresInSeconds: 300,
    downloadName: download ? download.slice(0, 150) : undefined,
  })
  const res = NextResponse.redirect(url, 302)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
