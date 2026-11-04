import type { Prisma } from '@prisma/client'

export const RECRUITMENT_REASONS = ['New Position', 'Replacement'] as const

// The Recruitment Request shape both the HR screen and the requester's own screen read.
export const RECRUITMENT_REQUEST_INCLUDE = {
  role: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  requesterEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.RecruitmentRequestInclude

// Candidates the requester gets to see on their own request: only the ones HR has moved
// into (or past) the User Interview round — earlier screening stays HR-internal.
export const REQUESTER_VISIBLE_CANDIDATE: Prisma.CandidateWhereInput = {
  OR: [
    { status: { in: ['USER_INTERVIEW', 'OFFER', 'HIRED'] } },
    { userInterviewScheduledAt: { not: null } },
  ],
}
