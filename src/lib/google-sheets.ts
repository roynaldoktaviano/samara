import { sheets, auth, sheets_v4 } from '@googleapis/sheets'
import type { PrismaClient } from '@prisma/client'
import { getTripSheetGroups, type TripSheetGroup } from '@/lib/trip-sheet'
import { getGoogleAdsConversions, toGoogleAdsTime, GOOGLE_ADS_CONVERSION_HEADER } from '@/lib/google-ads-conversions'

const HEADER = [
  'Month', 'Trip Date', 'Trip', 'Type', 'Status',
  'Guest', 'Agent', 'Sales', 'Cabin', 'Invoice',
  'Publish (USD)', 'Disc %', 'Agent Com (USD)', 'Total (USD)', 'Total (IDR)',
  'DP (USD)', '2nd DP / Payment (USD)', 'Balance (USD)', 'Payment Status',
]

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

// Column blocks that get merged across rows, mirroring the rowSpan cells in the in-app table.
const TRIP_BLOCK    = { start: 1, end: 5 }   // B:E — Trip Date, Trip, Type, Status
const BOOKING_BLOCK = { start: 9, end: 19 }  // J:S — Invoice ... Payment Status
const MONTH_COL = 0

function fmtRange(start: Date, end: Date) {
  const s = new Date(start), e = new Date(end)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const day = (d: Date) => d.getDate()
  const monthYear = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase()
  return sameMonth
    ? `${day(s)}-${day(e)} ${monthYear}`
    : `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()} - ${e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

function getSheetsClient(): sheets_v4.Sheets | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) return null
  const key = rawKey.replace(/\\n/g, '\n')
  const jwt = new auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return sheets({ version: 'v4', auth: jwt })
}

/** Sheet tab names can't contain certain punctuation and max out at 100 chars. */
function sanitizeTabName(name: string) {
  return name.replace(/[[\]*/\\?:]/g, ' ').trim().slice(0, 100) || 'Unassigned'
}

/** Ensures a tab with this name exists in the spreadsheet, creating it if missing. Returns its numeric sheetId. */
async function ensureSheetTabExists(sheetsClient: sheets_v4.Sheets, sheetId: string, tabName: string, existingTabs: Map<string, number>): Promise<number> {
  const existing = existingTabs.get(tabName)
  if (existing !== undefined) return existing

  const res = await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  })
  const newId = res.data.replies![0].addSheet!.properties!.sheetId!
  existingTabs.set(tabName, newId)
  return newId
}

interface MergeRange { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }

/** Builds the row values + merge ranges for one vessel's tab. */
function buildVesselSheet(groups: TripSheetGroup[]) {
  const rows: (string | number)[][] = [HEADER]
  const merges: MergeRange[] = []
  let prevMonthKey: string | null = null

  for (const g of groups) {
    const monthKey = `${g.startDate.getFullYear()}-${g.startDate.getMonth()}`
    const isNewMonth = monthKey !== prevMonthKey
    if (prevMonthKey !== null && isNewMonth) rows.push([])
    prevMonthKey = monthKey

    const groupStartRow = rows.length
    let i = 0
    while (i < g.rows.length) {
      const bookingStartRow = rows.length
      const guestRowCount = g.rows[i].guestRowCount
      for (let k = 0; k < guestRowCount; k++) {
        const r = g.rows[i + k]
        // Only write each block's value on the block's first row — the rest stay blank and get
        // merged on top, so a merge-range bug can only ever show blanks, never hide/relocate data.
        const isFirstOfGroup   = i === 0 && k === 0
        const isFirstOfBooking = k === 0
        rows.push([
          (isFirstOfGroup && isNewMonth) ? MONTH_NAMES[g.startDate.getMonth()] : '',
          isFirstOfGroup ? fmtRange(g.startDate, g.endDate) : '',
          isFirstOfGroup ? g.tripLabel : '',
          isFirstOfGroup ? g.tripType : '',
          isFirstOfGroup ? g.status : '',
          r.guestName,
          r.agentName,
          r.salesperson,
          r.cabin,
          isFirstOfBooking ? (r.invoiceNumber ?? '') : '',
          isFirstOfBooking ? round2(r.publish) : '',
          isFirstOfBooking ? (r.discountPct > 0 ? round2(r.discountPct) : '') : '',
          isFirstOfBooking ? (r.agentCommission > 0 ? round2(r.agentCommission) : '') : '',
          isFirstOfBooking ? round2(r.totalUSD) : '',
          isFirstOfBooking ? (r.totalIDR != null ? Math.round(r.totalIDR) : '') : '',
          isFirstOfBooking ? (r.dp > 0 ? round2(r.dp) : '') : '',
          isFirstOfBooking ? (r.pelunasan > 0 ? round2(r.pelunasan) : '') : '',
          isFirstOfBooking ? round2(r.balance) : '',
          isFirstOfBooking ? r.paymentStatusLabel : '',
        ])
      }
      if (guestRowCount > 1) {
        // One merge PER COLUMN — merging the whole multi-column rectangle in one request would
        // collapse it into a single cell and keep only the top-left value, discarding the rest.
        for (let col = BOOKING_BLOCK.start; col < BOOKING_BLOCK.end; col++) {
          merges.push({ startRowIndex: bookingStartRow, endRowIndex: rows.length, startColumnIndex: col, endColumnIndex: col + 1 })
        }
      }
      i += guestRowCount
    }
    if (rows.length - groupStartRow > 1) {
      for (let col = TRIP_BLOCK.start; col < TRIP_BLOCK.end; col++) {
        merges.push({ startRowIndex: groupStartRow, endRowIndex: rows.length, startColumnIndex: col, endColumnIndex: col + 1 })
      }
    }
  }

  return { rows, merges }
}

/** Full-refresh rebuild of the Trip Sheet Google Sheet mirror — one tab per vessel. Idempotent — always overwrites each tab. */
export async function rebuildTripSheetGoogleSheet(db: PrismaClient, sheetId: string | null) {
  const sheetsClient = getSheetsClient()
  if (!sheetId || !sheetsClient) return { ok: false as const, reason: 'not_configured' }

  const groups = await getTripSheetGroups(db)

  const byVessel = new Map<string, TripSheetGroup[]>()
  for (const g of groups) {
    const vessel = g.yachtName && g.yachtName !== '—' ? g.yachtName : 'Unassigned'
    const list = byVessel.get(vessel) ?? []
    list.push(g)
    byVessel.set(vessel, list)
  }

  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: sheetId })
  const existingTabs = new Map<string, number>(
    (meta.data.sheets ?? []).map(s => [s.properties!.title!, s.properties!.sheetId!])
  )

  let totalRows = 0
  for (const [vessel, vesselGroups] of byVessel) {
    const tabName = sanitizeTabName(vessel)
    const tabId = await ensureSheetTabExists(sheetsClient, sheetId, tabName, existingTabs)
    const { rows, merges } = buildVesselSheet(vesselGroups)
    totalRows += rows.length - 1

    // Unmerge everything FIRST — writing into a cell that's still part of an old merged range
    // silently drops the write for any non-anchor cell, which caused stale/blank values before.
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ unmergeCells: { range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 20000 } } }] },
    })

    const lastCol = String.fromCharCode('A'.charCodeAt(0) + HEADER.length - 1)
    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `${tabName}!A1:${lastCol}20000` })
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    })

    const requests = [
      // Header row: bold.
      {
        repeatCell: {
          range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat',
        },
      },
      // Month column: bold + colored, matching the reference sheet's style.
      {
        repeatCell: {
          range: { sheetId: tabId, startColumnIndex: MONTH_COL, endColumnIndex: MONTH_COL + 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0.85, green: 0.1, blue: 0.55 } } } },
          fields: 'userEnteredFormat.textFormat',
        },
      },
      ...merges.map(m => ({ mergeCells: { mergeType: 'MERGE_ALL', range: { sheetId: tabId, ...m } } })),
    ]
    await sheetsClient.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } })
  }

  return { ok: true as const, rows: totalRows, tabs: byVessel.size }
}

/** Fire-and-forget trigger for mutation routes — safe to call without awaiting. No-op if not configured. */
export function scheduleTripSheetSync(db: PrismaClient, sheetId: string | null) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !sheetId) return
  rebuildTripSheetGoogleSheet(db, sheetId).catch(err => console.error('[trip-sheet-sync] failed:', err))
}

const GOOGLE_ADS_LOOKBACK_DAYS = 90
const GOOGLE_ADS_CONVERSION_NAME = 'Booking Deposit Confirmed'

/**
 * Full-refresh rebuild of the Google Ads offline-conversion sheet — configured in Google Ads
 * as a "Google Sheets" conversion import source so it gets pulled in automatically on their
 * own schedule, no Developer Token/API access needed on our side. Idempotent same as the trip
 * sheet rebuild above: always clears and rewrites the whole tab rather than appending, and
 * Google Ads itself dedupes rows by (Click ID + Conversion Name + Conversion Time) so the same
 * booking appearing again in the rolling lookback window across runs is harmless.
 */
export async function rebuildGoogleAdsConversionsSheet(db: PrismaClient, sheetId: string | null) {
  const sheetsClient = getSheetsClient()
  if (!sheetId || !sheetsClient) return { ok: false as const, reason: 'not_configured' }

  const since = new Date(Date.now() - GOOGLE_ADS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const conversions = await getGoogleAdsConversions(db, since, GOOGLE_ADS_CONVERSION_NAME)

  const rows: (string | number)[][] = [
    GOOGLE_ADS_CONVERSION_HEADER,
    ...conversions.map(c => [c.gclid, c.conversionName, toGoogleAdsTime(c.conversionTime), c.value, c.currency]),
  ]

  const lastCol = String.fromCharCode('A'.charCodeAt(0) + GOOGLE_ADS_CONVERSION_HEADER.length - 1)
  await sheetsClient.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `A1:${lastCol}20000` })
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })

  return { ok: true as const, rows: conversions.length }
}
