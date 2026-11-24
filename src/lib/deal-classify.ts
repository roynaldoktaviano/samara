// Deal classification for marketing reports (audit 2026-11-24): booking type (Direct / Agent /
// Repeat — agent revenue never counts toward ad ROAS), enquiry channel (standard list), and the
// deal amount in USD next to the original currency. Type-only Prisma imports, so the labels are
// safe in client components too.
import type { DealBookingType, DealEnquiryChannel, PrismaClient, Prisma } from '@prisma/client'
import { AGENT_CODE_RE } from '@/lib/deal-quality'

type Db = PrismaClient | Prisma.TransactionClient

export const DEAL_BOOKING_TYPES = ['DIRECT', 'AGENT', 'REPEAT'] as const satisfies readonly DealBookingType[]
export const DEAL_BOOKING_TYPE_LABEL: Record<DealBookingType, string> = { DIRECT: 'Direct', AGENT: 'Agent', REPEAT: 'Repeat guest' }

export const DEAL_ENQUIRY_CHANNELS = ['WEB_FORM', 'WHATSAPP', 'EMAIL', 'META_LEAD_FORM', 'INSTAGRAM', 'MESSENGER', 'AGENT', 'PHONE'] as const satisfies readonly DealEnquiryChannel[]
export const DEAL_ENQUIRY_CHANNEL_LABEL: Record<DealEnquiryChannel, string> = {
  WEB_FORM: 'Web form', WHATSAPP: 'WhatsApp', EMAIL: 'Email', META_LEAD_FORM: 'Meta lead form',
  INSTAGRAM: 'Instagram DM', MESSENGER: 'Messenger', AGENT: 'Agent', PHONE: 'Phone',
}
export const isDealBookingType = (v: unknown): v is DealBookingType => typeof v === 'string' && (DEAL_BOOKING_TYPES as readonly string[]).includes(v)
export const isDealEnquiryChannel = (v: unknown): v is DealEnquiryChannel => typeof v === 'string' && (DEAL_ENQUIRY_CHANNELS as readonly string[]).includes(v)

/** Standard enquiry channel from how the ERP made the deal, else the lead's channel (Lead.entrySource). */
export function enquiryChannelOf(dealChannel: string | null | undefined, leadEntrySource?: string | null): DealEnquiryChannel | null {
  switch (dealChannel) {
    case 'WEBSITE_FORM': return 'WEB_FORM'
    case 'META_FORM': return 'META_LEAD_FORM'
    case 'WHATSAPP': return 'WHATSAPP'
    case 'INSTAGRAM': return 'INSTAGRAM'
    case 'MESSENGER': return 'MESSENGER'
    case 'EMAIL': return 'EMAIL'
    case 'PHONE': return 'PHONE'
    case 'AGENT': return 'AGENT'
  }
  switch (leadEntrySource) {
    case 'WEBSITE_FORM': return 'WEB_FORM'
    case 'INSTANT_FORM': return 'META_LEAD_FORM'
    case 'WHATSAPP': return 'WHATSAPP'
    case 'INSTAGRAM': return 'INSTAGRAM'
    case 'MESSENGER': return 'MESSENGER'
    case 'EMAIL': return 'EMAIL'
    case 'PHONE': return 'PHONE'
    case 'AGENT_OTA': return 'AGENT'
  }
  return null
}

/** Freshsales contact "Medium" (how they reached out: Google / WA / Email …) → enquiry channel. */
export function enquiryChannelFromFreshsales(medium: string | null | undefined, dealName?: string | null): DealEnquiryChannel | null {
  if (dealName && AGENT_CODE_RE.test(dealName)) return 'AGENT'
  const m = (medium ?? '').toLowerCase()
  if (!m.trim()) return null
  if (/agent/.test(m)) return 'AGENT'
  if (/\bwa\b|whats\s*app/.test(m)) return 'WHATSAPP'
  if (/e-?mail/.test(m)) return 'EMAIL'
  if (/phone|call/.test(m)) return 'PHONE'
  if (/instagram|\big\b/.test(m)) return 'INSTAGRAM'
  if (/google|organic|website|web|form|\bpc\b|\bot\b|direct|bing|linktr|facebook/.test(m)) return 'WEB_FORM'
  return null
}

export async function agentEmailSet(db: Db): Promise<Set<string>> {
  const [agents, contacts] = await Promise.all([
    db.agent.findMany({ where: { email: { not: null } }, select: { email: true } }),
    db.agentContact.findMany({ where: { email: { not: null } }, select: { email: true } }),
  ])
  return new Set([...agents, ...contacts].map(a => a.email?.trim().toLowerCase()).filter((e): e is string => !!e))
}

/**
 * Booking type of a new deal: AGENT when it came through an agent (channel, the lead's channel, or
 * the person's email is an agent's / agent contact's); REPEAT when the person already has a
 * booking from before; else DIRECT. Sales can change it on the deal.
 */
export async function detectBookingType(db: Db, p: { leadId?: string | null; customerId?: string | null; enquiryChannel?: DealEnquiryChannel | null; at?: Date }): Promise<DealBookingType> {
  if (p.enquiryChannel === 'AGENT') return 'AGENT'
  const [lead, cust] = await Promise.all([
    p.leadId ? db.lead.findUnique({ where: { id: p.leadId }, select: { email: true, phoneE164: true, entrySource: true } }) : null,
    p.customerId ? db.customer.findUnique({ where: { id: p.customerId }, select: { email: true, phoneE164: true } }) : null,
  ])
  if (lead?.entrySource === 'AGENT_OTA') return 'AGENT'
  const emails = [lead?.email, cust?.email].map(e => e?.trim().toLowerCase()).filter((e): e is string => !!e)
  if (emails.length) {
    const agents = await agentEmailSet(db)
    if (emails.some(e => agents.has(e))) return 'AGENT'
  }
  const phone = cust?.phoneE164 ?? lead?.phoneE164 ?? null
  const ident: Prisma.CustomerWhereInput[] = [
    ...(p.customerId ? [{ id: p.customerId }] : []),
    ...emails.map(e => ({ email: { equals: e, mode: 'insensitive' as const } })),
    ...(phone ? [{ phoneE164: phone }] : []),
  ]
  if (ident.length) {
    const earlier = await db.booking.count({
      where: { status: { not: 'cancelled' }, createdAt: { lt: p.at ?? new Date() }, customer: { OR: ident } },
    })
    if (earlier > 0) return 'REPEAT'
  }
  return 'DIRECT'
}

// ─── amount in USD ──────────────────────────────────────────────────────────

/**
 * USD per 1 unit of `currency`. USD = 1. Else an admin-set rate (SystemSetting "fx_rates_per_usd",
 * JSON like {"IDR": 16500, "EUR": 0.92} — units of the currency per 1 USD), else the latest rate
 * Finance typed on a payment / booking in that currency. Null when nothing is known.
 */
export async function usdRate(db: Db, currency: string | null | undefined): Promise<number | null> {
  const cur = (currency ?? 'USD').trim().toUpperCase()
  if (cur === 'USD') return 1
  const setting = await db.systemSetting.findUnique({ where: { key: 'fx_rates_per_usd' }, select: { textValue: true } }).catch(() => null)
  try {
    const perUsd = Number((JSON.parse(setting?.textValue ?? '{}') as Record<string, unknown>)[cur])
    if (perUsd > 0) return 1 / perUsd
  } catch { /* bad JSON — fall through */ }
  const [pay, book] = await Promise.all([
    db.payment.findFirst({ where: { currency: cur, exchangeRate: { gt: 0 } }, orderBy: { createdAt: 'desc' }, select: { exchangeRate: true } }),
    db.booking.findFirst({ where: { currency: cur, exchangeRate: { gt: 0 } }, orderBy: { createdAt: 'desc' }, select: { exchangeRate: true } }),
  ])
  const perUsd = pay?.exchangeRate ?? book?.exchangeRate ?? null
  return perUsd && perUsd > 0 ? 1 / perUsd : null
}

/** amountUsd + fxRate for a deal amount (both null without an amount or a known rate). */
export async function amountUsdFields(db: Db, amount: number | null | undefined, currency: string | null | undefined): Promise<{ amountUsd: number | null; fxRate: number | null }> {
  if (amount == null) return { amountUsd: null, fxRate: null }
  const rate = await usdRate(db, currency)
  return rate == null ? { amountUsd: null, fxRate: null } : { amountUsd: Math.round(amount * rate * 100) / 100, fxRate: rate }
}
