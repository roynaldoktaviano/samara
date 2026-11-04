'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ClipboardList, ShieldAlert, ArrowLeft, UserSearch, Users, Paperclip, Phone, Mail, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { StatusBadge } from '@/components/ui/status-badge'
import { PhotoLightbox } from '@/components/purchasing/PhotoLightbox'
import { formatDate, formatMoney } from '@/lib/format'
import {
  type RecruitmentRequestBase, type InterviewResult, type RecruitmentPriority,
  REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, CANDIDATE_STAGE_LABEL, RESULT_LABEL, RESULT_TONE,
  RECRUITMENT_REASONS, RECRUITMENT_PRIORITIES, PRIORITY_LABEL, PriorityBadge, RecruitmentRequestDetails,
} from '@/components/hr/recruitment-shared'

interface RoleOption { id: string; title: string; jobDescription: string | null; location: { id: string; name: string } | null }
interface LocationOption { id: string; name: string }
interface EmployeeOption {
  id: string; fullName: string; isActive: boolean; department: string | null
  role: { id: string; title: string } | null; inMyTeam: boolean
}
interface VisibleCandidate {
  id: string; fullName: string; status: string
  phone: string | null; email: string | null; location: string | null
  expectedSalary: number | null; readyJoinDate: string | null
  skills: string[]; languages: string[]; resumeFiles: string[]
  hrInterviewResult: InterviewResult | null; hrInterviewNotes: string | null
  userInterviewScheduledAt: string | null; userInterviewMeetingLink: string | null
  userInterviewResult: InterviewResult | null; userInterviewNotes: string | null; userInterviewRecordedAt: string | null
}
interface MyRequest extends RecruitmentRequestBase { candidates: VisibleCandidate[] }

const BLANK = {
  roleId: '', headcount: '1', locationId: '', reason: '' as string,
  replacementEmployeeId: '', targetJoinDate: '', notes: '',
  salary: '', priority: 'MEDIUM' as RecruitmentPriority,
}

export default function MyRecruitmentRequestsPage() {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [canRequest, setCanRequest] = useState(false)
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [requester, setRequester] = useState<{ fullName: string; department: string | null } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [resultTarget, setResultTarget] = useState<VisibleCandidate | null>(null)
  const [resultForm, setResultForm] = useState({ result: '' as InterviewResult | '', notes: '' })
  const [resultSaving, setResultSaving] = useState(false)
  const [resultError, setResultError] = useState('')

  const [preview, setPreview] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/hr/recruitment-requests/mine')
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      setCanRequest(data.canRequest)
      setRequests(data.requests ?? [])
      setRoles(data.roles ?? [])
      setLocations(data.locations ?? [])
      setRequester(data.requester ?? null)
      setEmployees(data.employees ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('hr-recruitment-changed', load)
    return () => window.removeEventListener('hr-recruitment-changed', load)
  }, [load])

  const selected = requests.find(r => r.id === selectedId) ?? null

  function openAdd() { setForm({ ...BLANK }); setFormError(''); setModal(true) }

  // Picking a role pre-fills its location if the role is location-specific (still editable).
  // The job description isn't part of the form — it always comes from the role itself.
  function pickRole(roleId: string) {
    const role = roles.find(r => r.id === roleId)
    setForm(f => ({ ...f, roleId, locationId: role?.location?.id ?? f.locationId }))
  }
  const selectedRole = roles.find(r => r.id === form.roleId) ?? null

  // Replacing an employee usually means hiring for their role — pre-pick it if none chosen yet.
  function pickReplacement(employeeId: string) {
    const emp = employees.find(e => e.id === employeeId)
    setForm(f => ({
      ...f,
      replacementEmployeeId: employeeId,
      ...(!f.roleId && emp?.role && roles.some(r => r.id === emp.role!.id) && { roleId: emp.role.id }),
    }))
  }
  const myTeam = employees.filter(e => e.inMyTeam)
  const otherEmployees = employees.filter(e => !e.inMyTeam)

  async function submit() {
    if (!form.roleId) { setFormError('Please select a job role'); return }
    if (!form.reason) { setFormError('Please choose New Position or Replacement'); return }
    if (form.reason === 'Replacement' && !form.replacementEmployeeId) { setFormError('Please select the employee being replaced'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/recruitment-requests/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, headcount: Number(form.headcount), salary: form.salary === '' ? null : Number(form.salary) }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); return }
    setModal(false); load()
  }

  async function cancelRequest() {
    if (!selected) return
    const ok = await confirm({
      title: 'Cancel this request?',
      description: `Your request for ${selected.headcount}× ${selected.role.title} will be withdrawn from HR.`,
      confirmLabel: 'Cancel Request',
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`/api/hr/recruitment-requests/mine/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to cancel'); return }
    load()
  }

  function openResult(c: VisibleCandidate) {
    setResultForm({ result: c.userInterviewResult ?? '', notes: c.userInterviewNotes ?? '' })
    setResultError('')
    setResultTarget(c)
  }

  async function saveResult() {
    if (!resultTarget) return
    if (!resultForm.result) { setResultError('Please pick a result'); return }
    setResultSaving(true); setResultError('')
    const res = await fetch(`/api/hr/recruitment-requests/mine/candidates/${resultTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInterviewResult: resultForm.result, userInterviewNotes: resultForm.notes }),
    })
    const data = await res.json()
    setResultSaving(false)
    if (!res.ok) { setResultError(data.error ?? 'Failed to save'); return }
    setResultTarget(null); load()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      </div>
    )
  }

  const header = (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Recruitment Request</h2>
      <p className="text-muted-foreground text-sm mt-1">Ask HR to hire for your team and interview the shortlisted candidates</p>
    </div>
  )

  if (!linked) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border bg-warning/10 border-warning/30 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-warning" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to request recruitment here.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedId(null)} className="-ml-3 gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft /> Back to Recruitment Requests
        </Button>

        <div className="rounded-2xl border bg-card max-w-3xl">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight truncate">{selected.role.title}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{selected.headcount} {selected.headcount === 1 ? 'person' : 'people'}</p>
            </div>
            <StatusBadge tone={REQUEST_STATUS_TONE[selected.status]} className="px-2.5 py-1">{REQUEST_STATUS_LABEL[selected.status]}</StatusBadge>
          </div>

          <div className="p-5">
            <RecruitmentRequestDetails request={selected} />
          </div>

          {selected.status === 'PENDING' && (
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t">
              <p className="text-xs text-muted-foreground">Waiting on HR to approve.</p>
              <Button variant="outline" onClick={cancelRequest}
                className="shrink-0 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                <XCircle className="size-3.5" /> Cancel Request
              </Button>
            </div>
          )}

          {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
            <div className="border-t p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Candidates for User Interview
              </p>
              {selected.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">HR hasn&apos;t sent any candidates to you yet. You&apos;ll get a notification when a User Interview is scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {selected.candidates.map(c => (
                    <div key={c.id} className="rounded-xl border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{c.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {CANDIDATE_STAGE_LABEL[c.status] ?? c.status}{c.location && ` · ${c.location}`}
                          </p>
                        </div>
                        {c.userInterviewResult
                          ? <StatusBadge tone={RESULT_TONE[c.userInterviewResult]}>{RESULT_LABEL[c.userInterviewResult]}</StatusBadge>
                          : c.status === 'USER_INTERVIEW' && <StatusBadge tone="warning">Awaiting your result</StatusBadge>}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Contact</p>
                          {c.phone && <p className="flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{c.phone}</p>}
                          {c.email && <p className="flex items-center gap-1 mt-0.5 break-all"><Mail className="h-3 w-3 shrink-0" />{c.email}</p>}
                          {!c.phone && !c.email && <p className="mt-0.5">—</p>}
                        </div>
                        <div>
                          <p className="text-muted-foreground">Expected Salary</p>
                          <p className="mt-0.5 font-medium">{formatMoney(c.expectedSalary)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Ready to Join</p>
                          <p className="mt-0.5 font-medium">{c.readyJoinDate ? formatDate(c.readyJoinDate) : '—'}</p>
                        </div>
                      </div>

                      {(c.skills.length > 0 || c.languages.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {[...c.skills, ...c.languages].map((item, i) => (
                            <span key={i} className="text-xs font-medium bg-info/10 text-info rounded-full px-2.5 py-1">{item}</span>
                          ))}
                        </div>
                      )}

                      {c.resumeFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {c.resumeFiles.map((f, i) => (
                            <Button key={i} variant="outline" size="sm" onClick={() => setPreview(f)}>
                              <Paperclip className="size-3.5" /> CV{c.resumeFiles.length > 1 ? ` ${i + 1}` : ''}
                            </Button>
                          ))}
                        </div>
                      )}

                      {c.hrInterviewResult && (
                        <div className="text-xs">
                          <p className="text-muted-foreground">HR Interview — <span className="font-medium text-foreground">{RESULT_LABEL[c.hrInterviewResult]}</span></p>
                          {c.hrInterviewNotes && <p className="mt-1 rounded-lg bg-muted/40 px-3 py-2 whitespace-pre-wrap">{c.hrInterviewNotes}</p>}
                        </div>
                      )}

                      <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-primary-strong uppercase tracking-wide">User Interview</p>
                          <Button variant="link" size="sm" onClick={() => openResult(c)}
                            className="h-auto p-0 has-[>svg]:px-0 text-xs text-primary-strong shrink-0">
                            {c.userInterviewResult ? 'Edit Result' : 'Record Result'}
                          </Button>
                        </div>
                        <p className="text-sm font-medium">{c.userInterviewScheduledAt ? formatDate(c.userInterviewScheduledAt, 'datetime') : 'Not scheduled yet'}</p>
                        {c.userInterviewMeetingLink && (
                          <a href={c.userInterviewMeetingLink} target="_blank" rel="noreferrer" className="inline-flex font-medium text-primary-strong hover:underline">
                            Join Meeting Link →
                          </a>
                        )}
                        {c.userInterviewNotes && <p className="text-muted-foreground whitespace-pre-wrap">{c.userInterviewNotes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Dialog open={!!resultTarget} onOpenChange={o => { if (!o) setResultTarget(null) }}>
          <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
            <DialogHeader className="gap-0.5 px-6 py-4 pr-12 border-b text-left">
              <DialogTitle className="text-sm font-bold">User Interview Result</DialogTitle>
              <DialogDescription className="text-xs">{resultTarget?.fullName}</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5 space-y-4">
              {resultError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{resultError}</p>}
              <div className="space-y-1.5">
                <Label htmlFor="ui-result" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Result</Label>
                <NativeSelect id="ui-result" value={resultForm.result}
                  onChange={e => setResultForm(f => ({ ...f, result: e.target.value as InterviewResult | '' }))}>
                  <option value="">— Select —</option>
                  {(Object.keys(RESULT_LABEL) as InterviewResult[]).map(r => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ui-notes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
                <Textarea id="ui-notes" rows={4} className="resize-none" placeholder="Strengths, concerns, recommendation…"
                  value={resultForm.notes} onChange={e => setResultForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <p className="text-[11px] text-muted-foreground">HR is notified and decides the next step (offer or reject).</p>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/50">
              <Button variant="outline" onClick={() => setResultTarget(null)}>Cancel</Button>
              <Button onClick={saveResult} loading={resultSaving}>{resultSaving ? 'Saving…' : 'Save Result'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {preview && <PhotoLightbox photoKey={preview} onClose={() => setPreview(null)} zIndexClass="z-60" />}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {header}
        {canRequest && (
          <Button onClick={openAdd} className="shrink-0">
            <Plus /> Request Recruitment
          </Button>
        )}
      </div>

      {!canRequest && (
        <p className="text-xs text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2">
          New requests can only be raised by supervisors and heads who have team members reporting to them.
        </p>
      )}

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Requested</th>
              <th className="text-left px-4 py-3 font-medium">Position</th>
              <th className="text-center px-4 py-3 font-medium">Headcount</th>
              <th className="text-left px-4 py-3 font-medium">Reason</th>
              <th className="text-center px-4 py-3 font-medium">Priority</th>
              <th className="text-center px-4 py-3 font-medium">To Interview</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t requested any recruitment yet.
              </td></tr>
            ) : requests.map(r => {
              const toInterview = r.candidates.filter(c => c.status === 'USER_INTERVIEW' && !c.userInterviewResult).length
              return (
                <tr key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedId(r.id)}>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium flex items-center gap-1.5"><UserSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{r.role.title}</p>
                    {r.location && <p className="text-xs text-muted-foreground">{r.location.name}</p>}
                  </td>
                  <td className="px-4 py-3 text-center text-xs tabular-nums">{r.headcount}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.reason}</td>
                  <td className="px-4 py-3 text-center"><PriorityBadge priority={r.priority} /></td>
                  <td className="px-4 py-3 text-center">
                    {toInterview > 0 ? <StatusBadge tone="warning">{toInterview}</StatusBadge> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</StatusBadge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="flex-row items-center gap-2 px-6 py-4 pr-12 border-b text-left">
            <UserSearch className="h-4 w-4 text-primary-strong" />
            <DialogTitle className="text-sm font-bold">Request Recruitment</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            {/* 1. Requestor — from the employee record, not editable */}
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requestor</p>
              <p className="text-sm font-medium mt-0.5">{requester?.fullName ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{requester?.department ?? 'No department set on your employee profile'}</p>
            </div>
            {/* 2. Job Role — linked to Roles & their job description */}
            <div className="space-y-1.5">
              <Label htmlFor="rr-role" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Role</Label>
              <SearchableSelect id="rr-role" value={form.roleId} onChange={pickRole}
                placeholder="Select a job role…" searchPlaceholder="Search job role…" emptyText="No job role found."
                options={roles.map(r => ({ value: r.id, label: r.title, description: r.location?.name }))} />
            </div>
            {/* Read-only: always the role's own job description (set by HR under Roles). */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Description &amp; Responsibilities</p>
              {!form.roleId ? (
                <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Select a job role to see its job description.</p>
              ) : selectedRole?.jobDescription ? (
                <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/40 px-3 py-2.5 text-sm whitespace-pre-wrap">{selectedRole.jobDescription}</div>
              ) : (
                <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                  This role has no job description yet — HR sets it under Roles.
                </p>
              )}
            </div>
            {/* 3. New / Replacement + 8. Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rr-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New / Replacement</Label>
                <NativeSelect id="rr-reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                  <option value="">— Select —</option>
                  {RECRUITMENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-priority" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</Label>
                <NativeSelect id="rr-priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as RecruitmentPriority }))}>
                  {RECRUITMENT_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </NativeSelect>
              </div>
            </div>
            {form.reason === 'Replacement' && (
              <div className="space-y-1.5">
                <Label htmlFor="rr-replacement-for" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Replacing</Label>
                <SearchableSelect id="rr-replacement-for" value={form.replacementEmployeeId} onChange={pickReplacement}
                  placeholder="Select the employee being replaced…" searchPlaceholder="Search name, role or department…" emptyText="No employee found."
                  options={[...myTeam, ...otherEmployees].map(e => ({
                    value: e.id,
                    label: `${e.fullName}${e.isActive ? '' : ' (inactive)'}`,
                    description: [e.role?.title, e.department].filter(Boolean).join(' · ') || undefined,
                    group: myTeam.length === 0 ? undefined : e.inMyTeam ? 'Your team' : 'Other employees',
                  }))} />
              </div>
            )}
            {/* 4. Salary + 5. Headcount */}
            <div className="grid grid-cols-[1fr_9rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rr-salary" className="gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salary <span className="normal-case font-normal text-muted-foreground/70">(per month, optional)</span></Label>
                <RupiahInput id="rr-salary" value={form.salary} onChange={salary => setForm(f => ({ ...f, salary }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-headcount" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Headcount</Label>
                <Input id="rr-headcount" type="number" min={1} step={1}
                  value={form.headcount} onChange={e => setForm(f => ({ ...f, headcount: e.target.value }))} />
              </div>
            </div>
            {/* 6. Expected join date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rr-target-join" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected Join Date</Label>
                <Input id="rr-target-join" type="date"
                  value={form.targetJoinDate} onChange={e => setForm(f => ({ ...f, targetJoinDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-location" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Location</Label>
                <NativeSelect id="rr-location" value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                  <option value="">—</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </NativeSelect>
              </div>
            </div>
            {/* 7. Special request */}
            <div className="space-y-1.5">
              <Label htmlFor="rr-notes" className="gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Special Request <span className="normal-case font-normal text-muted-foreground/70">(optional)</span></Label>
              <Textarea id="rr-notes" rows={2} className="resize-none" placeholder="e.g. must speak Mandarin, needs a diving licence"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{saving ? 'Submitting…' : 'Submit to HR'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
