import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { centralDb } from '@/lib/central-db'

// Rejected CF7 submissions (bad secret, unrecognized tenant, no usable
// name/email/phone) that never made it into a Lead — see src/lib/webhook-log.ts.
// Scoped to the logged-in user's own tenant so this page can't be used to peek
// at other tenants' failed submissions.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200') || 200, 1000)

  try {
    const logs = await centralDb.webhookFailureLog.findMany({
      where: { tenantSlug: session.user.tenantSlug ?? 'samara' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(logs)
  } catch (error) {
    console.error('Error fetching webhook failure logs:', error)
    return NextResponse.json({ error: 'Failed to fetch webhook failure logs' }, { status: 500 })
  }
}
