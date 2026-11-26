import { roleMatches } from '@/lib/role-utils'

// Collaboration Book: a complimentary booking created by Marketing that carries an internal
// budget structure (what the trip needs + what each thing costs). See Booking.isCollaboration.

export const BUDGET_CURRENCIES = ['IDR', 'USD'] as const
export type BudgetCurrency = (typeof BUDGET_CURRENCIES)[number]

/** Who can create a Collaboration Book and edit its budget. MARKETING also matches the
 * combined SALES_MARKETING / MARKETING_DIRECTOR roles via roleMatches' aliases. */
export const COLLABORATION_ROLES = ['MARKETING', 'ADMIN', 'SUPER_ADMIN'] as const

export function canManageCollaboration(role: string | null | undefined): boolean {
  return roleMatches(role, COLLABORATION_ROLES)
}

export function normalizeBudgetCurrency(v: unknown): BudgetCurrency {
  return typeof v === 'string' && (BUDGET_CURRENCIES as readonly string[]).includes(v) ? (v as BudgetCurrency) : 'IDR'
}

export interface BudgetItemInput { name: string; amount: number }

/**
 * Cleans a client-sent budget list: trims names, drops fully-empty rows, and rejects rows with
 * a name but no valid amount (or vice versa) so a typo never silently disappears from the total.
 */
export function parseBudgetItems(raw: unknown): { items: BudgetItemInput[] } | { error: string } {
  if (raw == null) return { items: [] }
  if (!Array.isArray(raw)) return { error: 'budgetItems must be an array' }
  const items: BudgetItemInput[] = []
  for (const r of raw) {
    const name = String((r as { name?: unknown })?.name ?? '').trim()
    const rawAmount = (r as { amount?: unknown })?.amount
    const hasAmount = rawAmount !== '' && rawAmount != null
    if (!name && !hasAmount) continue
    const amount = Number(rawAmount)
    if (!name) return { error: 'Every budget item needs a name' }
    if (!hasAmount || !Number.isFinite(amount) || amount < 0) return { error: `Invalid amount for "${name}"` }
    items.push({ name, amount })
  }
  return { items }
}

export function budgetTotal(items: { amount: number }[]): number {
  return items.reduce((s, i) => s + (i.amount || 0), 0)
}
