'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Banknote } from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import PayrollPeriodDetail from './PayrollPeriodDetail'

interface PeriodListItem {
  id: string
  year: number
  month: number
  status: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID'
  payDate: string | null
  submittedBy: { id: string; name: string | null } | null
  approvedBy: { id: string; name: string | null } | null
  rejectedBy: { id: string; name: string | null } | null
  paidBy: { id: string; name: string | null } | null
  _count: { entries: number }
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', PAID: 'Paid',
}
const STATUS_TONE: Record<string, StatusTone> = {
  OPEN: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'destructive',
  PAID: 'success',
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function PayrollPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const canManage = roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE'])

  const [periods, setPeriods] = useState<PeriodListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const now = new Date()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/payroll/periods')
    if (res.ok) setPeriods(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ year: now.getFullYear(), month: now.getMonth() + 1 })
    setFormError('')
    setModal(true)
  }

  async function save() {
    setSaving(true); setFormError('')
    const pad = (n: number) => String(n).padStart(2, '0')
    const res = await fetch('/api/hr/payroll/periods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: form.year, month: form.month,
        cutoffDate: `${form.year}-${pad(form.month)}-20`,
        payDate: `${form.year}-${pad(form.month)}-25`,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
    setSelectedId(data.id)
  }

  if (selectedId) {
    return <PayrollPeriodDetail periodId={selectedId} onBack={() => { setSelectedId(null); load() }} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payroll</h2>
          <p className="text-muted-foreground text-sm mt-1">Cut off on the 20th → HR & Finance input → Head of Finance approval → Finance executes on the 25th</p>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> New Period
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      ) : periods.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <Banknote className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No payroll periods yet.
        </div>
      ) : (
        <div className="space-y-3">
          {periods.map(p => (
            <button key={p.id} onClick={() => setSelectedId(p.id)}
              className="w-full text-left rounded-xl border overflow-hidden hover:border-primary/60 transition-colors">
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-semibold text-sm">{MONTH_NAMES[p.month - 1]} {p.year}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p._count.entries} {p._count.entries === 1 ? 'employee' : 'employees'}
                    {p.payDate ? ` · Pay date ${formatDate(p.payDate)}` : ''}
                  </p>
                </div>
                <StatusBadge tone={STATUS_TONE[p.status]} className="px-2.5 py-1 font-semibold">{STATUS_LABEL[p.status]}</StatusBadge>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="font-bold text-sm">New Payroll Period</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payroll-period-month" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month</Label>
                <NativeSelect id="payroll-period-month" value={form.month} onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}>
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payroll-period-year" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Year</Label>
                <Input id="payroll-period-year" type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Cutoff defaults to the 20th, pay date to the 25th of the selected month — both editable later.</p>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
