import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// WITA (Central Indonesia Time, UTC+8) has no DST, so a fixed offset is safe here.
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Hard cap on how many days a single `from`/`to` window can zero-fill, so a
// mistyped year (e.g. "from=2000-01-01") can't force an unbounded loop.
const MAX_DAYS = 730

/** Enumerate WITA calendar-date strings from `from` to `to`, inclusive. */
function enumerateDates(from: string, to: string): string[] {
  const out: string[] = []
  let cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cur <= end && out.length < MAX_DAYS) {
    out.push(cur.toISOString().slice(0, 10))
    cur = new Date(cur.getTime() + DAY_MS)
  }
  return out
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam   = searchParams.get('to')
    const from = fromParam && DATE_RE.test(fromParam) ? fromParam : null
    const to   = toParam   && DATE_RE.test(toParam)   ? toParam   : null
    // Matched in JS below (against the same trimmed value used for the byCountry
    // breakdown) rather than as a DB `where` clause — avoids a raw untrimmed DB value
    // silently failing to match the trimmed option the client's dropdown sent.
    const countryParam = searchParams.get('country')?.trim() || null

    // `from`/`to` are WITA calendar dates (inclusive) — converted to UTC
    // instants via the +08:00 offset so the boundary lines up with the same
    // WITA-day bucketing used below for the daily/hourly breakdowns.
    const gte = from ? new Date(`${from}T00:00:00+08:00`) : undefined
    const lt  = to   ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + DAY_MS) : undefined
    const createdAtFilter = (gte || lt) ? { createdAt: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}

    const leadsInRange = await db.lead.findMany({
      where: { deletedAt: null, ...createdAtFilter },
      select: { id: true, nationality: true, createdAt: true },
    })
    const leads = countryParam
      ? leadsInRange.filter(l => (l.nationality?.trim() || 'Unknown') === countryParam)
      : leadsInRange
    const leadIdsInScope = countryParam ? new Set(leads.map(l => l.id)) : null

    // Inquiries whose lead falls in range — used for the website/source
    // breakdowns. Filtering through the `lead` relation also drops any
    // inquiry whose leadId is null. The country filter (if any) is applied
    // after, against the same lead-id set as above.
    const inquiriesInRange = await db.inquiry.findMany({
      where: { lead: { deletedAt: null, ...createdAtFilter } },
      select: { leadId: true, website: true, utmSource: true, lastSource: true },
    })
    const inquiries = leadIdsInScope
      ? inquiriesInRange.filter(i => i.leadId && leadIdsInScope.has(i.leadId))
      : inquiriesInRange

    const countryCounts = new Map<string, number>()
    const dailyCounts = new Map<string, number>()
    const hourlyCounts = new Map<number, number>()
    const dowCounts = new Map<number, number>() // 0=Sun..6=Sat, JS Date convention
    for (const l of leads) {
      const country = l.nationality?.trim() || 'Unknown'
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1)

      const wita = new Date(l.createdAt.getTime() + WITA_OFFSET_MS)
      const dateKey = wita.toISOString().slice(0, 10)
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) ?? 0) + 1)
      const hour = wita.getUTCHours()
      hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + 1)
      const dow = wita.getUTCDay()
      dowCounts.set(dow, (dowCounts.get(dow) ?? 0) + 1)
    }

    // A lead can have multiple inquiries from different sites/sources — count
    // it once per distinct website/source it touched, mirroring the "some"
    // semantics used by the Leads list filters.
    const websiteLeads = new Map<string, Set<string>>()
    const sourceLeads = new Map<string, Set<string>>()
    for (const inq of inquiries) {
      if (!inq.leadId) continue
      // Trimmed the same way nationality is above — a stray whitespace-only value (seen in
      // some bulk-imported Freshsales rows) is truthy but would otherwise become its own
      // blank-labeled bar in the chart instead of being excluded like a real null.
      const website = inq.website?.trim()
      if (website) {
        if (!websiteLeads.has(website)) websiteLeads.set(website, new Set())
        websiteLeads.get(website)!.add(inq.leadId)
      }
      const src = (inq.utmSource || inq.lastSource)?.trim()
      if (src) {
        if (!sourceLeads.has(src)) sourceLeads.set(src, new Set())
        sourceLeads.get(src)!.add(inq.leadId)
      }
    }

    const rankBySize = (m: Map<string, Set<string>>) =>
      Array.from(m.entries())
        .map(([name, s]) => ({ name, count: s.size }))
        .sort((a, b) => b.count - a.count)

    const rankByCount = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)

    // Zero-fill the daily series across the requested window so two windows
    // of equal length line up index-for-index when the client overlays them
    // for a period-over-period comparison.
    const daily = from && to
      ? enumerateDates(from, to).map(date => ({ date, count: dailyCounts.get(date) ?? 0 }))
      : Array.from(dailyCounts.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      total: leads.length,
      byWebsite: rankBySize(websiteLeads),
      bySource: rankBySize(sourceLeads),
      byCountry: rankByCount(countryCounts),
      daily,
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourlyCounts.get(hour) ?? 0 })),
      // Mon..Sun order (not JS's native Sun-first) reads more naturally for a business
      // week — `day` stays in Date.getUTCDay() numbering (0=Sun) so the client's existing
      // day-name lookup works unchanged either way.
      dayOfWeek: [1, 2, 3, 4, 5, 6, 0].map(day => ({ day, count: dowCounts.get(day) ?? 0 })),
    })
  } catch (error) {
    console.error('Error fetching lead stats:', error)
    return NextResponse.json({ error: 'Failed to fetch lead stats' }, { status: 500 })
  }
}
