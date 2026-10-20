import { NextRequest, NextResponse } from 'next/server'
import { recordBotCall, requireBotAccess } from '@/lib/bot-api-key'
import { getDb } from '@/lib/get-db'
import { BOT_RESOURCES, botSelect, delegateName, sanitizeForBot } from '@/lib/bot-access'

// Read-only single-record endpoint for whitelisted resources (see src/lib/bot-access.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const auth = await requireBotAccess()
  if (!auth.ok) return auth.response

  const { resource, id } = await params
  const def = BOT_RESOURCES[resource]
  if (!def) return NextResponse.json({ error: 'Unknown resource — see GET /api/bot' }, { status: 404 })

  const db = await getDb(auth.session)
  const delegate = (db as unknown as Record<string, { findFirst: (args: unknown) => Promise<Record<string, unknown> | null> }>)[delegateName(def.model)]
  const row = await delegate.findFirst({ where: def.baseWhere ? { AND: [def.baseWhere, { id }] } : { id }, select: botSelect(def.model) })
  await recordBotCall(auth, req.nextUrl, resource, row ? 1 : 0)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ resource, data: sanitizeForBot(row, def.model) })
}
