'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, CalendarDays, ClipboardList, ShieldAlert, Ship } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDateRange } from '@/lib/format'
import { FreelanceRecommendationsField, type FreelanceRecommendation } from './FreelanceRecommendationsField'

interface Trip { bookingCode: string; destination: string | null; startDate: string; endDate: string }
interface LeaveRequest {
  id: string
  startDate: string; endDate: string; days: number
  reason: string | null
  type: 'LEAVE' | 'WFH'
  status: 'PENDING' | 'PENDING_HR_APPROVAL' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  // Trips of your yacht (if you're crew — Work Location matches a Yacht name) that fall
  // inside this leave range, same as what HR sees when deciding on a freelance replacement.
  trips: Trip[]
  needsFreelance: boolean
  freelanceRecommendations: FreelanceRecommendation[]
  // Crew-only first stage — true when a Cruise Director/Captain was resolved for your
  // yacht at request time. Once they approve, status moves PENDING → PENDING_HR_APPROVAL.
  requiresCrewApproval: boolean
  crewApprovedBy: { id: string; name: string | null } | null
  crewApprovedAt: string | null
  crewDecisionNote: string | null
}

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: 'warning',
  PENDING_HR_APPROVAL: 'info',
  APPROVED: 'success',
  REJECTED: 'destructive',
}

function statusLabel(r: LeaveRequest): string {
  if (r.status === 'PENDING') return r.requiresCrewApproval ? 'Awaiting Cruise Director/Captain' : 'Pending'
  if (r.status === 'PENDING_HR_APPROVAL') return 'Awaiting HR'
  return r.status.charAt(0) + r.status.slice(1).toLowerCase()
}


export default function MyLeaveRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [isFreelance, setIsFreelance] = useState(false)
  const [isCrew, setIsCrew] = useState(false)
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<{ type: 'LEAVE' | 'WFH'; startDate: string; endDate: string; reason: string; needsFreelance: boolean; freelanceRecommendations: FreelanceRecommendation[] }>({
    type: 'LEAVE', startDate: '', endDate: '', reason: '', needsFreelance: false, freelanceRecommendations: [],
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/leave-requests/mine')
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      setIsFreelance(data.employee?.employmentStatus === 'Freelance')
      setIsCrew(!!data.employee?.isCrew)
      setLeaveBalance(data.employee?.leaveBalance ?? null)
      setRequests(data.requests ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Mirrors countLeaveDays on the server: crew count every calendar day (they work
  // weekends too), everyone else skips Sat/Sun since those were never working days.
  const days = form.startDate && form.endDate ? (() => {
    const start = new Date(form.startDate)
    const end = new Date(form.endDate)
    if (end < start) return 0
    if (isCrew) return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    let count = 0
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) count++
    }
    return count
  })() : 0
  const overBalance = form.type === 'LEAVE' && leaveBalance != null && days > leaveBalance

  function openAdd() { setForm({ type: 'LEAVE', startDate: '', endDate: '', reason: '', needsFreelance: false, freelanceRecommendations: [] }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.startDate || !form.endDate) { setFormError('Please select a date range'); return }
    if (overBalance) { setFormError(`You only have ${leaveBalance} day${leaveBalance !== 1 ? 's' : ''} of leave remaining`); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/leave-requests/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
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

  if (!linked) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Request</h2>
          <p className="text-muted-foreground text-sm mt-1">Request time off and track your approval status</p>
        </div>
        <div className="rounded-xl border bg-warning/10 border-warning/30 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-warning" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to request leave here.</p>
        </div>
      </div>
    )
  }

  if (isFreelance) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Request</h2>
          <p className="text-muted-foreground text-sm mt-1">Request time off and track your approval status</p>
        </div>
        <div className="rounded-xl border bg-muted/40 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium text-sm">Leave requests aren&apos;t available for Freelance staff</p>
          <p className="text-muted-foreground text-sm mt-1">Freelance employees aren&apos;t on the leave-accrual system.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Request</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Request leave or WFH and track your approval status
            {leaveBalance != null && <> · <span className="font-medium text-foreground">{leaveBalance} day{leaveBalance !== 1 ? 's' : ''}</span> remaining</>}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Request Leave
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Dates</th>
              <th className="text-center px-4 py-3 font-medium">Days</th>
              <th className="text-left px-4 py-3 font-medium">Trips Affected</th>
              <th className="text-left px-4 py-3 font-medium">Reason</th>
              <th className="text-left px-4 py-3 font-medium">Recommendation</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Decision Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t requested any leave or WFH yet.
              </td></tr>
            ) : requests.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3"><span className={`inline-block mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.type === 'WFH' ? 'bg-info/15 text-info' : 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'}`}>{r.type === 'WFH' ? 'WFH' : 'Leave'}</span></td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateRange(r.startDate, r.endDate)}</td>
                <td className="px-4 py-3 text-center font-semibold">{r.days}</td>
                <td className="px-4 py-3 text-xs">
                  {r.trips.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info/15 text-info font-medium">
                        <Ship className="h-3 w-3" /> {r.trips.length} trip{r.trips.length !== 1 ? 's' : ''}
                      </span>
                      <div className="text-muted-foreground space-y-0.5">
                        {r.trips.map(t => (
                          <p key={t.bookingCode} className="whitespace-nowrap">
                            <span className="font-mono">{t.bookingCode}</span> ({formatDateRange(t.startDate, t.endDate)})
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
                <td className="px-4 py-3 text-xs">
                  {!r.needsFreelance ? (
                    <span className="text-muted-foreground">—</span>
                  ) : r.freelanceRecommendations.length === 0 ? (
                    <span className="text-warning">Needed — no contact yet</span>
                  ) : (
                    <div className="space-y-0.5">
                      {r.freelanceRecommendations.map(fr => (
                        <p key={fr.id} className="whitespace-nowrap"><span className="font-medium">{fr.name || '—'}</span>{fr.phone && <span className="text-muted-foreground"> · {fr.phone}</span>}</p>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge tone={STATUS_TONE[r.status]}>{statusLabel(r)}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={r.decisionNote ?? r.crewDecisionNote ?? undefined}>
                  {r.decisionNote ?? r.crewDecisionNote ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="flex-row items-center gap-2 text-left px-6 py-4 border-b shrink-0">
            <CalendarDays className="h-4 w-4 text-primary-strong" />
            <DialogTitle className="font-bold text-sm">{form.type === 'WFH' ? 'Request WFH' : 'Request Leave'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
              {(['LEAVE', 'WFH'] as const).map(t => (
                <button key={t} type="button" aria-pressed={form.type === t} onClick={() => setForm(f => ({ ...f, type: t, needsFreelance: t === 'WFH' ? false : f.needsFreelance, freelanceRecommendations: t === 'WFH' ? [] : f.freelanceRecommendations }))}
                  className={`h-8 rounded-md text-sm font-medium transition-colors ${form.type === t ? 'bg-card shadow-sm text-primary-strong' : 'text-muted-foreground hover:text-foreground'}`}>
                  {t === 'LEAVE' ? 'Leave' : 'Work From Home'}
                </button>
              ))}
            </div>
            {form.type === 'LEAVE' && leaveBalance != null && (
              <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Leave Balance</span>
                <span className="font-semibold text-primary-strong">{leaveBalance} day{leaveBalance !== 1 ? 's' : ''} remaining</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="my-leave-start" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</Label>
                <Input id="my-leave-start" type="date" className="h-10"
                  value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="my-leave-end" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</Label>
                <Input id="my-leave-end" type="date" className="h-10"
                  value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            {days > 0 && (
              <p className={`text-xs ${overBalance ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {days} day{days !== 1 ? 's' : ''} {form.type === 'WFH' ? 'of WFH — does not use your leave balance' : 'of leave'}
                {overBalance && ' — exceeds your remaining balance'}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="my-leave-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</Label>
              <Textarea id="my-leave-reason" rows={2} className="resize-none"
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            {form.type === 'LEAVE' && <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.needsFreelance}
                onChange={e => setForm(f => ({ ...f, needsFreelance: e.target.checked, freelanceRecommendations: e.target.checked ? f.freelanceRecommendations : [] }))} />
              Need a freelance replacement for the trips I&apos;ll miss?
            </label>}
            {form.needsFreelance && (
              <FreelanceRecommendationsField value={form.freelanceRecommendations} onChange={v => setForm(f => ({ ...f, freelanceRecommendations: v }))} />
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50 shrink-0">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={overBalance} className="font-semibold">
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
