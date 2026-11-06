import type { CandidateStatus, Prisma } from '@prisma/client'

// Shared by every /api/hr/candidates response so the Candidates page always gets the
// same shape back, whichever endpoint it just called.
export const CANDIDATE_INCLUDE = {
  appliedRole: { select: { id: true, title: true } },
  recruitmentRequest: {
    select: {
      id: true, status: true, headcount: true,
      role: { select: { id: true, title: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  },
  userInterviewRecordedBy: { select: { id: true, name: true } },
  // The live (non-cancelled) Onboarding Form, if HR already sent one — drives the row badge.
  onboardingForms: { where: { status: { not: 'CANCELLED' } }, select: { id: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.CandidateInclude

// Pipeline order — same order as the CandidateStatus enum. TALENT_POOL is labelled "New" in the UI.
export const CANDIDATE_STATUSES = [
  'TALENT_POOL', 'SHORTLISTED', 'PRESCREEN', 'ASSESSMENT', 'HR_INTERVIEW', 'USER_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
] as const satisfies readonly CandidateStatus[]

export const INTERVIEW_RESULTS = ['PASSED', 'ON_HOLD', 'FAILED'] as const
export type InterviewResultValue = typeof INTERVIEW_RESULTS[number]

/** undefined = field not sent; null = cleared; otherwise a valid enum value. Throws on junk. */
export function parseInterviewResult(v: unknown): InterviewResultValue | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v === 'string' && (INTERVIEW_RESULTS as readonly string[]).includes(v)) return v as InterviewResultValue
  throw new Error('Invalid interview result')
}
