import { NextRequest, NextResponse } from 'next/server'
import { ERP_DATASETS } from '@/lib/marketing-dashboard-erp'

// Public, unauthenticated feed for the Marketing Intelligence dashboard (/marketing-dashboard),
// default tenant only (Samara Yachting). Rows carry no names, emails or phones — see
// src/lib/marketing-dashboard-erp.ts. Built rows are cached briefly: the leads build reads
// the whole Freshsales archive.
const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; rows: Record<string, unknown>[] }>()
const inflight = new Map<string, Promise<Record<string, unknown>[]>>()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params
  const build = ERP_DATASETS[dataset]
  if (!build) return NextResponse.json({ error: 'Unknown dataset' }, { status: 404 })

  try {
    let hit = cache.get(dataset)
    if (!hit || Date.now() - hit.at > TTL_MS) {
      let p = inflight.get(dataset)
      if (!p) {
        p = build().finally(() => inflight.delete(dataset))
        inflight.set(dataset, p)
      }
      hit = { at: Date.now(), rows: await p }
      cache.set(dataset, hit)
    }
    return NextResponse.json(
      { dataset, generatedAt: new Date(hit.at).toISOString(), rows: hit.rows },
      { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    )
  } catch (e) {
    console.error('[marketing-dashboard] failed to build', dataset, e)
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }
}
