'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, Banknote, Loader2 } from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
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
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-purple-100 text-purple-700',
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
          <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            <Plus className="h-4 w-4" /> New Period
          </button>
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
              className="w-full text-left rounded-xl border overflow-hidden hover:border-amber-300 transition-colors">
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-semibold text-sm">{MONTH_NAMES[p.month - 1]} {p.year}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p._count.entries} {p._count.entries === 1 ? 'employee' : 'employees'}
                    {p.payDate ? ` · Pay date ${new Date(p.payDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">New Payroll Period</h3>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month</label>
                  <select value={form.month} onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500">
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Year</label>
                  <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Cutoff defaults to the 20th, pay date to the 25th of the selected month — both editable later.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
