'use client'

import { useState, useEffect } from 'react'
import { Users, FileWarning, Wallet, ClipboardList, Landmark, Sparkles, Building2, MapPin, AlertTriangle } from 'lucide-react'

interface ContractRow {
  id: string; fullName: string; employeeNumber: string; role: string | null
  contractEndDate: string; daysLeft: number
}
interface HROverviewData {
  activeEmployees: number
  contractsExpiring: ContractRow[]
  contractsExpiringCount: number
  anyContractDatesSet: boolean
  monthlyEmployerCost: number
  pendingLeaveCount: number
  estimatedExitExposure: number
  anySalaryDataSet: boolean
  talentPoolCount: number
  headcountByLocation: { name: string; count: number }[]
  headcountByLegalEntity: { name: string; count: number }[]
}

const fmtMoney = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))
}
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function KPICard({ label, value, note, icon: Icon, tone = 'default', onClick }: {
  label: string; value: string; note: string
  icon: React.ElementType; tone?: 'default' | 'red' | 'amber' | 'blue' | 'muted'
  onClick?: () => void
}) {
  const toneStyle = {
    default: 'bg-card border', red: 'bg-red-50 border-red-200', amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200', muted: 'bg-muted/30 border-dashed',
  }[tone]
  const valStyle = { default: '', red: 'text-red-700', amber: 'text-amber-700', blue: 'text-blue-700', muted: 'text-muted-foreground' }[tone]
  const iconStyle = { default: 'text-muted-foreground', red: 'text-red-400', amber: 'text-amber-400', blue: 'text-blue-400', muted: 'text-muted-foreground/50' }[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`rounded-xl p-5 text-left w-full ${toneStyle} ${onClick ? 'hover:border-[#bdac7e] transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <Icon className={`h-4 w-4 shrink-0 ${iconStyle}`} />
      </div>
      <p className={`text-2xl font-bold mt-2 tracking-tight ${valStyle}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{note}</p>
    </Tag>
  )
}

function BreakdownList({ title, icon: Icon, rows, total }: {
  title: string; icon: React.ElementType; rows: { name: string; count: number }[]; total: number
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => (
            <div key={r.name} className="flex items-center gap-3">
              <span className="text-xs w-32 truncate shrink-0" title={r.name}>{r.name}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-[#bdac7e]" style={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-semibold w-6 text-right shrink-0">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Skeleton({ className }: { className: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />
}

export default function HROverview({ onNavigate }: { onNavigate?: (view: 'hr-leave-requests' | 'hr-candidates') => void }) {
  const [data, setData] = useState<HROverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/hr/overview')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">HR Overview</h2>
        <p className="text-muted-foreground text-sm mt-1">Workforce summary across all legal entities and work locations.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="rounded-xl border p-5 space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-32" /></div>)}
      </div>
    </div>
  )

  if (!data) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600 text-sm">
      Failed to load dashboard data.
    </div>
  )

  const {
    activeEmployees, contractsExpiring, contractsExpiringCount, anyContractDatesSet, monthlyEmployerCost,
    pendingLeaveCount, estimatedExitExposure, anySalaryDataSet, talentPoolCount,
    headcountByLocation, headcountByLegalEntity,
  } = data
  const totalHeadcount = headcountByLocation.reduce((s, r) => s + r.count, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">HR Overview</h2>
          <p className="text-muted-foreground text-sm mt-1">Workforce summary across all legal entities and work locations.</p>
        </div>
        <button onClick={load} className="text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted transition-colors shrink-0">
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard label="Active Employees" value={String(activeEmployees)} note="Currently active headcount" icon={Users} />
        <KPICard
          label="Contracts Expiring"
          value={String(contractsExpiringCount)}
          note={anyContractDatesSet ? 'Within the next 120 days' : 'No contract end dates recorded yet'}
          icon={FileWarning}
          tone={contractsExpiringCount > 0 ? 'amber' : 'default'}
        />
        <KPICard label="Monthly Employer Cost" value={fmtMoney(monthlyEmployerCost)} note="Basic salary + allowance + uang layar + uang makan, active staff" icon={Wallet} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard
          label="Pending Leave Approvals"
          value={String(pendingLeaveCount)}
          note="Awaiting manager/HR decision"
          icon={ClipboardList}
          tone={pendingLeaveCount > 0 ? 'amber' : 'default'}
          onClick={onNavigate ? () => onNavigate('hr-leave-requests') : undefined}
        />
        <KPICard
          label="Estimated Exit Exposure"
          value={anySalaryDataSet ? fmtMoney(estimatedExitExposure) : '—'}
          note="Worst-case severance estimate, active staff — planning only, not a legal figure"
          icon={Landmark}
        />
        <KPICard
          label="Talent Pool"
          value={String(talentPoolCount)}
          note="Active candidates in the pipeline"
          icon={Sparkles}
          onClick={onNavigate ? () => onNavigate('hr-candidates') : undefined}
        />
      </div>

      {/* Headcount breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakdownList title="Headcount by Work Location" icon={MapPin} rows={headcountByLocation} total={totalHeadcount} />
        <BreakdownList title="Headcount by Legal Entity" icon={Building2} rows={headcountByLegalEntity} total={totalHeadcount} />
      </div>

      {/* Contracts expiring soon */}
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/20">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-sm">Contracts Expiring Soon (≤120 days)</h3>
        </div>
        {contractsExpiring.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {anyContractDatesSet ? 'No contracts expiring in the next 120 days.' : 'No contract end dates have been recorded for any employee yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Employee</th>
                <th className="text-left px-5 py-2.5 font-medium">Role</th>
                <th className="text-left px-5 py-2.5 font-medium">Contract End</th>
                <th className="text-right px-5 py-2.5 font-medium">Days Left</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contractsExpiring.map(c => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-5 py-3">
                    <p className="font-medium">{c.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.employeeNumber}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{c.role ?? '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground">{fmtDate(c.contractEndDate)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${c.daysLeft <= 30 ? 'text-red-600' : 'text-amber-600'}`}>{c.daysLeft}d</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
