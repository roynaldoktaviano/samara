// Pure calculation helpers for the Payroll feature. No DB access here — the bulk
// "generate entries" API route calls these to build a starting draft per employee, and
// every figure they return stays manually overridable on PayslipEntry afterwards.

export interface EmployeeForPayroll {
  basicSalary: number | null
  allowance: number | null
  uangLayar: number | null
  uangMakan: number | null
  benefit: number | null
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

export interface AttendanceInput {
  workingDays: number        // Mon–Fri days in the period's month
  nonHadirWorkingDays: number // of those, how many this employee has a non-HADIR record for
}

export interface PayslipEntryDraft {
  basicSalary: number
  functionAllowance: number
  mealAllowance: number
  uangLayar: number
  commission: number
  thr: number
  benefitBpjsAndTax: number
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

// Combines the above into one draft. Only Basic Salary, Function Allowance, Uang Layar,
// Meal Allowance, and Benefit are pre-filled from the employee's profile — every BPJS
// figure, PPh21, Commission, THR, and Loan default to 0 and must be entered by hand each
// period (HR/Finance decided against auto-calculating these — too much room for a wrong
// government-rate assumption to silently misstate a real paycheck).
// Meal Allowance = Employee.uangMakan (a per-day rate) × actual working days present —
// any non-HADIR Attendance Recap day (Izin/Sakit/Cuti/Alpha/Libur) reduces it.
export function buildPayslipEntryDraft(employee: EmployeeForPayroll, attendance: AttendanceInput): PayslipEntryDraft {
  const basicSalary = employee.basicSalary ?? 0
  const functionAllowance = employee.allowance ?? 0
  const daysPresent = Math.max(0, attendance.workingDays - attendance.nonHadirWorkingDays)
  const mealAllowance = (employee.uangMakan ?? 0) * daysPresent
  const uangLayar = employee.uangLayar ?? 0

  return {
    basicSalary, functionAllowance, mealAllowance, uangLayar,
    commission: 0, thr: 0,
    benefitBpjsAndTax: employee.benefit ?? 0,
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
  benefitBpjsAndTax: number
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
    + entry.commission + entry.thr + entry.benefitBpjsAndTax
  const totalDeductions = entry.bpjsJhtEmployee + entry.bpjsJpEmployee + entry.bpjsKesehatanEmployee + entry.pph21 + entry.loanDeduction
  // Benefit (BPJS & Tax) is a non-cash earning line (employer's own BPJS contribution,
  // shown for total-compensation transparency) — it was never cash paid, so it's excluded
  // from take-home pay even though it counts toward grossEarnings above.
  const takeHomePay = grossEarnings - entry.benefitBpjsAndTax - totalDeductions
  return { grossEarnings, totalDeductions, takeHomePay }
}
