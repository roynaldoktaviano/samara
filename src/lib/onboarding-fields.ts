// Shared (client + server) definition of the new-joiner Onboarding Form — which fields the
// joiner fills on /onboarding/[token], which are required, and which documents they upload.
// The public page renders straight off ONBOARDING_SECTIONS / ONBOARDING_DOCS, and the submit
// API validates with missingOnboardingFields(), so the two can never disagree.
//
// Field keys match the OnboardingForm (and Employee) columns of the same name.

export type OnboardingFormType = 'STANDARD' | 'FREELANCE'
export type OnboardingStatus = 'INVITED' | 'SUBMITTED' | 'REVISION_REQUESTED' | 'APPROVED' | 'PROBATION_STARTED' | 'APPLIED' | 'CANCELLED'
/** NEW_JOINER = hire → Start Probation; EMPLOYEE_UPDATE = existing employee updates their own data. */
export type OnboardingPurpose = 'NEW_JOINER' | 'EMPLOYEE_UPDATE'

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  INVITED: 'Invited',
  SUBMITTED: 'Submitted',
  REVISION_REQUESTED: 'Revision Requested',
  APPROVED: 'Approved',
  PROBATION_STARTED: 'Probation Started',
  APPLIED: 'Employee Updated',
  CANCELLED: 'Cancelled',
}

/** States in which the joiner may still edit their form via the public link. */
export const ONBOARDING_EDITABLE: OnboardingStatus[] = ['INVITED', 'REVISION_REQUESTED']
/** Terminal states — the form is frozen and the link no longer works. */
export const ONBOARDING_CLOSED: OnboardingStatus[] = ['PROBATION_STARTED', 'APPLIED', 'CANCELLED']

/**
 * `required`: true = always; 'indonesian' = only when nationality is Indonesian (KK only
 * exists for Indonesian citizens); false = optional.
 * `freelance`: how the field behaves on the shorter FREELANCE form — 'hidden', 'optional',
 * or omitted to behave exactly like the standard form.
 */
type Requirement = boolean | 'indonesian'
interface FieldDef {
  key: OnboardingTextField
  label: string
  type: 'text' | 'date' | 'select' | 'textarea' | 'tel' | 'email'
  options?: { value: string; label: string }[]
  placeholder?: string
  required: Requirement
  freelance?: 'hidden' | 'optional'
  // Rendered across both grid columns on the public page.
  wide?: boolean
}

export const ONBOARDING_TEXT_FIELDS = [
  'fullName', 'nickName', 'gender', 'birthDate', 'placeOfBirth', 'nationality', 'religion', 'nikPassport',
  'motherName', 'maritalStatus', 'phone', 'personalEmail', 'address', 'addressCurrent',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
  'npwp', 'kkNumber', 'bankName', 'bankAccountNumber', 'bankAccountName', 'bpjsKesehatanNumber', 'bpjsTkNumber',
] as const
export type OnboardingTextField = typeof ONBOARDING_TEXT_FIELDS[number]

export const ONBOARDING_DOC_KEYS = [
  'ktpFiles', 'kkFiles', 'npwpFiles', 'photoFiles', 'ijazahFiles', 'certificateFiles',
  'seamanBookFiles', 'bstFiles', 'medicalCheckupFiles',
] as const
export type OnboardingDocField = typeof ONBOARDING_DOC_KEYS[number]

export const RELIGIONS = ['Islam', 'Protestant', 'Catholic', 'Hindu', 'Buddhist', 'Confucian', 'Other']
export const MARITAL_STATUS_OPTIONS = [
  { value: 'TK', label: 'Single (TK)' },
  { value: 'K0', label: 'Married, no children (K0)' },
  { value: 'K1', label: 'Married, 1 child (K1)' },
  { value: 'K2', label: 'Married, 2 children (K2)' },
  { value: 'K3', label: 'Married, 3+ children (K3)' },
]

export const ONBOARDING_SECTIONS: { title: string; description?: string; standardOnly?: boolean; fields: FieldDef[] }[] = [
  {
    title: 'Personal Information',
    description: 'Please write your name exactly as it appears on your ID card / passport.',
    fields: [
      { key: 'fullName', label: 'Full Name', type: 'text', required: true, wide: true },
      { key: 'nickName', label: 'Nickname', type: 'text', required: false },
      { key: 'gender', label: 'Gender', type: 'select', required: true, options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }] },
      { key: 'placeOfBirth', label: 'Place of Birth', type: 'text', required: true, freelance: 'optional' },
      { key: 'birthDate', label: 'Date of Birth', type: 'date', required: true },
      { key: 'nationality', label: 'Nationality', type: 'text', required: true, placeholder: 'e.g. Indonesian' },
      { key: 'religion', label: 'Religion', type: 'select', required: true, freelance: 'hidden', options: RELIGIONS.map(r => ({ value: r, label: r })) },
      { key: 'maritalStatus', label: 'Marital Status', type: 'select', required: true, freelance: 'hidden', options: MARITAL_STATUS_OPTIONS },
      { key: 'motherName', label: "Mother's Maiden Name", type: 'text', required: true, freelance: 'hidden' },
    ],
  },
  {
    title: 'Contact & Address',
    fields: [
      { key: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: true },
      { key: 'personalEmail', label: 'Personal Email', type: 'email', required: true, freelance: 'optional' },
      { key: 'address', label: 'Address (as on ID card)', type: 'textarea', required: true, wide: true },
      { key: 'addressCurrent', label: 'Current Address (if different)', type: 'textarea', required: false, wide: true },
    ],
  },
  {
    title: 'Emergency Contact',
    fields: [
      { key: 'emergencyContactName', label: 'Name', type: 'text', required: true },
      { key: 'emergencyContactRelation', label: 'Relationship', type: 'text', required: true, placeholder: 'e.g. Spouse, Parent' },
      { key: 'emergencyContactPhone', label: 'Phone', type: 'tel', required: true },
    ],
  },
  {
    title: 'Identity & Tax',
    fields: [
      { key: 'nikPassport', label: 'NIK (ID Number) / Passport Number', type: 'text', required: true },
      { key: 'kkNumber', label: 'Family Card (KK) Number', type: 'text', required: 'indonesian', freelance: 'hidden' },
      { key: 'npwp', label: 'NPWP (Tax ID)', type: 'text', required: false, freelance: 'hidden', placeholder: 'Leave empty if you don\'t have one' },
    ],
  },
  {
    title: 'Bank Account',
    description: 'Salary will be transferred to this account.',
    fields: [
      { key: 'bankName', label: 'Bank Name', type: 'text', required: true },
      { key: 'bankAccountNumber', label: 'Account Number', type: 'text', required: true },
      { key: 'bankAccountName', label: 'Account Holder Name', type: 'text', required: true },
    ],
  },
  {
    title: 'BPJS',
    description: 'Fill in only if you are already registered.',
    standardOnly: true,
    fields: [
      { key: 'bpjsKesehatanNumber', label: 'BPJS Kesehatan Number', type: 'text', required: false, freelance: 'hidden' },
      { key: 'bpjsTkNumber', label: 'BPJS Ketenagakerjaan Number', type: 'text', required: false, freelance: 'hidden' },
    ],
  },
]

interface DocDef {
  key: OnboardingDocField
  label: string
  hint?: string
  required: Requirement
  freelance?: 'hidden' | 'optional'
  crewOnly?: boolean
}

export const ONBOARDING_DOCS: DocDef[] = [
  { key: 'ktpFiles', label: 'ID Card (KTP) / Passport', hint: 'Clear photo or scan, all corners visible', required: true },
  { key: 'photoFiles', label: 'Passport Photo', hint: 'Recent photo, plain background', required: true, freelance: 'hidden' },
  { key: 'kkFiles', label: 'Family Card (KK)', required: 'indonesian', freelance: 'hidden' },
  { key: 'npwpFiles', label: 'NPWP Card', required: false, freelance: 'hidden' },
  { key: 'ijazahFiles', label: 'Last Diploma (Ijazah)', required: false, freelance: 'hidden' },
  { key: 'certificateFiles', label: 'Other Certificates', hint: 'Training, skills, licences — optional', required: false },
  { key: 'seamanBookFiles', label: 'Seaman Book (Buku Pelaut)', required: true, crewOnly: true },
  { key: 'bstFiles', label: 'BST (Basic Safety Training)', required: true, crewOnly: true },
  { key: 'medicalCheckupFiles', label: 'Medical Check Up', required: true, crewOnly: true },
]

export const ONBOARDING_DOC_LABEL: Record<OnboardingDocField, string> =
  Object.fromEntries(ONBOARDING_DOCS.map(d => [d.key, d.label])) as Record<OnboardingDocField, string>

export function isIndonesian(nationality: string | null | undefined): boolean {
  return /indonesia|\bwni\b/i.test(nationality ?? '')
}

interface Ctx { formType: OnboardingFormType; isCrew: boolean; nationality?: string | null }

export function isFieldVisible(f: { freelance?: 'hidden' | 'optional' }, ctx: Ctx): boolean {
  return !(ctx.formType === 'FREELANCE' && f.freelance === 'hidden')
}

export function isDocVisible(d: DocDef, ctx: Ctx): boolean {
  if (d.crewOnly && !ctx.isCrew) return false
  return isFieldVisible(d, ctx)
}

function isRequired(f: { required: Requirement; freelance?: 'hidden' | 'optional' }, ctx: Ctx): boolean {
  if (ctx.formType === 'FREELANCE' && f.freelance) return false
  if (f.required === 'indonesian') return isIndonesian(ctx.nationality)
  return f.required
}

export function isFieldRequired(f: FieldDef, ctx: Ctx) { return isFieldVisible(f, ctx) && isRequired(f, ctx) }
export function isDocRequired(d: DocDef, ctx: Ctx) { return isDocVisible(d, ctx) && isRequired(d, ctx) }

/** Every field key the joiner is allowed to write for this form (hidden ones are rejected). */
export function visibleTextFields(ctx: Ctx): OnboardingTextField[] {
  return ONBOARDING_SECTIONS.flatMap(s => s.fields).filter(f => isFieldVisible(f, ctx)).map(f => f.key)
}

export function visibleDocFields(ctx: Ctx): OnboardingDocField[] {
  return ONBOARDING_DOCS.filter(d => isDocVisible(d, ctx)).map(d => d.key)
}

/**
 * Labels of every required field/document still empty. `docCounts` is the number of files
 * uploaded per document field (the public API never sends file contents back to the joiner).
 */
export function missingOnboardingFields(
  values: Partial<Record<OnboardingTextField, string | null>>,
  docCounts: Partial<Record<OnboardingDocField, number>>,
  ctx: Omit<Ctx, 'nationality'>,
): string[] {
  const full: Ctx = { ...ctx, nationality: values.nationality ?? null }
  const missing: string[] = []
  for (const f of ONBOARDING_SECTIONS.flatMap(s => s.fields)) {
    if (isFieldRequired(f, full) && !String(values[f.key] ?? '').trim()) missing.push(f.label)
  }
  for (const d of ONBOARDING_DOCS) {
    if (isDocRequired(d, full) && !(docCounts[d.key] ?? 0)) missing.push(d.label)
  }
  return missing
}

export const DEFAULT_PROBATION_MONTHS = 3
export const ONBOARDING_LINK_DAYS = 14
export const ONBOARDING_MAX_FILES_PER_FIELD = 10
