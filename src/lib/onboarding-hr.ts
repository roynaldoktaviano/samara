import type { Prisma } from '@prisma/client'
import { ONBOARDING_DOC_KEYS, ONBOARDING_TEXT_FIELDS, type OnboardingDocField } from '@/lib/onboarding-fields'
import { cleanValue } from '@/lib/onboarding-save'

// Shared by the HR-side /api/hr/onboarding routes.

export const ONBOARDING_HR_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR']

export const ONBOARDING_INCLUDE = {
  role: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  legalEntity: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true } },
  candidate: { select: { id: true, fullName: true, status: true } },
  employee: { select: { id: true, employeeNumber: true, fullName: true } },
} satisfies Prisma.OnboardingFormInclude

/** Never leaves the server: the PIN hash and token-guessing counters. */
const SECRET_OMIT = { pinHash: true, pinFailedAttempts: true } as const
/** List views skip the (large) document data URLs and only report counts. */
export const LIST_OMIT = {
  ...SECRET_OMIT,
  ...Object.fromEntries(ONBOARDING_DOC_KEYS.map(k => [k, true])),
} as Record<OnboardingDocField | keyof typeof SECRET_OMIT, true>
export const DETAIL_OMIT = SECRET_OMIT

function toFloatOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? null : n
}

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Builds a Prisma update from an HR edit payload — only keys actually present are written.
 * HR can set the internal fields AND correct anything the joiner typed (including documents).
 */
export type OnboardingHrFields = Partial<Prisma.OnboardingFormUncheckedCreateInput>

export function hrFieldsFromBody(body: Record<string, unknown>): OnboardingHrFields {
  const data: OnboardingHrFields = {}
  const has = (k: string) => k in body

  if (has('formType')) data.formType = body.formType === 'FREELANCE' ? 'FREELANCE' : 'STANDARD'
  if (has('inviteEmail')) data.inviteEmail = str(body.inviteEmail)
  if (has('roleId')) data.roleId = str(body.roleId)
  if (has('department')) data.department = str(body.department)
  if (has('locationId')) data.locationId = str(body.locationId)
  if (has('legalEntityId')) data.legalEntityId = str(body.legalEntityId)
  if (has('businessUnitId')) data.businessUnitId = str(body.businessUnitId)
  if (has('managerId')) data.managerId = str(body.managerId)
  if (has('joinDate')) data.joinDate = toDateOrNull(body.joinDate)
  if (has('probationEndDate')) data.probationEndDate = toDateOrNull(body.probationEndDate)
  if (has('isCrew')) data.isCrew = body.isCrew === true
  if (has('basicSalary')) data.basicSalary = toFloatOrNull(body.basicSalary)
  if (has('allowance')) data.allowance = toFloatOrNull(body.allowance)
  if (has('freelanceFee')) data.freelanceFee = toFloatOrNull(body.freelanceFee)
  if (has('freelanceFeeType')) data.freelanceFeeType = str(body.freelanceFeeType)

  for (const key of ONBOARDING_TEXT_FIELDS) {
    if (!has(key)) continue
    const v = cleanValue(key, body[key])
    if (key === 'fullName') { if (v) data.fullName = v as string; continue }
    ;(data as Record<string, unknown>)[key] = v
  }
  for (const key of ONBOARDING_DOC_KEYS) {
    if (has(key) && Array.isArray(body[key])) {
      ;(data as Record<string, unknown>)[key] = (body[key] as unknown[]).filter((f): f is string => typeof f === 'string')
    }
  }
  return data
}

/** joinDate + N months (same day-of-month, clamped to month end). */
export function addMonths(date: Date, months: number) {
  const d = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return d
}
