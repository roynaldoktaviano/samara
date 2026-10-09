import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getDb } from '@/lib/get-db'
import { BOT_RESOURCES, botSafeFields, botSelect, delegateName, sanitizeForBot } from '@/lib/bot-access'

const RESERVED = new Set(['limit', 'cursor', 'from', 'to'])

function parseFilterValue(type: string, raw: string): unknown {
  if (raw === 'null') return null
  if (type === 'Int') return parseInt(raw, 10)
  if (type === 'Float') return parseFloat(raw)
  if (type === 'Boolean') return raw === 'true'
  if (type === 'DateTime') return new Date(raw)
  return raw
}

// Read-only list endpoint for whitelisted resources (see src/lib/bot-access.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const auth = await requireRole(['BOT', 'ADMIN', 'SUPER_ADMIN'])
  if (!auth.ok) return auth.response

  const { resource } = await params
  const def = BOT_RESOURCES[resource]
  if (!def) return NextResponse.json({ error: 'Unknown resource — see GET /api/bot' }, { status: 404 })

  const fields = botSafeFields(def.model)
  const fieldMap = new Map(fields.map(f => [f.name, f]))
  const sp = req.nextUrl.searchParams

  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '100', 10) || 100, 1), 500)
  const cursor = sp.get('cursor')

  const where: Record<string, unknown> = {}
  const dateField = def.dateField && fieldMap.has(def.dateField) ? def.dateField
    : fieldMap.has('createdAt') ? 'createdAt' : null
  const from = sp.get('from'), to = sp.get('to')
  if (dateField && (from || to)) {
    const range: Record<string, Date> = {}
    if (from) range.gte = new Date(from)
    if (to) range.lte = new Date(to)
    if (Object.values(range).some(d => isNaN(d.getTime()))) {
      return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 })
    }
    where[dateField] = range
  }
  for (const [key, raw] of sp.entries()) {
    if (RESERVED.has(key)) continue
    const f = fieldMap.get(key)
    // Unknown or sensitive columns are rejected rather than silently ignored, so a bot can't
    // probe hidden columns via filters (e.g. ?passport=…) and can tell when a filter is wrong.
    if (!f) return NextResponse.json({ error: `Unknown or non-filterable field: ${key}` }, { status: 400 })
    where[key] = parseFilterValue(f.type, raw)
  }

  const orderBy = dateField ? [{ [dateField]: 'desc' }, { id: 'desc' }] : [{ id: 'desc' }]

  const db = await getDb(auth.session)
  const delegate = (db as unknown as Record<string, { findMany: (args: unknown) => Promise<Record<string, unknown>[]> }>)[delegateName(def.model)]
  try {
    const rows = await delegate.findMany({
      where: def.baseWhere ? { AND: [def.baseWhere, where] } : where,
      select: botSelect(def.model),
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows
    return NextResponse.json({
      resource,
      count: data.length,
      nextCursor: hasMore ? data[data.length - 1].id : null,
      data: sanitizeForBot(data, def.model),
    })
  } catch (err) {
    console.error('[api/bot] list failed', resource, err)
    return NextResponse.json({ error: 'Query failed — check filter values' }, { status: 400 })
  }
}
