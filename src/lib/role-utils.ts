// Combined roles (a user who does the work of two divisions) don't get their own separate
// permission set — they're treated as satisfying every check either underlying role would.
// Add new combos here rather than sprinkling role literals through every route/component.
const ROLE_ALIASES: Record<string, string[]> = {
  SALES_MARKETING: ['SALES', 'MARKETING'],
  MARKETING_DIRECTOR: ['MARKETING'],
  FINANCE_DIRECTOR: ['PURCHASING', 'FINANCE', 'HR'],
  // This tenant's HR account also handles Purchasing day-to-day — the sidebar was
  // already opened up to every purchasing-* module via Roles & Permissions, but each
  // purchasing API route checks its own hardcoded ALLOWED list (independent of that
  // sidebar override), so HR still got 401s and every purchasing page rendered empty.
  HR: ['PURCHASING'],
}

/** True if `userRole` is directly in `allowed`, or is a combined role that includes one that is. */
export function roleMatches(userRole: string | null | undefined, allowed: readonly string[]): boolean {
  if (!userRole) return false
  if (allowed.includes(userRole)) return true
  return (ROLE_ALIASES[userRole] ?? []).some(r => allowed.includes(r))
}
