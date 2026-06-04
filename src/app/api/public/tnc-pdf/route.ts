import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Serves the TnC PDF — accessible from invoice print page (no auth needed since invoice is already gated)
export async function GET() {
  const setting = await db.systemSetting.findUnique({ where: { key: 'tnc_pdf' } })

  if (!setting?.blobValue) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(setting.blobValue, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'inline; filename="terms-and-conditions.pdf"',
      'Cache-Control':       'private, max-age=300',
    },
  })
}
