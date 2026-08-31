// Pure calculation helpers for the Payroll feature. No DB access here — the bulk
// "generate entries" API route calls these to build a starting draft per employee, and
// every figure they return stays manually overridable on PayslipEntry afterwards.

export interface OtherIncomeItem {
  id: string
  name: string
  description: string
  amount: number
}

export interface EmployeeForPayroll {
  basicSalary: number | null
  allowance: number | null
  uangLayar: number | null
  uangMakan: number | null
  thr: number | null
  otherIncome: unknown // Prisma Json column — cast to OtherIncomeItem[] below
}

// Work week is Monday–Friday (confirmed by the business) — counts working days in a
// given month for the Meal Allowance baseline (see AttendanceInput below).
export function countWeekdaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay() // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export interface DateRange {
  start: Date
  end: Date
}

// Bookings in these statuses represent a trip that's actually happening/happened —
// excludes not-yet-confirmed (pending/on_hold) and cancelled bookings. Shared by crew
// Uang Layar (payroll generation) and Leave Request trip-coverage lookup.
export const TRIP_BOOKING_STATUSES = ['confirmed', 'partially_paid', 'fully_paid', 'completed', 'pending_refund'] as const

// An employee's work location name doubles as the name of the yacht they're stationed
// on (e.g. "Bali"/"Bajo" are shore locations, anything else is usually a boat name) — no
// separate crew-assignment data needed, just match the two name lists case-insensitively.
export function matchEmployeesToYachts(
  employees: { id: string; locationName: string | null }[],
  yachts: { id: string; name: string }[],
): Map<string, string> {
  const yachtIdByLocationName = new Map(yachts.map(y => [y.name.trim().toLowerCase(), y.id]))
  const result = new Map<string, string>()
  for (const emp of employees) {
    const locName = emp.locationName?.trim().toLowerCase()
    const yachtId = locName ? yachtIdByLocationName.get(locName) : undefined
    if (yachtId) result.set(emp.id, yachtId)
  }
  return result
}

// Merges overlapping date ranges (e.g. multiple Bookings for the same yacht) and counts
// the total number of calendar days covered, clipped to [periodStart, periodEnd]
// inclusive on both ends. Used to turn a yacht's trip schedule into "days sailed this
// payroll period" for crew Uang Layar.
export function countTripDaysInPeriod(ranges: DateRange[], periodStart: Date, periodEnd: Date): number {
  const clipped = ranges
    .map(r => ({
      start: r.start > periodStart ? r.start : periodStart,
      end: r.end < periodEnd ? r.end : periodEnd,
    }))
    .filter(r => r.start <= r.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const msPerDay = 24 * 60 * 60 * 1000
  let totalDays = 0
  let curStart: Date | null = null
  let curEnd: Date | null = null
  for (const r of clipped) {
    if (curEnd && r.start.getTime() <= curEnd.getTime() + msPerDay) {
      if (r.end > curEnd) curEnd = r.end
    } else {
      if (curStart && curEnd) totalDays += Math.floor((curEnd.getTime() - curStart.getTime()) / msPerDay) + 1
      curStart = r.start
      curEnd = r.end
    }
  }
  if (curStart && curEnd) totalDays += Math.floor((curEnd.getTime() - curStart.getTime()) / msPerDay) + 1
  return totalDays
}

export interface AttendanceInput {
  workingDays: number        // Mon–Fri days in the period's month
  nonHadirWorkingDays: number // of those, how many this employee has a non-HADIR record for
}

export interface PayslipEntryDraft {
  basicSalary: number
  functionAllowance: number
  mealAllowance: number
  uangLayar: number
  uangLayarTripDays: number | null
  commission: number
  thr: number
  otherIncomeSnap: OtherIncomeItem[]
  otherIncomeTotal: number
  bpjsJkkCompany: number
  bpjsJkmCompany: number
  bpjsJhtCompany: number
  bpjsJpCompany: number
  bpjsKesehatanCompany: number
  bpjsJhtEmployee: number
  bpjsJpEmployee: number
  bpjsKesehatanEmployee: number
  pph21: number
  loanDeduction: number
}

// Combines the above into one draft. Basic Salary, Function Allowance, Meal Allowance,
// Uang Layar, THR, and Other Income are pre-filled from the employee's profile — every
// BPJS figure, PPh21, Commission, and Loan default to 0 and must be entered by hand each
// period (HR/Finance decided against auto-calculating these — too much room for a wrong
// government-rate assumption to silently misstate a real paycheck).
// Meal Allowance = Employee.uangMakan (a per-day rate) × actual working days present —
// any non-HADIR Attendance Recap day (Izin/Sakit/Cuti/Alpha/Libur) reduces it.
// Uang Layar = Employee.uangLayar (a base daily rate). If tripDays is not null (the
// employee's work location matched a Yacht), it's rate × tripDays; otherwise it's paid
// flat, unchanged, for shore-based staff.
export function buildPayslipEntryDraft(employee: EmployeeForPayroll, attendance: AttendanceInput, tripDays: number | null): PayslipEntryDraft {
  const basicSalary = employee.basicSalary ?? 0
  const functionAllowance = employee.allowance ?? 0
  const daysPresent = Math.max(0, attendance.workingDays - attendance.nonHadirWorkingDays)
  const mealAllowance = (employee.uangMakan ?? 0) * daysPresent
  const uangLayarRate = employee.uangLayar ?? 0
  const uangLayar = tripDays != null ? uangLayarRate * tripDays : uangLayarRate
  const otherIncomeSnap = (employee.otherIncome as OtherIncomeItem[] | null) ?? []
  const otherIncomeTotal = otherIncomeSnap.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  return {
    basicSalary, functionAllowance, mealAllowance, uangLayar, uangLayarTripDays: tripDays,
    commission: 0, thr: employee.thr ?? 0,
    otherIncomeSnap, otherIncomeTotal,
    bpjsJkkCompany: 0,
    bpjsJkmCompany: 0,
    bpjsJhtCompany: 0,
    bpjsJpCompany: 0,
    bpjsKesehatanCompany: 0,
    bpjsJhtEmployee: 0,
    bpjsJpEmployee: 0,
    bpjsKesehatanEmployee: 0,
    pph21: 0,
    loanDeduction: 0,
  }
}

export interface TotalsInput {
  basicSalary: number
  functionAllowance: number
  mealAllowance: number
  uangLayar: number
  commission: number
  thr: number
  otherIncomeTotal: number
  bpjsJhtEmployee: number
  bpjsJpEmployee: number
  bpjsKesehatanEmployee: number
  pph21: number
  loanDeduction: number
}

export interface Totals {
  grossEarnings: number
  totalDeductions: number
  takeHomePay: number
}

// Called on every write (generate + manual edit) so totals never drift out of sync.
export function computeTotals(entry: TotalsInput): Totals {
  const grossEarnings = entry.basicSalary + entry.functionAllowance + entry.mealAllowance + entry.uangLayar
    + entry.commission + entry.thr + entry.otherIncomeTotal
  const totalDeductions = entry.bpjsJhtEmployee + entry.bpjsJpEmployee + entry.bpjsKesehatanEmployee + entry.pph21 + entry.loanDeduction
  const takeHomePay = grossEarnings - totalDeductions
  return { grossEarnings, totalDeductions, takeHomePay }
}
