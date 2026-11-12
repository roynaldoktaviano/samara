'use client'

import { useSession } from 'next-auth/react'

// Roles that work with quantities only — every price, cost, value and total is hidden from them
// (user 2026-11-12: "di role warehouse semua yang ada value dan nominalnya hilangkan").
export const PRICE_HIDDEN_ROLES = ['WAREHOUSE'] as const

export function hidesPrices(role: string | null | undefined) {
  return !!role && (PRICE_HIDDEN_ROLES as readonly string[]).includes(role)
}

/** True when the signed-in user must not see any money figure. */
export function useHidePrices() {
  const { data: session } = useSession()
  return hidesPrices((session?.user as { role?: string } | undefined)?.role)
}
