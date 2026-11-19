/**
 * Backfill of website WhatsApp-button taps the ERP never received (the wa-tap relay wasn't live yet):
 * an export of WordPress's own tap log (snippet 63, POST /wp-json/gb/v1/wa-tap) → WaTap rows, each
 * matched to its WhatsApp chat exactly like a live tap (src/lib/wa-tap.ts recordWaTap): by the
 * "Ref SL-XXXXX" in the chat, else the 30-min timing rule. A match writes the tap's UTMs / click IDs /
 * landing page / consent as a WHATSAPP Inquiry on the chat's Lead (or Guest). Re-runnable: a ref
 * already stored only has its blanks filled.
 *
 * Input: TSV straight from WP-CLI on the server (Cloudways):
 *          ssh USER@IP 'cd ~/applications/APP/public_html && wp db query "SELECT * FROM <tap table>"' > taps.tsv
 *        CSV (header row = column names, as exported from phpMyAdmin / Adminer / a WP export plugin)
 *        or JSON (an array of rows, or { taps: [...] }). Column names are read the same way the live
 *        webhook reads them — ref|wa_ref|code, tapped_at|created_at|ts|time, utm_*, ft_utm_*, gclid,
 *        gbraid, wbraid, fbclid, msclkid, _fbc|fbc, _fbp|fbp, page|page_url|url|landing_url,
 *        referrer, lang, vid|visitor_id, ad_consent|consent, consent_region|region, ip, ua|user_agent.
 *        A tapped_at without a zone ("2026-11-19 01:49:10") is read as UTC (WordPress stores UTC).
 *
 * Run:  npx tsx scripts/import-wa-taps.ts <taps.tsv|csv|json>            (dry run — no writes)
 *       npx tsx scripts/import-wa-taps.ts <taps.tsv|csv|json> --apply    (writes + matches)
 * Several files at once (one per website) are fine.
 * Options: --tenant=samara  --skip=OT-2A3B4,SL-XXXXX (refs to leave out, e.g. setup tests)
 * A matched Sales chat with no Lead yet gets one (same-number Lead reused, else created — as the
 * webhook does for new chats) so its inquiry has somewhere to go.
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { matchTapToChat, recordWaTap, tapFromPayload } from '../src/lib/wa-tap'
import { ensureLeadForConversation } from '../src/lib/whatsapp-lead'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const opt = (k: string, d: string) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const TENANT = opt('tenant', 'samara')
const FILES = args.filter(a => !a.startsWith('--'))
const SKIP = new Set(opt('skip', '').split(',').map(r => r.trim().toUpperCase()).filter(Boolean))

/** mysql batch output (what `wp db query` prints when piped): tab-separated, header row, NULL as
 *  the text NULL, and \n \t \\ escaped inside values — no quoting, so JSON columns survive as-is. */
function parseTsv(text: string): Record<string, string>[] {
  const unescape = (v: string) => v.replace(/\\(n|t|0|\\)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === '0' ? '' : '\\'))
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '')
  const [header, ...body] = lines
  if (!header) return []
  const keys = header.split('\t').map(h => h.trim())
  return body.map(l => {
    const f = l.split('\t')
    return Object.fromEntries(keys.map((k, i) => [k, f[i] === undefined || f[i] === 'NULL' ? '' : unescape(f[i])]))
  })
}

/** Minimal RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, ; or , delimiter. */
function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'))
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  const [header, ...body] = rows
  if (!header) return []
  const keys = header.map(h => h.trim())
  // phpMyAdmin exports SQL NULL as the text NULL
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] === 'NULL' ? '' : (r[i] ?? '')])))
}

function readRows(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, 'utf8')
  if (/\.json$/i.test(path)) {
    const j = JSON.parse(text)
    const list = Array.isArray(j) ? j : Array.isArray(j?.taps) ? j.taps : null
    if (!list) throw new Error('JSON must be an array of taps or { taps: [...] }')
    // A tap logged with its data in a JSON column (payload / data / meta) — spread it onto the row.
    return list.map(flatten)
  }
  // WP-CLI / mysql output is tab-separated; anything else with a tab-only header is too
  const header = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'))
  if (/\.tsv$/i.test(path) || (header.includes('\t') && !header.includes(','))) return parseTsv(text).map(flatten)
  return parseCsv(text).map(flatten)
}

function flatten(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...r }
  for (const k of ['payload', 'data', 'meta', 'params', 'body']) {
    let v = r[k]
    if (typeof v === 'string' && v.trim().startsWith('{')) { try { v = JSON.parse(v) } catch { v = null } }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, vv] of Object.entries(v)) if (out[kk] == null || out[kk] === '') out[kk] = vv
    }
  }
  return out
}

async function main() {
  if (!FILES.length) throw new Error('Usage: npx tsx scripts/import-wa-taps.ts <taps.tsv|csv|json> [more files…] [--apply]')
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: TENANT }, select: { databaseUrl: true, directUrl: true } })
  await central.$disconnect()
  if (!tenant) throw new Error(`Tenant ${TENANT} not found`)
  const db = new PrismaClient({ datasources: { db: { url: tenant.directUrl || tenant.databaseUrl } } })

  try {
    const rows = FILES.flatMap(f => {
      const r = readRows(f)
      console.log(`${r.length} rows in ${f}`)
      return r
    })
    console.log(`${rows.length} rows total${APPLY ? '' : ' (dry run)'}`)
    if (rows[0]) console.log(`columns: ${Object.keys(rows[0]).join(', ')}`)

    // Setup/verification taps logged while the tracker was installed (TestClickId…, vid "testvid",
    // utm test/verify) — never real visitors, and they'd timing-match whoever chatted next.
    const isTest = (r: Record<string, unknown>) => /^test/i.test(String(r.gclid ?? '')) || /^test/i.test(String(r.vid ?? ''))
      || /test/i.test(String(r.utm_source ?? '')) || /^test/i.test(String(r.fbclid ?? '')) || /GrokBot|test/i.test(String(r.ua ?? ''))
      || SKIP.has(String(r.ref ?? '').trim().toUpperCase())
    const tests = rows.filter(isTest)
    if (tests.length) console.log(`${tests.length} test rows skipped: ${tests.map(r => r.ref).join(', ')}`)
    const parsed = rows.filter(r => !isTest(r)).map(r => ({ raw: r, tap: tapFromPayload(r) }))
    const valid = parsed.filter(p => p.tap)
    console.log(`${valid.length} with a valid ref, ${parsed.length - valid.length} skipped (no SL-/OT-/MV- ref)`)
    if (!valid.length) return

    // What each column turned into, so a mis-named export column shows up before --apply
    const filled: Record<string, number> = {}
    for (const { tap } of valid) for (const [k, v] of Object.entries(tap!)) if (v != null && v !== '') filled[k] = (filled[k] ?? 0) + 1
    console.log('fields read (rows with a value):')
    console.table(filled)
    const times = valid.map(p => p.tap!.tappedAt as Date).sort((a, b) => +a - +b)
    console.log(`taps from ${times[0].toISOString()} to ${times[times.length - 1].toISOString()}`)

    // Refs that WhatsApp chats in the ERP actually carry — these become CONFIDENT matches
    const chats = await db.$queryRawUnsafe<{ ref: string; phone: string; at: Date }[]>(`
      SELECT upper(substring(m.body from '(?i)\\m((?:SL|OT|MV)-[2-9A-HJ-NP-Z]{5})\\M')) ref, c.phone, m."createdAt" at
      FROM "WhatsappMessage" m JOIN "WhatsappConversation" c ON c.id = m."conversationId"
      WHERE m.direction = 'IN' AND m.body ~* '\\m(SL|OT|MV)-[2-9A-HJ-NP-Z]{5}\\M'`)
    const inFile = new Set(valid.map(p => p.tap!.ref))
    const hit = chats.filter(c => inFile.has(c.ref))
    console.log(`${chats.length} chat messages carry a ref; ${hit.length} of those refs are in this file:`)
    for (const c of chats) console.log(`  ${c.ref}  ${c.phone}  ${c.at.toISOString()}  ${inFile.has(c.ref) ? 'FOUND' : 'not in file'}`)

    if (!APPLY) { console.log('\nDry run — re-run with --apply to store the taps and match them to chats.'); return }

    let stored = 0, matched = 0, rejected = 0
    for (const { raw } of valid) {
      const r = await recordWaTap(db, raw)
      if (!r.ok) { rejected++; continue }
      stored++
      if (r.matched) matched++
    }
    // Matched to a Sales chat that has no Lead (so no inquiry was written): give the chat its Lead,
    // then match the tap again so the inquiry lands — confidence recomputed the same way.
    const orphans = await db.$queryRawUnsafe<{ tapId: string; conversationId: string; ref: string }[]>(`
      SELECT t.id "tapId", t."matchedConversationId" "conversationId", t.ref FROM "WaTap" t
      JOIN "WhatsappConversation" c ON c.id = t."matchedConversationId"
      WHERE c."leadId" IS NULL AND c.category = 'SALES' AND NOT EXISTS (SELECT 1 FROM "Inquiry" i WHERE i."waTapId" = t.id)
        AND t.ref = ANY($1)
      ORDER BY t."tappedAt"`, valid.map(v => v.tap!.ref))
    for (const o of orphans) {
      const leadId = await ensureLeadForConversation(db, o.conversationId)
      if (!leadId) continue
      await db.waTap.update({ where: { id: o.tapId }, data: { matchedConversationId: null, matchedAt: null } })
      await matchTapToChat(db, o.tapId)
      console.log(`  ${o.ref}: chat linked to a Lead, inquiry written`)
    }
    const inquiries = await db.inquiry.count({ where: { source: 'WHATSAPP', waTapId: { not: null } } })
    console.log(`\nstored ${stored}, matched to a chat ${matched}, rejected ${rejected}; WhatsApp-click inquiries now: ${inquiries}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
