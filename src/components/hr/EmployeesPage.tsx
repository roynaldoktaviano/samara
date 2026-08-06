'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, IdCard, AlertTriangle, Search, Download, Upload, FileDown, CheckCircle2, AlertCircle, UserX, ChevronLeft, ChevronRight } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface LegalEntity { id: string; name: string; code: string | null }
interface EmployeeRole { id: string; title: string }
interface Location { id: string; name: string; type: string }
interface AppUser { id: string; name: string | null; email: string; role: string }
interface Employee {
  id: string; employeeNumber: string; fullName: string; department: string | null; isActive: boolean
  resignedAt: string | null; resignStatus: string | null; resignReason: string | null
  gender: string | null; employmentStatus: string | null; leaveBalance: number | null; joinDate: string | null
  legalEntity: LegalEntity | null; location: Location | null; role: EmployeeRole | null
  managerId: string | null; manager: { id: string; fullName: string } | null
  userId: string | null; user: { id: string; name: string | null; email: string } | null
}

const BLANK = { fullName: '', employeeNumber: '', legalEntityId: '', locationId: '', department: '', roleId: '', gender: '', employmentStatus: '', leaveBalance: '', joinDate: '', managerId: '', userId: '' }

const GENDERS = ['Male', 'Female']
const EMPLOYMENT_STATUSES = ['Permanent', 'Contract', 'Probation', 'Intern']

function formatServiceYear(joinDate: string | null, endDate: string | null): string {
  if (!joinDate) return '—'
  const start = new Date(joinDate)
  const end = endDate ? new Date(endDate) : new Date()
  if (isNaN(start.getTime()) || end < start) return '—'

  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  let days = end.getDate() - start.getDate()
  if (days < 0) {
    months -= 1
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  return `${years}Year${months}Months${days}Days`
}

const RESIGN_STATUSES = [
  { value: 'RESIGNED', label: 'Resigned' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'CONTRACT_ENDED', label: 'Contract Ended' },
  { value: 'OTHER', label: 'Other' },
]
const RESIGN_STATUS_LABEL: Record<string, string> = Object.fromEntries(RESIGN_STATUSES.map(s => [s.value, s.label]))
const todayISO = () => new Date().toISOString().slice(0, 10)
const RESIGN_BLANK = { resignedAt: todayISO(), resignStatus: 'RESIGNED', resignReason: '' }

const CSV_HEADERS = ['Employee No.', 'Employee Name', 'Job Position', 'Company', 'Leave', 'Gender', 'Location', 'Vessel / Department', 'Employment Status', 'Join', 'Service Year', 'Status']

function buildCSV(rows: string[][]): string {
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function downloadFile(content: string, filename: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['﻿' + content], { type: mime }) // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([])
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [entityFilter, setEntityFilter] = useState('All')
  const [locationFilter, setLocationFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Employee | null>(null)

  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)
  const [resignForm, setResignForm] = useState({ ...RESIGN_BLANK })
  const [deactivating, setDeactivating] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; total: number; errors: { row: number; sku: string; error: string }[] } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [empRes, entRes, roleRes, locRes, userRes] = await Promise.all([
      fetch('/api/hr/employees'),
      fetch('/api/hr/legal-entities'),
      fetch('/api/hr/roles'),
      fetch('/api/purchasing/locations'),
      // Admin/Super Admin only — HR editors won't be able to link login accounts,
      // the picker below just stays empty for them rather than failing the page load.
      fetch('/api/users'),
    ])
    if (empRes.ok) setEmployees(await empRes.json())
    if (entRes.ok) setLegalEntities(await entRes.json())
    if (roleRes.ok) setRoles(await roleRes.json())
    if (locRes.ok) setLocations((await locRes.json()).filter((l: Location & { isActive?: boolean }) => l.isActive !== false))
    if (userRes.ok) setUsers(await userRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ ...BLANK }); setEditing(null); setFormError(''); setModal(true) }
  function openEdit(emp: Employee) {
    setForm({
      fullName: emp.fullName, employeeNumber: emp.employeeNumber,
      legalEntityId: emp.legalEntity?.id ?? '', locationId: emp.location?.id ?? '',
      department: emp.department ?? '', roleId: emp.role?.id ?? '',
      gender: emp.gender ?? '', employmentStatus: emp.employmentStatus ?? '',
      leaveBalance: emp.leaveBalance != null ? String(emp.leaveBalance) : '',
      joinDate: emp.joinDate ? emp.joinDate.slice(0, 10) : '',
      managerId: emp.managerId ?? '',
      userId: emp.userId ?? '',
    })
    setEditing(emp); setFormError(''); setModal(true)
  }

  async function save() {
    if (!form.fullName.trim()) { setFormError('Full name is required'); return }
    setSaving(true); setFormError('')
    const method = editing ? 'PUT' : 'POST'
    const url = editing ? `/api/hr/employees/${editing.id}` : '/api/hr/employees'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  function toggleActive(emp: Employee) {
    if (emp.isActive) {
      // Deactivating requires a reason — open the resignation modal instead of toggling directly.
      setDeactivateTarget(emp); setResignForm({ ...RESIGN_BLANK }); return
    }
    reactivate(emp)
  }

  async function reactivate(emp: Employee) {
    await fetch(`/api/hr/employees/${emp.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) })
    load()
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    await fetch(`/api/hr/employees/${deactivateTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false, ...resignForm }),
    })
    setDeactivating(false)
    setDeactivateTarget(null)
    load()
  }

  async function doDelete(emp: Employee) {
    const res = await fetch(`/api/hr/employees/${emp.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete') }
    setDeleteConfirm(null); load()
  }

  function exportCSV() {
    const rows = filtered.map(e => [
      e.employeeNumber, e.fullName, e.role?.title ?? '', e.legalEntity?.name ?? '',
      e.leaveBalance != null ? String(e.leaveBalance) : '', e.gender ?? '', e.location?.name ?? '',
      e.department ?? '', e.employmentStatus ?? '', e.joinDate ? e.joinDate.slice(0, 10) : '',
      formatServiceYear(e.joinDate, e.resignedAt), e.isActive ? 'Active' : 'Inactive',
    ])
    downloadFile(buildCSV([CSV_HEADERS, ...rows]), `employees-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function downloadTemplate() {
    const sample = ['EMP-0001', 'Made Ari', 'Bartender / Service', 'PT Samara Wisata Bahari', '12', 'Male', 'Samara I', 'F&B', 'Permanent', '2020-01-15', '', 'Active']
    downloadFile(buildCSV([CSV_HEADERS, sample]), 'template-employees.csv')
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/hr/employees/import', { method: 'POST', body: fd })
    const data = await res.json()
    setImporting(false)
    if (!res.ok) { alert(data.error ?? 'Import failed'); return }
    setImportResult(data)
    load()
  }

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.fullName.toLowerCase().includes(search.toLowerCase()) || e.employeeNumber.toLowerCase().includes(search.toLowerCase())
    const matchEntity = entityFilter === 'All' || e.legalEntity?.id === entityFilter
    const matchLocation = locationFilter === 'All' || e.location?.id === locationFilter
    const matchRole = roleFilter === 'All' || e.role?.id === roleFilter
    const matchStatus = statusFilter === 'All' || (statusFilter === 'Active' ? e.isActive : !e.isActive)
    return matchSearch && matchEntity && matchLocation && matchRole && matchStatus
  })

  const hasActiveFilters = search || entityFilter !== 'All' || locationFilter !== 'All' || roleFilter !== 'All' || statusFilter !== 'All'
  function resetFilters() { setSearch(''); setEntityFilter('All'); setLocationFilter('All'); setRoleFilter('All'); setStatusFilter('All') }

  useEffect(() => { setPage(0) }, [search, entityFilter, locationFilter, roleFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Employees</h2>
          <p className="text-muted-foreground text-sm mt-1">Employee master data across legal entities and work locations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted transition-colors"
            title="Download template CSV"
          >
            <FileDown className="h-4 w-4" /> Template
          </button>
          <button
            onClick={exportCSV}
            disabled={employees.length === 0}
            className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <Upload className="h-4 w-4" /> {importing ? 'Importing...' : 'Import CSV'}
          </button>
          <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
          <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            <Plus className="h-4 w-4" /> Add Employee
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
        <div className="relative flex-1 min-w-45 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            className="w-full h-9 pl-9 pr-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="Search name or employee number..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
        >
          <option value="All">All Legal Entities</option>
          {legalEntities.map(le => <option key={le.id} value={le.id}>{le.name}</option>)}
        </select>

        <select
          className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
        >
          <option value="All">All Work Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select
          className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="All">All Roles</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>

        <select
          className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'All' | 'Active' | 'Inactive')}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

        {hasActiveFilters && (
          <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(4)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Legal Entity</th>
                <th className="text-left px-4 py-3 font-medium">Work Location</th>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Reports To</th>
                <th className="text-left px-4 py-3 font-medium">Gender</th>
                <th className="text-left px-4 py-3 font-medium">Employment Status</th>
                <th className="text-center px-4 py-3 font-medium">Leave</th>
                <th className="text-left px-4 py-3 font-medium">Join</th>
                <th className="text-left px-4 py-3 font-medium">Service Year</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-12 text-muted-foreground text-sm">
                  <IdCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  {hasActiveFilters ? 'No employees match your filters.' : 'No employees yet. Click "Add Employee" to get started.'}
                </td></tr>
              ) : paginated.map(emp => (
                <tr key={emp.id} className={`hover:bg-muted/30 transition-colors ${!emp.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium flex items-center gap-1.5">
                      {emp.fullName}
                      {emp.userId && (
                        <span title={`Linked to login: ${emp.user?.email ?? ''}`} className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.legalEntity?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.location?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.department ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.role?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.manager?.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.gender ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.employmentStatus ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs text-center">{emp.leaveBalance ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatServiceYear(emp.joinDate, emp.resignedAt)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(emp)} title={!emp.isActive ? 'Reactivate' : 'Deactivate'}>
                      {emp.isActive
                        ? <ToggleRight className="h-5 w-5 text-green-600 mx-auto" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground mx-auto" />}
                    </button>
                    {!emp.isActive && emp.resignedAt && (
                      <div className="mt-1 text-[10px] text-muted-foreground leading-tight" title={emp.resignReason ?? undefined}>
                        {RESIGN_STATUS_LABEL[emp.resignStatus ?? ''] ?? 'Left'} · {new Date(emp.resignedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(emp)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteConfirm(emp)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-xs">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0) }}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs">
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title="First page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs px-1">Page {safePage + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title="Last page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, #bdac7e 0%, #a89860 100%)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/20 rounded-xl">
                      <IdCard className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg leading-tight">{editing ? 'Edit Employee' : 'Add Employee'}</h3>
                      <p className="text-amber-100 text-xs mt-0.5">{editing ? 'Update this employee’s details' : 'Add a new employee to the master data'}</p>
                    </div>
                  </div>
                  <button onClick={() => setModal(false)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Full Name <span className="text-red-500 normal-case">*</span>
                    </label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus
                    />
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee Number</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      placeholder="Generated if blank"
                      value={form.employeeNumber} onChange={e => setForm(f => ({ ...f, employeeNumber: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Legal Entity</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.legalEntityId} onChange={e => setForm(f => ({ ...f, legalEntityId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {legalEntities.map(le => <option key={le.id} value={le.id}>{le.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Location</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </select>
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reports To (Manager)</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.managerId} onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}
                    >
                      <option value="">— No manager set —</option>
                      {employees.filter(e => e.isActive && e.id !== editing?.id).map(e => (
                        <option key={e.id} value={e.id}>{e.fullName} ({e.employeeNumber})</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">Drives who approves this employee&apos;s purchase requests.</p>
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Linked Login Account</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                    >
                      <option value="">— No login linked —</option>
                      {users
                        .filter(u => u.id === form.userId || !employees.some(e => e.userId === u.id && e.id !== editing?.id))
                        .map(u => <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>)}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      {users.length === 0 ? 'Only Admin/Super Admin can link login accounts.' : 'Required for this person to approve requests or receive notifications.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80">
                <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-xl hover:bg-white transition-all">
                  Cancel
                </button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 text-sm text-white rounded-xl font-semibold disabled:opacity-50 transition-colors shadow-sm bg-[#bdac7e] hover:bg-[#a89860]">
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Employee'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Delete Employee?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.fullName}</span> ({deleteConfirm.employeeNumber}) will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate / Resignation Modal ── */}
      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-5 border-b">
              <div className="p-2 rounded-full bg-red-50">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-base leading-tight">Deactivate Employee</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">{deactivateTarget.fullName}</span> ({deactivateTarget.employeeNumber})
                </p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">Is this employee resigning? Record the details below.</p>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={resignForm.resignStatus} onChange={e => setResignForm(f => ({ ...f, resignStatus: e.target.value }))}
                >
                  {RESIGN_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resignation Date</label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={resignForm.resignedAt} onChange={e => setResignForm(f => ({ ...f, resignedAt: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                  rows={3}
                  placeholder="Optional notes on why this employee is leaving..."
                  value={resignForm.resignReason} onChange={e => setResignForm(f => ({ ...f, resignReason: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end px-6 py-4 border-t bg-muted/20">
              <button onClick={() => setDeactivateTarget(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={confirmDeactivate} disabled={deactivating} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90 disabled:opacity-50">
                {deactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Result Modal ── */}
      {importResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="font-semibold text-lg">CSV Import Results</h3>
              <button onClick={() => setImportResult(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
                  <p className="text-xs text-green-600 mt-0.5">New employees</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{importResult.updated}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Updated</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{importResult.errors.length}</p>
                  <p className="text-xs text-red-600 mt-0.5">Errors</p>
                </div>
              </div>

              {importResult.errors.length === 0 ? (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">All {importResult.total} rows processed successfully</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p className="text-sm">{importResult.total} succeeded, {importResult.errors.length} rows failed:</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-sm">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 flex gap-3">
                        <span className="text-muted-foreground shrink-0">Row {e.row}</span>
                        <span className="font-mono text-xs shrink-0 text-amber-700">{e.sku}</span>
                        <span className="text-destructive text-xs">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setImportResult(null)} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
