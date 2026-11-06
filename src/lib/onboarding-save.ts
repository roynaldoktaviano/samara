import type { OnboardingForm, PrismaClient } from '@prisma/client'
import { ONBOARDING_TEXT_FIELDS, visibleTextFields, type OnboardingTextField } from '@/lib/onboarding-fields'

/** Normalizes one joiner-supplied value for its column. */
export function cleanValue(key: OnboardingTextField, raw: unknown): string | Date | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().slice(0, key === 'address' || key === 'addressCurrent' ? 1000 : 200)
  if (!s) return null
  if (key === 'birthDate') {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return s
}

/** Writes the allowed (visible-for-this-form) fields from `data`. fullName can never be blanked. */
export async function saveJoinerValues(db: PrismaClient, form: OnboardingForm, data: Record<string, unknown>) {
  const allowed = new Set(visibleTextFields({ formType: form.formType, isCrew: form.isCrew }))
  const update: Record<string, string | Date | null> = {}
  for (const key of ONBOARDING_TEXT_FIELDS) {
    if (!(key in data) || !allowed.has(key)) continue
    const v = cleanValue(key, data[key])
    if (key === 'fullName' && !v) continue
    update[key] = v
  }
  return db.onboardingForm.update({ where: { id: form.id }, data: { ...update, lastSavedAt: new Date() } })
}
