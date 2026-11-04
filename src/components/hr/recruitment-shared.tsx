import type { StatusTone } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/format'

// Shared between the HR "Recruitment" screen and the requester's "Recruitment Request" screen.

export type RecruitmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLOSED' | 'CANCELLED'
export type InterviewResult = 'PASSED' | 'ON_HOLD' | 'FAILED'

export interface RecruitmentRequestBase {
  id: string
  role: { id: string; title: string }
  headcount: number
  location: { id: string; name: string } | null
  employmentStatus: string | null
  reason: string
  replacementFor: string | null
  targetJoinDate: string | null
  jobDescription: string | null
  notes: string | null
  status: RecruitmentStatus
  requestedBy: { id: string; name: string | null }
  requesterEmployee: { id: string; fullName: string; employeeNumber: string } | null
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  closedAt: string | null
  createdAt: string
}

export const REQUEST_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}
export const REQUEST_STATUS_TONE: Record<RecruitmentStatus, StatusTone> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'destructive', CLOSED: 'neutral', CANCELLED: 'neutral',
}

export const CANDIDATE_STAGE_LABEL: Record<string, string> = {
  TALENT_POOL: 'Talent Pool', SHORTLISTED: 'Shortlisted', ASSESSMENT: 'Assessment', HR_INTERVIEW: 'HR Interview',
  USER_INTERVIEW: 'User Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
}

export const RESULT_LABEL: Record<InterviewResult, string> = { PASSED: 'Passed', ON_HOLD: 'On Hold', FAILED: 'Failed' }
export const RESULT_TONE: Record<InterviewResult, StatusTone> = { PASSED: 'success', ON_HOLD: 'warning', FAILED: 'destructive' }

// Same values as Employees' Employment Status picker (EmployeesPage EMPLOYMENT_STATUSES).
export const EMPLOYMENT_STATUSES = ['Probation', 'Internship', 'Freelance', 'Contract (PKWT)', 'Permanent (PKWTT)']
export const RECRUITMENT_REASONS = ['New Position', 'Replacement'] as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
      <div className="text-sm font-medium mt-0.5">{children}</div>
    </div>
  )
}

/** The request's own details — identical on both screens. */
export function RecruitmentRequestDetails({ request: r }: { request: RecruitmentRequestBase }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Headcount">{r.headcount}</Field>
        <Field label="Work Location">{r.location?.name ?? '—'}</Field>
        <Field label="Employment Status">{r.employmentStatus ?? '—'}</Field>
        <Field label="Reason">{r.reason}{r.replacementFor && <span className="text-muted-foreground font-normal"> · replacing {r.replacementFor}</span>}</Field>
        <Field label="Target Join Date">{r.targetJoinDate ? formatDate(r.targetJoinDate) : '—'}</Field>
      </div>

      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Job Description</p>
        {r.jobDescription
          ? <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm whitespace-pre-wrap">{r.jobDescription}</div>
          : <p className="text-sm text-muted-foreground">No job description.</p>}
      </div>

      {r.notes && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t pt-3">
        Requested {formatDate(r.createdAt)} by {r.requesterEmployee?.fullName ?? r.requestedBy.name ?? 'Unknown'}
      </div>

      {(r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'CLOSED') && (
        <div className="text-xs text-muted-foreground">
          {r.status === 'REJECTED' ? 'Rejected' : 'Approved'}{r.decidedAt && ` ${formatDate(r.decidedAt)}`}{r.decidedBy?.name && ` by ${r.decidedBy.name}`}
          {r.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{r.decisionNote}</p>}
        </div>
      )}
      {r.status === 'CLOSED' && r.closedAt && <div className="text-xs text-muted-foreground">Closed {formatDate(r.closedAt)}</div>}
    </div>
  )
}
