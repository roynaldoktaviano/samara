'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Check, ThumbsUp, ThumbsDown, ClipboardList, ArrowLeft, CheckCircle2, RotateCcw, Users } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import {
  type RecruitmentRequestBase, type RecruitmentStatus, type InterviewResult,
  REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, CANDIDATE_STAGE_LABEL, RESULT_LABEL, RESULT_TONE,
  RecruitmentRequestDetails,
} from '@/components/hr/recruitment-shared'

interface LinkedCandidate {
  id: string; fullName: string; status: string; convertedEmployeeId: string | null
  hrInterviewResult: InterviewResult | null
  userInterviewScheduledAt: string | null
  userInterviewResult: InterviewResult | null
}
interface RecruitmentRequest extends RecruitmentRequestBase { candidates: LinkedCandidate[] }

const FILTERS = ['All', 'PENDING', 'APPROVED', 'CLOSED', 'REJECTED', 'CANCELLED'] as const

export default function RecruitmentRequestsPage() {
  const [requests, setRequests] = useState<RecruitmentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<typeof FILTERS[number]>('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/hr/recruitment-requests')
    if (res.ok) setRequests(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('hr-recruitment-changed', load)
    return () => window.removeEventListener('hr-recruitment-changed', load)
  }, [load])

  const selected = requests.find(r => r.id === selectedId) ?? null

  async function act(action: 'approve' | 'reject' | 'close' | 'reopen', note?: string) {
    if (!selected) return
    setSaving(true)
    const res = await fetch(`/api/hr/recruitment-requests/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, decisionNote: note }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to update'); return }
    setDecision(null); setDecisionNote('')
    load()
  }

  const filtered = statusFilter === 'All' ? requests : requests.filter(r => r.status === statusFilter)
  const count = (s: typeof FILTERS[number]) => s === 'All' ? requests.length : requests.filter(r => r.status === s).length
  const hiredCount = (r: RecruitmentRequest) => r.candidates.filter(c => c.status === 'HIRED').length

  return (
    <div className="space-y-6">
      {selected ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="-ml-2.5 text-muted-foreground">
            <ArrowLeft /> Back to Recruitment
          </Button>

          <div className="rounded-2xl border bg-card max-w-3xl">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b">
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight truncate">{selected.role.title}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {hiredCount(selected)} of {selected.headcount} hired
                </p>
              </div>
              <StatusBadge tone={REQUEST_STATUS_TONE[selected.status]} className="px-2.5 py-1">{REQUEST_STATUS_LABEL[selected.status]}</StatusBadge>
            </div>

            <div className="p-5">
              <RecruitmentRequestDetails request={selected} />
            </div>

            <div className="border-t p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Candidates ({selected.candidates.length})
              </p>
              {selected.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selected.status === 'APPROVED'
                    ? 'No candidates linked yet — link them from Candidates (Recruitment Request field).'
                    : 'No candidates linked.'}
                </p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {selected.candidates.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground">{CANDIDATE_STAGE_LABEL[c.status] ?? c.status}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end text-xs">
                        {c.hrInterviewResult && <StatusBadge tone={RESULT_TONE[c.hrInterviewResult]}>HR: {RESULT_LABEL[c.hrInterviewResult]}</StatusBadge>}
                        {c.userInterviewResult
                          ? <StatusBadge tone={RESULT_TONE[c.userInterviewResult]}>User: {RESULT_LABEL[c.userInterviewResult]}</StatusBadge>
                          : c.userInterviewScheduledAt && <StatusBadge tone="info">User interview {formatDate(c.userInterviewScheduledAt)}</StatusBadge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected.status === 'PENDING' && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <Button variant="outline" onClick={() => setDecision('reject')}
                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                  <ThumbsDown className="size-3.5" /> Reject
                </Button>
                <Button variant="success" onClick={() => setDecision('approve')} className="font-semibold">
                  <ThumbsUp className="size-3.5" /> Approve
                </Button>
              </div>
            )}
            {selected.status === 'APPROVED' && (
              <div className="flex items-center justify-between gap-2 px-5 py-4 border-t">
                <p className="text-xs text-muted-foreground">Close this request once the position is filled or no longer needed.</p>
                <Button variant="outline" onClick={() => act('close')} loading={saving}
                  className="shrink-0 hover:bg-success/10 hover:text-success hover:border-success/30">
                  <CheckCircle2 className="size-3.5" /> Close Request
                </Button>
              </div>
            )}
            {selected.status === 'CLOSED' && (
              <div className="flex justify-end px-5 py-4 border-t">
                <Button variant="outline" onClick={() => act('reopen')} loading={saving}>
                  <RotateCcw className="size-3.5" /> Reopen
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Recruitment</h2>
            <p className="text-muted-foreground text-sm mt-1">Hiring requests from supervisors and heads</p>
          </div>

          <div className="flex gap-1 border-b overflow-x-auto">
            {FILTERS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                  statusFilter === s ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {s === 'All' ? 'All' : REQUEST_STATUS_LABEL[s]}
                {count(s) > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusFilter === s ? 'bg-primary/15 text-primary-strong' : 'bg-muted text-muted-foreground'}`}>
                    {count(s)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-lg border overflow-hidden animate-pulse">
              <div className="h-10 bg-muted/50 border-b" />
              {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Position</th>
                    <th className="text-center px-4 py-3 font-medium">Hired</th>
                    <th className="text-left px-4 py-3 font-medium">Requested By</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                    <th className="text-left px-4 py-3 font-medium">Target Join</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No recruitment requests {statusFilter !== 'All' ? `with status "${REQUEST_STATUS_LABEL[statusFilter as RecruitmentStatus]}"` : 'yet'}.
                    </td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedId(r.id)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.role.title}</p>
                        <p className="text-xs text-muted-foreground">{r.location?.name ?? 'Any location'}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs tabular-nums">{hiredCount(r)} / {r.headcount}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm">{r.requesterEmployee?.fullName ?? r.requestedBy.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.reason}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.targetJoinDate ? formatDate(r.targetJoinDate) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {/* ── Approve/Reject Modal ── */}
      <Dialog open={!!decision} onOpenChange={o => { if (!o) { setDecision(null); setDecisionNote('') } }}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          {decision && selected && (
            <>
              <div className="px-6 py-5 space-y-3">
                <DialogTitle className="font-bold text-sm flex items-center gap-2 pr-6">
                  {decision === 'approve' ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                  {decision === 'approve' ? 'Approve' : 'Reject'} recruitment request
                </DialogTitle>
                <DialogDescription>
                  {selected.headcount}× {selected.role.title} — requested by {selected.requesterEmployee?.fullName ?? selected.requestedBy.name ?? 'Unknown'}
                </DialogDescription>
                <Textarea rows={2} placeholder={decision === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                  aria-label={decision === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                  className="resize-none"
                  value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
              </div>
              <DialogFooter className="px-6 py-4 border-t bg-muted/50">
                <Button variant="outline" onClick={() => { setDecision(null); setDecisionNote('') }}>Cancel</Button>
                <Button onClick={() => act(decision, decisionNote)} loading={saving}
                  variant={decision === 'approve' ? 'success' : 'destructive'} className="font-semibold">
                  {saving ? 'Saving…' : decision === 'approve' ? 'Approve' : 'Reject'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
