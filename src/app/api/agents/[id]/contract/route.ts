import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const agent = await db.agent.findUnique({
      where: { id },
      select: { contractFile: true, contractFileName: true },
    })
    if (!agent?.contractFile) return NextResponse.json({ error: 'No contract file' }, { status: 404 })

    // contractFile is stored as base64 data URL: "data:application/pdf;base64,..."
    const base64 = agent.contractFile.split(',')[1] ?? agent.contractFile
    const buf = Buffer.from(base64, 'base64')
    const filename = agent.contractFileName ?? 'contract.pdf'

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (error) {
    console.error('Error serving contract file:', error)
    return NextResponse.json({ error: 'Failed to serve contract' }, { status: 500 })
  }
}
