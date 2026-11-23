import type { Prisma, PrismaClient } from '@prisma/client'

// Trip details the website forms send besides trip type / dates / guests (handover §2 "Trip
// details"): destination ("Komodo National Park"), duration ("3–4 Nights") and budget ("18000",
// USD — Freshsales cf_private_charter_budget). Destination and budget go onto the Lead (never
// overwriting what sales set), so the deal name carries the destination (src/lib/deal-name.ts);
// duration is a range, not dates, so it only goes into the deal's enquiry note.

type Db = PrismaClient | Prisma.TransactionClient

const norm = (s: string) => s.toLowerCase().replace(/national\s+park/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Destination id for a form value: exact name, else the one whose name contains / is contained in it. */
export async function matchDestinationId(db: Db, raw: string | null | undefined): Promise<string | null> {
  const v = raw?.trim()
  if (!v) return null
  const all = await db.destination.findMany({ where: { deletedAt: null }, select: { id: true, name: true, isActive: true } })
  const key = norm(v)
  if (!key) return null
  const exact = all.find(d => norm(d.name) === key)
  if (exact) return exact.id
  // "Komodo" ↔ "Komodo National Park"; prefer the shortest (most general) active name.
  const loose = all.filter(d => { const n = norm(d.name); return n && (n.includes(key) || key.includes(n)) })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.length - b.name.length)
  return loose[0]?.id ?? null
}

/** "18000" / "USD 5,000 - 10,000" / "€12.000" → min / max / currency (USD when none is given). */
export function parseBudget(raw: string | null | undefined): { budgetMin: number; budgetMax: number; budgetCurrency: string } | null {
  const v = raw?.trim()
  if (!v) return null
  const nums = (v.match(/\d[\d.,]*/g) ?? [])
    .map(n => Number(n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')))
    .filter(n => Number.isFinite(n) && n > 0)
  if (!nums.length) return null
  const currency = /€|eur/i.test(v) ? 'EUR' : /idr|rp/i.test(v) ? 'IDR' : /aud/i.test(v) ? 'AUD' : /sgd/i.test(v) ? 'SGD' : 'USD'
  return { budgetMin: Math.min(...nums), budgetMax: Math.max(...nums), budgetCurrency: currency }
}
