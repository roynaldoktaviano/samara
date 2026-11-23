import type { Prisma, PrismaClient } from '@prisma/client'

// On / off switch per deal-maker source — the ERP's version of the Freshsales deal maker's
// per-source modes (handover §4, gb_dm_mode_form / _wa) and its fast rollback. Off = the lead and
// its enquiry (with every click ID) are still stored; only the automatic deal is skipped, and sales
// can still open one by hand ("Create deal", manual lead). Stored in SystemSetting so an admin can
// flip it at once without a deploy (Chat › Leads Distribution).

type Db = PrismaClient | Prisma.TransactionClient

export const DEAL_MAKER_SOURCES = ['WEBSITE_FORM', 'META_FORM', 'WHATSAPP'] as const
export type DealMakerSource = (typeof DEAL_MAKER_SOURCES)[number]

export const DEAL_MAKER_SOURCE_LABEL: Record<DealMakerSource, { label: string; hint: string }> = {
  WEBSITE_FORM: { label: 'Website forms', hint: 'CF7 enquiry forms on the three sites' },
  META_FORM: { label: 'Meta Instant Forms', hint: 'Lead Ads forms on Facebook / Instagram' },
  WHATSAPP: { label: 'WhatsApp from an ad or website tap', hint: 'Click-to-WhatsApp ads and the website WhatsApp button (Ref SL-XXXXX / 30-min match)' },
}

const key = (s: DealMakerSource) => `deal_maker_off_${s}`
const CACHE_MS = 15_000
const cache = new Map<string, { off: boolean; at: number }>()

/** True unless an admin switched this source off. Cached 15 s per process. */
export async function isDealMakerOn(db: Db, source: DealMakerSource): Promise<boolean> {
  const hit = cache.get(source)
  if (hit && Date.now() - hit.at < CACHE_MS) return !hit.off
  const row = await db.systemSetting.findUnique({ where: { key: key(source) } }).catch(() => null)
  const off = row?.textValue === '1'
  cache.set(source, { off, at: Date.now() })
  return !off
}

export async function getDealMakerSwitches(db: PrismaClient): Promise<Record<DealMakerSource, boolean>> {
  const rows = await db.systemSetting.findMany({ where: { key: { in: DEAL_MAKER_SOURCES.map(key) } } })
  const off = new Set(rows.filter(r => r.textValue === '1').map(r => r.key))
  return Object.fromEntries(DEAL_MAKER_SOURCES.map(s => [s, !off.has(key(s))])) as Record<DealMakerSource, boolean>
}

export async function setDealMakerSwitch(db: PrismaClient, source: DealMakerSource, on: boolean, userId: string) {
  await db.systemSetting.upsert({
    where: { key: key(source) },
    create: { key: key(source), textValue: on ? '0' : '1', updatedBy: userId },
    update: { textValue: on ? '0' : '1', updatedBy: userId },
  })
  cache.delete(source)
}
