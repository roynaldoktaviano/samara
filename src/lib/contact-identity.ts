import type { Prisma, PrismaClient } from '@prisma/client'

// Who-is-this-person matching for everything that comes in (website forms, Meta Lead Ads,
// WhatsApp), the same rule the Freshsales deal maker used:
//   1. normalised email (trim + lowercase, compared case-insensitively)
//   2. else the EXACT E.164 phone — never a partial / last-N-digits search
// A Guest (Customer) wins over a Lead, so a returning guest attaches to their guest profile.

type Db = PrismaClient | Prisma.TransactionClient

// Invisible direction marks / zero-width chars that phones copied from WhatsApp or a PDF carry.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.replace(INVISIBLE, '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
}

/**
 * E.164 ("+6281234567890") or null. Same rule as the website's snippet 68: keep a leading +,
 * turn a leading 00 into +, and never invent a country — a local "0812…" or bare digits
 * without + / 00 give null. Set `international` for numbers that are known to carry their
 * country code without a + (a WhatsApp wa_id such as "6281234567890").
 *
 * Mirrored in SQL by the phone_e164() function of scripts/migrate-attribution-phase-a.ts,
 * which keeps Lead/Customer.phoneE164 filled — change both together.
 */
export function toE164(raw: string | null | undefined, opts: { international?: boolean } = {}): string | null {
  if (!raw) return null
  const s = raw.replace(INVISIBLE, '').trim()
  let digits: string
  if (s.startsWith('+')) digits = s.slice(1).replace(/\D/g, '')
  else if (s.startsWith('00')) digits = s.slice(2).replace(/\D/g, '')
  else if (opts.international) digits = s.replace(/\D/g, '')
  else return null
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null
}

export type IdentityMatch =
  | { type: 'customer'; id: string }
  | { type: 'lead'; id: string }

/** Guest first, then Lead — email first, then exact E.164 phone. */
export async function findContactByIdentity(db: Db, identity: { email?: string | null; phoneE164?: string | null }): Promise<IdentityMatch | null> {
  const email = normalizeEmail(identity.email)
  const phone = identity.phoneE164 ?? null
  if (email) {
    const c = await db.customer.findFirst({ where: { deletedAt: null, email: { equals: email, mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (c) return { type: 'customer', id: c.id }
  }
  if (phone) {
    const c = await db.customer.findFirst({ where: { deletedAt: null, phoneE164: phone }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (c) return { type: 'customer', id: c.id }
  }
  const lead = await findLeadByIdentity(db, { email, phoneE164: phone })
  return lead ? { type: 'lead', id: lead } : null
}

/** Live Lead with this email (case-insensitive), else this exact E.164 phone. Newest wins. */
export async function findLeadByIdentity(db: Db, identity: { email?: string | null; phoneE164?: string | null }): Promise<string | null> {
  const email = normalizeEmail(identity.email)
  if (email) {
    const l = await db.lead.findFirst({ where: { deletedAt: null, email: { equals: email, mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (l) return l.id
  }
  if (identity.phoneE164) {
    const l = await db.lead.findFirst({ where: { deletedAt: null, phoneE164: identity.phoneE164 }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (l) return l.id
  }
  return null
}

export async function findCustomerIdByPhone(db: Db, phoneE164: string | null): Promise<string | null> {
  if (!phoneE164) return null
  const c = await db.customer.findFirst({ where: { deletedAt: null, phoneE164 }, orderBy: { createdAt: 'desc' }, select: { id: true } })
  return c?.id ?? null
}

/**
 * "Never overwrite" — of `incoming`, keeps only the fields that are non-empty AND empty on
 * `existing`, so an inbound form/chat can fill gaps but never replaces what a person (or an
 * earlier source) already put there.
 */
export function fillEmptyOnly<T extends Record<string, unknown>>(existing: Partial<Record<keyof T, unknown>>, incoming: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    const v = incoming[key]
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) continue
    const cur = existing[key]
    if (cur === null || cur === undefined || (typeof cur === 'string' && cur.trim() === '')) out[key] = v
  }
  return out
}

/**
 * A lead's display name that is only a stand-in — its email, its phone, or a bare number /
 * "@handle" / "Instagram user" from a chat profile — and may be replaced by a real name.
 */
export function isPlaceholderName(name: string | null | undefined, lead: { email?: string | null; phone?: string | null }): boolean {
  const n = (name ?? '').trim()
  if (!n) return true
  if (lead.email && n.toLowerCase() === lead.email.trim().toLowerCase()) return true
  if (lead.phone && n.replace(/\D/g, '') === lead.phone.replace(/\D/g, '') && /\d/.test(n)) return true
  if (/^[+\d\s().-]+$/.test(n)) return true
  if (/^@/.test(n) || /^(Instagram|Messenger) user$/i.test(n)) return true
  return false
}
