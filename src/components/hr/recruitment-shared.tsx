import type { StatusTone } from '@/components/ui/status-badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'

// Shared between the HR "Recruitment" screen and the requester's "Recruitment Request" screen.

export type RecruitmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLOSED' | 'CANCELLED'
export type InterviewResult = 'PASSED' | 'ON_HOLD' | 'FAILED'
export type RecruitmentPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export interface RecruitmentRequestBase {
  id: string
  role: { id: string; title: string }
  headcount: number
  location: { id: string; name: string } | null
  reason: string
  replacementFor: string | null
  targetJoinDate: string | null
  salary: number | null
  priority: RecruitmentPriority
  jobDescription: string | null
  notes: string | null
  status: RecruitmentStatus
  requestedBy: { id: string; name: string | null }
  requesterEmployee: { id: string; fullName: string; employeeNumber: string } | null
  requesterDepartment: string | null
  replacementEmployee: { id: string; fullName: string; employeeNumber: string; role: { title: string } | null } | null
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

export const RECRUITMENT_PRIORITIES: RecruitmentPriority[] = ['LOW', 'MEDIUM', 'HIGH']
export const PRIORITY_LABEL: Record<RecruitmentPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }
export const PRIORITY_TONE: Record<RecruitmentPriority, StatusTone> = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'destructive' }

export function PriorityBadge({ priority }: { priority: RecruitmentPriority }) {
  return <StatusBadge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</StatusBadge>
}

/** "Name · Dept" for whoever raised the request. */
export function requesterLabel(r: RecruitmentRequestBase): string {
  const name = r.requesterEmployee?.fullName ?? r.requestedBy.name ?? 'Unknown'
  return r.requesterDepartment ? `${name} · ${r.requesterDepartment}` : name
}

export const CANDIDATE_STAGE_LABEL: Record<string, string> = {
  TALENT_POOL: 'New', SHORTLISTED: 'Shortlisted', PRESCREEN: 'Prescreen', ASSESSMENT: 'Assessment', HR_INTERVIEW: 'HR Interview',
  USER_INTERVIEW: 'User Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
}

export const RESULT_LABEL: Record<InterviewResult, string> = { PASSED: 'Passed', ON_HOLD: 'On Hold', FAILED: 'Failed' }
export const RESULT_TONE: Record<InterviewResult, StatusTone> = { PASSED: 'success', ON_HOLD: 'warning', FAILED: 'destructive' }

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
        <Field label="Requestor">
          {r.requesterEmployee?.fullName ?? r.requestedBy.name ?? 'Unknown'}
          <span className="block text-xs text-muted-foreground font-normal">{r.requesterDepartment ?? 'No department'}</span>
        </Field>
        <Field label="Priority"><PriorityBadge priority={r.priority} /></Field>
        <Field label="New / Replacement">
          {r.reason}
          {(r.replacementEmployee || r.replacementFor) && (
            <span className="block text-xs text-muted-foreground font-normal">
              Replacing {r.replacementEmployee?.fullName ?? r.replacementFor}
              {r.replacementEmployee && ` (${r.replacementEmployee.employeeNumber}${r.replacementEmployee.role ? ` · ${r.replacementEmployee.role.title}` : ''})`}
            </span>
          )}
        </Field>
        <Field label="Headcount Requested">{r.headcount}</Field>
        <Field label="Salary">{r.salary != null ? formatMoney(r.salary) : '—'}</Field>
        <Field label="Expected Join Date">{r.targetJoinDate ? formatDate(r.targetJoinDate) : '—'}</Field>
        <Field label="Work Location">{r.location?.name ?? '—'}</Field>
      </div>

      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Job Description</p>
        {r.jobDescription
          ? <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm whitespace-pre-wrap">{r.jobDescription}</div>
          : <p className="text-sm text-muted-foreground">No job description.</p>}
      </div>

      {r.notes && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Special Request</p>
          <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t pt-3">
        Requested {formatDate(r.createdAt)} by {requesterLabel(r)}
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
