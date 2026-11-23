import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { DEAL_MAKER_SOURCES, getDealMakerSwitches, setDealMakerSwitch, type DealMakerSource } from '@/lib/deal-maker-switch'

// Admin on / off per automatic deal source (src/lib/deal-maker-switch.ts) — Chat › Leads Distribution.

async function adminSession() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  return session?.user?.id && role === 'ADMIN' ? session : null
}

export async function GET() {
  const session = await adminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  return NextResponse.json(await getDealMakerSwitches(db))
}

export async function PUT(req: NextRequest) {
  const session = await adminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { source, on } = await req.json().catch(() => ({})) as { source?: string; on?: unknown }
  if (!(DEAL_MAKER_SOURCES as readonly string[]).includes(source ?? '') || typeof on !== 'boolean') {
    return NextResponse.json({ error: 'Invalid source or value' }, { status: 400 })
  }
  const db = await getDb(session)
  await setDealMakerSwitch(db, source as DealMakerSource, on, session.user.id)
  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown', userRole: 'ADMIN',
    action: 'UPDATE', entity: 'SystemSetting', entityId: `deal_maker_off_${source}`,
    detail: `Automatic deals from ${source}: ${on ? 'ON' : 'OFF'}`,
  }, db).catch(() => {})
  return NextResponse.json(await getDealMakerSwitches(db))
}
