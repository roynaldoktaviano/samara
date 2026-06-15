import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const setting = await db.systemSetting.findUnique({ where: { key: 'tnc_pdf' } })

  if (!setting?.blobValue) {
    return new NextResponse(null, { status: 404 })
  }

  // Dynamic import prevents Turbopack from statically analyzing the spawn arguments
  const { spawnSync } = await import('child_process')
  const scriptParts = ['scripts', 'render-pdf-pages.js']
  const scriptPath = path.resolve(process.cwd(), ...scriptParts)
  const b64 = Buffer.from(setting.blobValue).toString('base64')

  const result = spawnSync('node', [scriptPath, b64], {
    maxBuffer: 80 * 1024 * 1024,
    timeout: 30_000,
  })

  if (result.status !== 0) {
    const err = result.stderr?.toString() || 'render failed'
    console.error('TnC render error:', err)
    return new NextResponse(null, { status: 500 })
  }

  try {
    const { images } = JSON.parse(result.stdout.toString())
    return NextResponse.json({ images }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}
