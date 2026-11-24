import { NextRequest, NextResponse } from 'next/server'
import { archiveAccess, isMissingTable } from '@/lib/freshsales-archive-view'
import { channelGroup, erpWins, freshsalesWins, type TouchKey, type WinsResult } from '@/lib/won-attribution'

// Every won Freshsales deal or every ERP booking, each with its attribution — the
// "Won Attribution" screen filters and groups these client-side (a few thousand rows at most).
// Test deals are left out here (only their count is returned).
export async function GET(req: NextRequest) {
  const access = await archiveAccess('won-attribution')
  if ('error' in access) return access.error
  const { db } = access
  const dataset = req.nextUrl.searchParams.get('dataset') === 'erp' ? 'erp' : 'freshsales'

  let res: WinsResult
  try {
    res = dataset === 'erp' ? await erpWins(db) : await freshsalesWins(db)
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ dataset, wins: [], excludedTests: 0, notAvailable: true })
    throw e
  }
  const withGroups = res.wins.map(w => ({
    ...w,
    groups: Object.fromEntries((['first', 'last', 'latest'] as TouchKey[]).map(k => [k, channelGroup(w.touches[k])])),
  }))
  return NextResponse.json({ dataset, wins: withGroups, excludedTests: res.excludedTests })
}
