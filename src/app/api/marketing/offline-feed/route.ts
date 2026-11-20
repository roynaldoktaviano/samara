import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { buildGoogleFeed, FEED_COLUMNS, META_COLUMNS, metaRow } from '@/lib/ad-offline-feed'

const ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING', 'MARKETING_DIRECTOR']

// Preview of the go-live offline feed (never writes the ledger): ?tab=Samara|Otium|Mischief|Stage unknown|Excluded|Pending|Meta
// &format=csv downloads that tab (for the dual-write row-by-row comparison with the box feed); no tab = JSON summary.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ROLES.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const feed = await buildGoogleFeed(db, { persist: false })
  const tab = req.nextUrl.searchParams.get('tab')
  if (!tab) {
    return NextResponse.json({
      counts: { ...Object.fromEntries(Object.entries(feed.tabs).map(([k, v]) => [k, v.length])), stageUnknown: feed.stageUnknown.length, excluded: feed.excluded.length, pending: feed.pending.length, meta: feed.meta.length, newSinceLastRun: feed.added },
      pending: feed.pending,
    })
  }
  let header: readonly string[] = FEED_COLUMNS, rows: Record<string, unknown>[] = []
  if (feed.tabs[tab]) rows = feed.tabs[tab]
  else if (tab === 'Stage unknown') rows = feed.stageUnknown
  else if (tab === 'Excluded') { header = ['orderId', 'stage', 'brand', 'conversionTime', 'reason']; rows = feed.excluded as unknown as Record<string, unknown>[] }
  else if (tab === 'Meta') { header = META_COLUMNS; rows = feed.meta.map(metaRow) }
  else return NextResponse.json({ error: 'Unknown tab' }, { status: 400 })
  if (req.nextUrl.searchParams.get('format') !== 'csv') return NextResponse.json({ header, rows })
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [header.join(','), ...rows.map(r => header.map(h => esc(r[h])).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="offline-feed-${tab.replace(/\s+/g, '-')}.csv"` } })
}
