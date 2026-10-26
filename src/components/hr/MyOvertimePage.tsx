'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Clock, ClipboardList, ShieldAlert, ArrowLeft } from 'lucide-react'
import { MultiFilePicker, FilePreview } from '@/components/ui/file-preview'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/format'

interface Overtime {
  id: string
  date: string
  hours: number
  description: string
  proofFileKeys: string[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
}

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
}

// Only a Saturday/Sunday or a national holiday is eligible — mirrors the server-side
// check in src/app/api/hr/overtime/mine/route.ts, done here too just so the picker can
// warn before a round trip. The server is still the source of truth.
function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false
  const dow = new Date(dateStr).getUTCDay()
  return dow === 0 || dow === 6
}

export default function MyOvertimePage() {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [requests, setRequests] = useState<Overtime[]>([])
  const [selected, setSelected] = useState<Overtime | null>(null)
  const [holidays, setHolidays] = useState<Record<string, string>>({})

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ date: '', hours: '', description: '', proofFileKeys: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/overtime/mine')
    let list: Overtime[] = []
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      list = data.requests ?? []
      setRequests(list)
    }
    setLoading(false)
    return list
  }, [])

  useEffect(() => { reload() }, [reload])

  // A light client-side hint for which dates qualify. /api/hr/national-holidays is
  // currently HR/ADMIN/SUPER_ADMIN-only, same as this page's nav entry for now — when
  // this page is opened up to every user, that endpoint needs a wider GET too, or the
  // holiday highlight below silently stops working (the actual eligibility check still
  // happens server-side in /api/hr/overtime/mine regardless).
  useEffect(() => {
    fetch('/api/hr/national-holidays').then(r => r.ok ? r.json() : []).then((rows: { date: string; name: string }[]) => {
      const map: Record<string, string> = {}
      for (const h of rows) map[h.date.slice(0, 10)] = h.name
      setHolidays(map)
    }).catch(() => {})
  }, [])

  function openAdd() { setForm({ date: '', hours: '', description: '', proofFileKeys: [] }); setFormError(''); setModal(true) }

  const dateQualifies = form.date ? (isWeekend(form.date) || !!holidays[form.date]) : true

  async function save() {
    if (!form.date) { setFormError('Please select a date'); return }
    if (!isWeekend(form.date) && !holidays[form.date]) { setFormError('Overtime can only be claimed for a weekend or a national holiday'); return }
    if (!form.hours || Number(form.hours) <= 0) { setFormError('Please enter the hours worked'); return }
    if (!form.description.trim()) { setFormError('Please describe the work done'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/overtime/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, hours: Number(form.hours) }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); reload()
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
          <h2 className="text-2xl font-bold tracking-tight">Overtime</h2>
          <p className="text-muted-foreground text-sm mt-1">Claim overtime worked on a weekend or national holiday</p>
        </div>
        <div className="rounded-xl border bg-warning/10 border-warning/30 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-warning" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to claim overtime here.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-ml-2.5 text-muted-foreground">
          <ArrowLeft /> Back to Overtime
        </Button>

        <div className="rounded-2xl border bg-card max-w-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{formatDate(selected.date, 'long')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{selected.hours}h overtime</p>
            </div>
            <StatusBadge tone={STATUS_TONE[selected.status]} className="px-2.5 py-1">{selected.status.charAt(0) + selected.status.slice(1).toLowerCase()}</StatusBadge>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Work Done</p>
              <p className="text-sm mt-0.5 whitespace-pre-wrap">{selected.description}</p>
            </div>

            {selected.proofFileKeys.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Proof</p>
                <div className="grid grid-cols-3 gap-2">
                  {selected.proofFileKeys.map((k, i) => (
                    <FilePreview key={i} src={k} alt={`Proof ${i + 1}`} className="w-full h-24 rounded-lg object-cover border" />
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-3">
              Requested {formatDate(selected.requestedAt, 'long')}
            </div>

            {selected.status !== 'PENDING' && (
              <div className="text-xs text-muted-foreground">
                {selected.status === 'REJECTED' ? 'Rejected' : 'Approved'}{selected.decidedAt && ` ${formatDate(selected.decidedAt, 'long')}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Overtime</h2>
          <p className="text-muted-foreground text-sm mt-1">Claim overtime worked on a weekend or national holiday</p>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Claim Overtime
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Hours</th>
              <th className="text-left px-4 py-3 font-medium">Work Done</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t claimed any overtime yet.
              </td></tr>
            ) : requests.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelected(r)}>
                <td className="px-4 py-3 font-medium flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{formatDate(r.date, 'long')}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.hours}h</td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-64 truncate" title={r.description}>{r.description}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge tone={STATUS_TONE[r.status]}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 gap-0 max-h-[92vh] overflow-y-auto" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="flex-row items-center gap-2 text-left px-6 py-4 border-b">
            <Clock className="h-4 w-4 text-primary-strong" />
            <DialogTitle className="font-bold text-sm">Claim Overtime</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">Overtime can only be claimed for a Saturday, Sunday, or a national holiday.</p>
            <div className="space-y-1.5">
              <Label htmlFor="my-overtime-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</Label>
              <Input id="my-overtime-date" type="date" className="h-10"
                value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              {form.date && !dateQualifies && (
                <p className="text-xs text-destructive">This date is a weekday and not a national holiday — it doesn&apos;t qualify.</p>
              )}
              {form.date && holidays[form.date] && (
                <p className="text-xs text-success">National holiday: {holidays[form.date]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-overtime-hours" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours Worked</Label>
              <Input id="my-overtime-hours" type="number" min="0" step="0.5" className="h-10"
                placeholder="e.g. 4" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-overtime-work-done" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Done</Label>
              <Textarea id="my-overtime-work-done" rows={2} className="resize-none"
                placeholder="What did you work on?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div role="group" aria-labelledby="my-overtime-proof-label" className="space-y-1.5">
              <p id="my-overtime-proof-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">Proof <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
              <MultiFilePicker files={form.proofFileKeys} onChange={v => setForm(f => ({ ...f, proofFileKeys: v }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} className="font-semibold">
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
