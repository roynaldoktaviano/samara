import { readFileSync } from 'fs'
import { sheets, auth, type sheets_v4 } from '@googleapis/sheets'
import type { PrismaClient } from '@prisma/client'
import { computeOfflineFeed, hashEmail, hashPhone, type FeedCandidate, type GoogleAction } from '@/lib/ad-offline-feed'
import { usdRate } from '@/lib/deal-classify'

// ERP → Google Sheets offline conversions, tahap 1 of "Setup Auto Upload Offline Conversion (ERP)"
// (Jay, 25 Nov 2026, sections A + A2). Two sheets in the company Drive, header-only, that Data
// Manager pulls daily 01:00–03:00 WITA:
//   Stages  (13 columns, M = Stage)  AC_PC / AC_OT / INV_PC / INV_OT  (later QL_PC / QL_OT)
//   Booking (12 columns)             CRM - Booking won
// Append-only (spreadsheets.values.append, RAW, INSERT_ROWS): a row is written once per Order ID and
// never rewritten — an Order ID already in the sheet is skipped. Which deals / events qualify (consent,
// EEA, never-upload, test, agent, Low match, no identifier, no amount) is computeOfflineFeed's job
// (src/lib/ad-offline-feed.ts) — this file only formats and writes.
//
// Writes as the service account erp-sheets-writer@samara-ads-dashboard.iam.gserviceaccount.com
// (Editor on both sheets) — its JSON key comes from OFFLINE_CONV_SA_KEY_FILE (path) or
// OFFLINE_CONV_SA_KEY_JSON (raw JSON or base64). NOT the trip-sheet service account.

export const STAGES_TAB = 'Stages'
export const BOOKING_TAB = 'Booking'
export const BOOKING_HEADER = [
  'Google Click ID', 'GBRAID', 'WBRAID', 'Email', 'Phone Number', 'Conversion Name', 'Conversion Time',
  'Conversion Value', 'Conversion Currency', 'Order ID', 'Ad User Data', 'Ad Personalization',
] as const
export const STAGES_HEADER = [...BOOKING_HEADER, 'Stage'] as const
const ORDER_ID_COL = 'J' // 10th column in both sheets
const ORDER_ID_IDX = 9

/** Conversion action names — must match Google Ads exactly (Jay, 25 Nov). */
export const CONVERSION_NAME: Record<GoogleAction, string> = {
  AC_PC: 'Samara - CRM - Active Communication (PC)',
  AC_OT: 'Samara - CRM - Active Communication (OT)',
  INV_PC: 'Samara - CRM - Invoice Sent (PC)',
  INV_OT: 'Samara - CRM - Invoice Sent (OT)',
  BOOKING: 'CRM - Booking won',
}
/** Fixed AC value in USD (the feed's own AC value is IDR — not used here). */
const AC_VALUE_USD = { AC_PC: 1000, AC_OT: 280 } as const

/**
 * false (Roy/Jay, 25 Nov): booking rows use samara-{dealID}-{PC|OT}-BK for every deal, dealID = the
 * Freshsales deal ID for migrated deals. true would keep the old box format for Freshsales deals (the
 * bare deal ID, e.g. "113001495733"), which Google would dedup against the box's earlier uploads.
 */
const BOOKING_KEEPS_BOX_ORDER_ID = false

export type SheetRow = (string | number)[]
export interface SheetSkip { orderId: string; action: GoogleAction; reason: string }

const WITA_MS = 8 * 60 * 60 * 1000
/** "2026-08-31 13:54:21+08:00" — the format the box sheet uses. */
export function sheetTime(d: Date): string {
  return new Date(d.getTime() + WITA_MS).toISOString().slice(0, 19).replace('T', ' ') + '+08:00'
}

/** samara-{dealID}-{PC|OT}-{AC|INV|BK}; dealID = Freshsales deal ID for migrated deals, else ERP-<n>. */
export function sheetOrderId(c: Pick<FeedCandidate, 'action' | 'orderId' | 'tripSuffix'>): string | null {
  if (c.action === 'BOOKING' && BOOKING_KEEPS_BOX_ORDER_ID && /^\d+$/.test(c.orderId)) return c.orderId
  if (!c.tripSuffix) return null
  const kind = c.action.startsWith('AC_') ? 'AC' : c.action.startsWith('INV_') ? 'INV' : 'BK'
  return `samara-${c.orderId}-${c.tripSuffix}-${kind}`
}

const consentText = (v: string | number | undefined) => (String(v ?? '').toUpperCase() === 'GRANTED' ? 'Granted' : '')
const round2 = (n: number) => Math.round(n * 100) / 100

/** One sheet row (12 columns; + Stage for the Stages sheet). */
export function sheetRow(p: {
  action: GoogleAction; orderId: string; at: Date; valueUsd: number
  gclid: string; gbraid: string; wbraid: string; emailHash: string; phoneHash: string; adUserData: string; adPersonalization: string
}): SheetRow {
  const row: SheetRow = [
    p.gclid, p.gbraid, p.wbraid, p.emailHash, p.phoneHash, CONVERSION_NAME[p.action], sheetTime(p.at),
    round2(p.valueUsd), 'USD', p.orderId, p.adUserData, p.adPersonalization,
  ]
  if (p.action !== 'BOOKING') row.push(p.action)
  return row
}

/** Rows the ERP would write now (Samara brand only — Otium / Mischief get their own sheets later). */
export async function buildOfflineSheetRows(db: PrismaClient, now = new Date()) {
  const { candidates } = await computeOfflineFeed(db, now)
  const stages: SheetRow[] = [], booking: SheetRow[] = [], skipped: SheetSkip[] = []
  const rates = new Map<string, number | null>()
  const rateOf = async (cur: string) => {
    if (!rates.has(cur)) rates.set(cur, await usdRate(db, cur))
    return rates.get(cur) ?? null
  }
  for (const c of candidates) {
    if (c.brand !== 'SAMARA') continue
    const orderId = sheetOrderId(c)
    if (!orderId) { skipped.push({ orderId: c.orderId, action: c.action, reason: 'No trip type (PC/OT) for the Order ID' }); continue }
    let valueUsd: number
    if (c.action === 'AC_PC' || c.action === 'AC_OT') valueUsd = AC_VALUE_USD[c.action]
    else {
      const v = Number(c.row.Conversion_Value), cur = String(c.row.Conversion_Currency || 'USD').toUpperCase()
      const rate = await rateOf(cur)
      if (!(v > 0) || rate == null) { skipped.push({ orderId, action: c.action, reason: rate == null ? `No USD rate for ${cur}` : 'No amount' }); continue }
      valueUsd = v * rate
    }
    const r = c.row
    const row = sheetRow({
      action: c.action, orderId, at: c.conversionTime, valueUsd,
      gclid: String(r.Google_Click_ID ?? ''), gbraid: String(r.GBRAID ?? ''), wbraid: String(r.WBRAID ?? ''),
      emailHash: String(r.Email ?? ''), phoneHash: String(r.Phone_Number ?? ''),
      adUserData: consentText(r.Ad_User_Data), adPersonalization: consentText(r.Ad_Personalization),
    })
    ;(c.action === 'BOOKING' ? booking : stages).push(row)
  }
  const byTime = (a: SheetRow, b: SheetRow) => String(a[6]).localeCompare(String(b[6]))
  stages.sort(byTime); booking.sort(byTime)
  return { stages, booking, skipped }
}

/** Synthetic rows for Jay's format check: 1 per Stage + 1 booking, Order IDs starting "test-", no real guest data. */
export function buildTestRows(now = new Date()) {
  const base = {
    at: now, gclid: 'TEST-GCLID-ERP', gbraid: '', wbraid: '',
    emailHash: hashEmail(' Test@SamaraLiveaboard.com '), phoneHash: hashPhone('+6281200000000'),
    adUserData: 'Granted', adPersonalization: 'Granted',
  }
  const stages = (['AC_PC', 'AC_OT', 'INV_PC', 'INV_OT'] as const).map((action, i) => {
    const suffix = action.endsWith('PC') ? 'PC' : 'OT'
    const kind = action.startsWith('AC') ? 'AC' : 'INV'
    const valueUsd = action === 'AC_PC' ? 1000 : action === 'AC_OT' ? 280 : action === 'INV_PC' ? 12500 : 2780
    return sheetRow({ ...base, action, orderId: `test-samara-ERP-90000${i + 1}-${suffix}-${kind}`, valueUsd })
  })
  const booking = [sheetRow({ ...base, action: 'BOOKING', orderId: 'test-samara-ERP-900005-PC-BK', valueUsd: 12500 })]
  return { stages, booking }
}

// ── Sheets API ──────────────────────────────────────────────────────────────────

function loadServiceAccount(): { email: string; key: string } | null {
  const file = process.env.OFFLINE_CONV_SA_KEY_FILE
  let txt = file ? readFileSync(file, 'utf8') : process.env.OFFLINE_CONV_SA_KEY_JSON
  if (!txt?.trim()) return null
  if (!txt.trim().startsWith('{')) txt = Buffer.from(txt.trim(), 'base64').toString('utf8')
  const j = JSON.parse(txt) as { client_email?: string; private_key?: string }
  if (!j.client_email || !j.private_key) throw new Error('Offline-conversion service account key has no client_email / private_key')
  return { email: j.client_email, key: j.private_key }
}

export function offlineSheetsClient(): sheets_v4.Sheets | null {
  const sa = loadServiceAccount()
  if (!sa) return null
  return sheets({ version: 'v4', auth: new auth.JWT({ email: sa.email, key: sa.key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] }) })
}

export interface OfflineSheetIds { stagesSheetId: string; bookingSheetId: string }

async function checkHeader(api: sheets_v4.Sheets, spreadsheetId: string, tab: string, header: readonly string[]) {
  const res = await api.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!1:1` })
  const got = (res.data.values?.[0] ?? []).map(v => String(v).trim())
  if (got.length !== header.length || got.some((h, i) => h !== header[i])) {
    throw new Error(`${tab} header is not the agreed ${header.length} columns (got: ${got.join(' | ') || 'empty'}) — not writing`)
  }
}

/** Appends the rows whose Order ID is not in the sheet yet. Returns how many were appended / already there. */
async function appendNew(api: sheets_v4.Sheets, spreadsheetId: string, tab: string, header: readonly string[], rows: SheetRow[], dryRun: boolean) {
  await checkHeader(api, spreadsheetId, tab, header)
  const res = await api.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!${ORDER_ID_COL}2:${ORDER_ID_COL}` })
  const seen = new Set((res.data.values ?? []).map(r => String(r[0] ?? '').trim()).filter(Boolean))
  const todo: SheetRow[] = []
  for (const r of rows) {
    const id = String(r[ORDER_ID_IDX])
    if (seen.has(id)) continue
    seen.add(id)
    todo.push(r)
  }
  if (todo.length && !dryRun) {
    const lastCol = String.fromCharCode(64 + header.length)
    await api.spreadsheets.values.append({
      spreadsheetId, range: `'${tab}'!A:${lastCol}`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: todo },
    })
  }
  return { appended: todo.length, alreadyThere: rows.length - todo.length, rows: todo }
}

/** Writes the given rows to both sheets (append-only, Order ID dedup). */
export async function appendOfflineSheetRows(ids: OfflineSheetIds, rows: { stages: SheetRow[]; booking: SheetRow[] }, opts: { dryRun?: boolean } = {}) {
  const api = offlineSheetsClient()
  if (!api) return { ok: false as const, reason: 'OFFLINE_CONV_SA_KEY_FILE / OFFLINE_CONV_SA_KEY_JSON not set' }
  const stages = await appendNew(api, ids.stagesSheetId, STAGES_TAB, STAGES_HEADER, rows.stages, !!opts.dryRun)
  const booking = await appendNew(api, ids.bookingSheetId, BOOKING_TAB, BOOKING_HEADER, rows.booking, !!opts.dryRun)
  return { ok: true as const, stages, booking }
}

/** Daily run: build from the deals and append what is new. */
export async function syncOfflineConversionSheets(db: PrismaClient, ids: OfflineSheetIds, opts: { dryRun?: boolean } = {}) {
  const built = await buildOfflineSheetRows(db)
  const res = await appendOfflineSheetRows(ids, built, opts)
  if (!res.ok) return { ...res, skipped: built.skipped.length }
  return { ok: true as const, stagesAppended: res.stages.appended, bookingAppended: res.booking.appended, alreadyThere: res.stages.alreadyThere + res.booking.alreadyThere, skipped: built.skipped }
}

/** Deletes every row whose Order ID starts with "test-" (format-check rows). */
export async function removeTestRows(ids: OfflineSheetIds) {
  const api = offlineSheetsClient()
  if (!api) throw new Error('OFFLINE_CONV_SA_KEY_FILE / OFFLINE_CONV_SA_KEY_JSON not set')
  const out: Record<string, number> = {}
  for (const [spreadsheetId, tab] of [[ids.stagesSheetId, STAGES_TAB], [ids.bookingSheetId, BOOKING_TAB]] as const) {
    const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
    const sheetId = meta.data.sheets?.find(s => s.properties?.title === tab)?.properties?.sheetId
    if (sheetId == null) throw new Error(`No tab "${tab}"`)
    const res = await api.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!${ORDER_ID_COL}:${ORDER_ID_COL}` })
    const idx = (res.data.values ?? []).map((r, i) => (String(r[0] ?? '').startsWith('test-') ? i : -1)).filter(i => i > 0)
    // Bottom-up so earlier deletions don't shift the later indexes.
    const requests = idx.reverse().map(i => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } }))
    if (requests.length) await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
    out[tab] = requests.length
  }
  return out
}
