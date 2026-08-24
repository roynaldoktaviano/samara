// Worst-case severance estimate under Indonesian labor law (UU Cipta Kerja / PP 35/2021
// Pasal 40 severance tables), assuming an employer-initiated termination without cause
// — the scenario that maxes out the statutory multiplier, which is what "exit exposure"
// for HR planning purposes should size against. This is a planning estimate only: it
// excludes uang penggantian hak (rights compensation, ~15% on top in many cases) and
// doesn't vary by actual termination reason (resignation, retirement, etc. pay less or
// nothing) — never present this as a legal or final payout figure without HR/legal review.

function yearsOfService(joinDate: Date, asOf: Date): number {
  const ms = asOf.getTime() - joinDate.getTime()
  return ms / (365.25 * 86400000)
}

// Uang Pesangon — severance pay multiplier of monthly wage, by full years of service.
function severanceMultiplier(years: number): number {
  if (years < 1) return 1
  if (years < 2) return 2
  if (years < 3) return 3
  if (years < 4) return 4
  if (years < 5) return 5
  if (years < 6) return 6
  if (years < 7) return 7
  if (years < 8) return 8
  return 9
}

// Uang Penghargaan Masa Kerja — long-service pay multiplier, only kicks in at 3+ years.
function longServiceMultiplier(years: number): number {
  if (years < 3) return 0
  if (years < 6) return 2
  if (years < 9) return 3
  if (years < 12) return 4
  if (years < 15) return 5
  if (years < 18) return 6
  if (years < 21) return 7
  if (years < 24) return 8
  return 10
}

/** Monthly wage for the calc is basicSalary + allowance (fixed pay components) — variable/
 *  reimbursement-style items like uangLayar/uangMakan are excluded, matching how "upah"
 *  is typically defined for severance purposes. Returns 0 when joinDate or wage is missing. */
export function estimateExitExposure(
  joinDate: Date | null,
  basicSalary: number | null,
  allowance: number | null,
  asOf: Date = new Date(),
): number {
  if (!joinDate) return 0
  const wage = (basicSalary ?? 0) + (allowance ?? 0)
  if (wage <= 0) return 0
  const years = yearsOfService(joinDate, asOf)
  const multiplier = severanceMultiplier(years) + longServiceMultiplier(years)
  return multiplier * wage
}
