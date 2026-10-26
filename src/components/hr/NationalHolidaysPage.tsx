'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, CalendarOff } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Holiday {
  id: string
  date: string
  name: string
  excludedLocationIds: string[]
  createdBy: { id: string; name: string | null } | null
}
interface LocationLite { id: string; name: string }

export default function NationalHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [locations, setLocations] = useState<LocationLite[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [isRange, setIsRange] = useState(false)
  const [form, setForm] = useState({ startDate: '', endDate: '', name: '', excludedLocationIds: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNote, setFormNote] = useState('')

  const confirm = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/national-holidays')
    if (res.ok) setHolidays(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/hr/work-locations').then(r => r.ok ? r.json() : []).then((locs: LocationLite[]) => setLocations(locs)).catch(() => {})
  }, [])

  function locationName(id: string) { return locations.find(l => l.id === id)?.name.trim() ?? id }

  function toggleExcludedLocation(id: string) {
    setForm(f => ({
      ...f,
      excludedLocationIds: f.excludedLocationIds.includes(id) ? f.excludedLocationIds.filter(x => x !== id) : [...f.excludedLocationIds, id],
    }))
  }

  function openAdd() { setForm({ startDate: '', endDate: '', name: '', excludedLocationIds: [] }); setIsRange(false); setFormError(''); setFormNote(''); setModal(true) }

  async function save() {
    const endDate = isRange ? form.endDate : form.startDate
    if (!form.startDate || !endDate || !form.name.trim()) { setFormError(isRange ? 'Start date, end date, and name are required' : 'Date and name are required'); return }
    if (endDate < form.startDate) { setFormError('End date must be on or after the start date'); return }
    setSaving(true); setFormError(''); setFormNote('')
    const res = await fetch('/api/hr/national-holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, endDate }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false); load()
    if (data.skipped > 0) {
      setFormNote(`Added ${data.created} day${data.created !== 1 ? 's' : ''} — ${data.skipped} already had a holiday set and ${data.skipped !== 1 ? 'were' : 'was'} skipped.`)
    } else {
      setModal(false)
    }
  }

  async function removeHoliday(holiday: Holiday) {
    if (!(await confirm({
      title: `Remove ${holiday.name}?`,
      description: 'This date will go back to being a normal working day in Attendance Recap and Payroll.',
      confirmLabel: 'Remove',
      destructive: true,
    }))) return
    await fetch(`/api/hr/national-holidays/${holiday.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">National Holidays</h2>
          <p className="text-muted-foreground text-sm mt-1">Marked automatically as Day Off in Attendance Recap, excluded from Payroll&apos;s Meal Allowance working-days count, and opens up Overtime — for every work location, unless you exclude some below.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Add Holiday
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /></div>)}
        </div>
      ) : holidays.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <CalendarOff className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No national holidays set yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs">Added By</th>
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {holidays.map(h => (
                <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{formatDate(h.date, 'long')}</td>
                  <td className="px-5 py-3">
                    {h.name}
                    {h.excludedLocationIds.length > 0 && (
                      <div className="text-[11px] text-warning mt-0.5">
                        Working as usual: {h.excludedLocationIds.map(locationName).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{h.createdBy?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => removeHoliday(h)} title="Remove" aria-label={`Remove ${h.name}`}
                      className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="font-bold text-sm pr-6">Add National Holiday</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            {formNote && <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">{formNote}</p>}

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={isRange} onChange={e => setIsRange(e.target.checked)}
                className="h-4 w-4 accent-primary" />
              Multiple days (range) — e.g. Idul Fitri
            </label>

            {isRange ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-start" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</Label>
                  <Input id="holiday-start" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate >= e.target.value ? f.endDate : e.target.value }))}
                    className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="holiday-end" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</Label>
                  <Input id="holiday-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="h-10" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="holiday-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</Label>
                <Input id="holiday-date" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: e.target.value }))}
                  className="h-10" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="holiday-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</Label>
              <Input id="holiday-name" type="text" placeholder="e.g. Independence Day" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="h-10" />
            </div>
            <div role="group" aria-labelledby="holiday-working-label" className="space-y-1.5">
              <p id="holiday-working-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">Working as usual (optional)</p>
              <p className="text-[11px] text-muted-foreground">Pick any work locations that stay on a normal working day through this holiday — everyone else gets the day off.</p>
              {locations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No work locations set up yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {locations.map(l => {
                    const active = form.excludedLocationIds.includes(l.id)
                    return (
                      <button key={l.id} type="button" onClick={() => toggleExcludedLocation(l.id)} aria-pressed={active}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          active ? 'border-primary bg-primary/10 text-primary-strong' : 'border-muted text-muted-foreground hover:border-foreground/30'
                        }`}>
                        {l.name.trim()}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} className="font-semibold">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
