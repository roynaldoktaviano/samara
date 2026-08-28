'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, IdCard, AlertTriangle, Search, Download, Upload, FileDown, CheckCircle2, AlertCircle, UserX, ChevronLeft, ChevronRight, Phone, MapPin, Cake } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiFilePicker } from '@/components/ui/file-preview'
import { RupiahInput } from '@/components/ui/rupiah-input'
import type { OtherIncomeItem } from '@/lib/payroll'

interface LegalEntity { id: string; name: string; code: string | null }
interface BusinessUnit { id: string; name: string }
interface EmployeeRole { id: string; title: string }
interface Location { id: string; name: string }
interface AppUser { id: string; name: string | null; email: string; role: string }
interface Employee {
  id: string; employeeNumber: string; fullName: string; department: string | null; isActive: boolean
  resignedAt: string | null; resignStatus: string | null; resignReason: string | null
  gender: string | null; employmentStatus: string | null; level: 'HIGH' | 'MEDIUM' | 'LOW' | null; leaveBalance: number | null; leaveEntitlementPolicy: string | null
  joinDate: string | null; contractStartDate: string | null; contractEndDate: string | null
  phone: string | null; address: string | null; birthDate: string | null
  nikPassport: string | null; nationality: string | null; religion: string | null; placeOfBirth: string | null
  motherName: string | null; personalEmail: string | null; maritalStatus: string | null; addressCurrent: string | null
  emergencyContactName: string | null; emergencyContactPhone: string | null; emergencyContactRelation: string | null
  npwp: string | null; kkNumber: string | null
  bankName: string | null; bankAccountNumber: string | null; bankAccountName: string | null
  bpjsKesehatanNumber: string | null; bpjsTkNumber: string | null
  basicSalary: number | null; allowance: number | null; uangLayar: number | null; uangMakan: number | null; thr: number | null
  otherIncome: OtherIncomeItem[]
  seamanBookFiles: string[]; bstFiles: string[]; medicalCheckupFiles: string[]; ijazahFiles: string[]; certificateFiles: string[]; contractFiles: string[]
  legalEntity: LegalEntity | null; businessUnit: BusinessUnit | null; location: Location | null; role: EmployeeRole | null
  managerId: string | null; manager: { id: string; fullName: string } | null
  userId: string | null; user: { id: string; name: string | null; email: string } | null
}

const BLANK = {
  fullName: '', employeeNumber: '', legalEntityId: '', businessUnitId: '', locationId: '', department: '', roleId: '', level: '', gender: '', employmentStatus: '', leaveBalance: '', leaveEntitlementPolicy: '',
  joinDate: '', contractStartDate: '', contractEndDate: '', managerId: '', userId: '', phone: '', address: '', birthDate: '',
  nikPassport: '', nationality: '', religion: '', placeOfBirth: '', motherName: '', personalEmail: '', maritalStatus: '', addressCurrent: '',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  npwp: '', kkNumber: '', bankName: '', bankAccountNumber: '', bankAccountName: '', bpjsKesehatanNumber: '', bpjsTkNumber: '',
  basicSalary: '', allowance: '', uangLayar: '', uangMakan: '', thr: '',
  otherIncome: [] as OtherIncomeItem[],
  seamanBookFiles: [] as string[], bstFiles: [] as string[], medicalCheckupFiles: [] as string[], ijazahFiles: [] as string[], certificateFiles: [] as string[], contractFiles: [] as string[],
}

const GENDERS = ['Male', 'Female']
const EMPLOYMENT_STATUSES = ['Probation', 'Internship', 'Freelance', 'Contract (PKWT)', 'Permanent (PKWTT)']
const DEPARTMENTS = ['Management', 'Finance', 'Human Resources', 'Sales', 'Marketing', 'Kitchen', 'Bar', 'Housekeeping', 'Engineering', 'Deckhand']
const MARITAL_STATUSES = ['TK', 'K0', 'K1', 'K2', 'K3']
const LEAVE_ENTITLEMENT_POLICIES = ['12 hari', '20 hari', '2 bulan']

/** Ensures an existing value not in the preset list still shows up as an option, so editing an old record doesn't silently blank it out. */
function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : list
}

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

function ManagerCombobox({ value, options, onChange }: {
  value: string; options: { id: string; fullName: string; employeeNumber: string }[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : options
  const selected = options.find(e => e.id === value)

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm text-left flex items-center justify-between focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? `${selected.fullName} (${selected.employeeNumber})` : '— No manager set —'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {value && (
                <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted border-b transition-colors">
                  — No manager set —
                </button>
              )}
              {opts.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground">No employees found</p>
              )}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">
                  {e.fullName} <span className="text-muted-foreground">({e.employeeNumber})</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function UserCombobox({ value, options, onChange }: {
  value: string; options: { id: string; name: string | null; email: string }[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(u => (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : options
  const selected = options.find(u => u.id === value)

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm text-left flex items-center justify-between focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? (selected.name ? `${selected.name} (${selected.email})` : selected.email) : '— No login linked —'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search login account..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {value && (
                <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted border-b transition-colors">
                  — No login linked —
                </button>
              )}
              {opts.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground">No accounts found</p>
              )}
              {opts.map(u => (
                <button key={u.id} type="button" onClick={() => { onChange(u.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">
                  {u.name ? `${u.name} (${u.email})` : u.email}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [viewMode, setViewMode] = useState<'table' | 'location'>('table')
  const [entityFilter, setEntityFilter] = useState('All')
  const [businessUnitFilter, setBusinessUnitFilter] = useState('All')
  const [locationFilter, setLocationFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [modal, setModal] = useState(false)
  const [modalTab, setModalTab] = useState<'details' | 'contact' | 'bank' | 'salary' | 'documents'>('details')
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
    const [empRes, entRes, buRes, roleRes, locRes, userRes] = await Promise.all([
      fetch('/api/hr/employees'),
      fetch('/api/hr/legal-entities'),
      fetch('/api/hr/business-units'),
      fetch('/api/hr/roles'),
      fetch('/api/hr/work-locations'),
      // Admin/Super Admin only — HR editors won't be able to link login accounts,
      // the picker below just stays empty for them rather than failing the page load.
      fetch('/api/users'),
    ])
    if (empRes.ok) setEmployees(await empRes.json())
    if (entRes.ok) setLegalEntities(await entRes.json())
    if (buRes.ok) setBusinessUnits(await buRes.json())
    if (roleRes.ok) setRoles(await roleRes.json())
    if (locRes.ok) setLocations(await locRes.json())
    if (userRes.ok) setUsers(await userRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ ...BLANK }); setEditing(null); setFormError(''); setModalTab('details'); setModal(true) }
  function openEdit(emp: Employee) {
    setForm({
      fullName: emp.fullName, employeeNumber: emp.employeeNumber,
      legalEntityId: emp.legalEntity?.id ?? '', businessUnitId: emp.businessUnit?.id ?? '', locationId: emp.location?.id ?? '',
      department: emp.department ?? '', roleId: emp.role?.id ?? '',
      gender: emp.gender ?? '', employmentStatus: emp.employmentStatus ?? '', level: emp.level ?? '',
      leaveBalance: emp.leaveBalance != null ? String(emp.leaveBalance) : '',
      leaveEntitlementPolicy: emp.leaveEntitlementPolicy ?? '',
      joinDate: emp.joinDate ? emp.joinDate.slice(0, 10) : '',
      contractStartDate: emp.contractStartDate ? emp.contractStartDate.slice(0, 10) : '',
      contractEndDate: emp.contractEndDate ? emp.contractEndDate.slice(0, 10) : '',
      managerId: emp.managerId ?? '',
      userId: emp.userId ?? '',
      phone: emp.phone ?? '',
      address: emp.address ?? '',
      birthDate: emp.birthDate ? emp.birthDate.slice(0, 10) : '',
      nikPassport: emp.nikPassport ?? '', nationality: emp.nationality ?? '', religion: emp.religion ?? '',
      placeOfBirth: emp.placeOfBirth ?? '', motherName: emp.motherName ?? '', personalEmail: emp.personalEmail ?? '',
      maritalStatus: emp.maritalStatus ?? '', addressCurrent: emp.addressCurrent ?? '',
      emergencyContactName: emp.emergencyContactName ?? '', emergencyContactPhone: emp.emergencyContactPhone ?? '', emergencyContactRelation: emp.emergencyContactRelation ?? '',
      npwp: emp.npwp ?? '', kkNumber: emp.kkNumber ?? '',
      bankName: emp.bankName ?? '', bankAccountNumber: emp.bankAccountNumber ?? '', bankAccountName: emp.bankAccountName ?? '',
      bpjsKesehatanNumber: emp.bpjsKesehatanNumber ?? '', bpjsTkNumber: emp.bpjsTkNumber ?? '',
      basicSalary: emp.basicSalary != null ? String(emp.basicSalary) : '',
      allowance: emp.allowance != null ? String(emp.allowance) : '',
      uangLayar: emp.uangLayar != null ? String(emp.uangLayar) : '',
      uangMakan: emp.uangMakan != null ? String(emp.uangMakan) : '',
      thr: emp.thr != null ? String(emp.thr) : '',
      otherIncome: emp.otherIncome ?? [],
      seamanBookFiles: emp.seamanBookFiles ?? [], bstFiles: emp.bstFiles ?? [], medicalCheckupFiles: emp.medicalCheckupFiles ?? [],
      ijazahFiles: emp.ijazahFiles ?? [], certificateFiles: emp.certificateFiles ?? [], contractFiles: emp.contractFiles ?? [],
    })
    setEditing(emp); setFormError(''); setModalTab('details'); setModal(true)
  }

  function addOtherIncomeRow() {
    setForm(f => ({ ...f, otherIncome: [...f.otherIncome, { id: crypto.randomUUID(), name: '', description: '', amount: 0 }] }))
  }
  function updateOtherIncomeRow(id: string, patch: Partial<OtherIncomeItem>) {
    setForm(f => ({ ...f, otherIncome: f.otherIncome.map(r => r.id === id ? { ...r, ...patch } : r) }))
  }
  function removeOtherIncomeRow(id: string) {
    setForm(f => ({ ...f, otherIncome: f.otherIncome.filter(r => r.id !== id) }))
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
    const sample = ['EMP-0001', 'Made Ari', 'Bartender / Service', 'PT Samara Wisata Bahari', '12', 'Male', 'Kapal', 'F&B', 'Permanent', '2020-01-15', '', 'Active']
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
    const matchBusinessUnit = businessUnitFilter === 'All' || e.businessUnit?.id === businessUnitFilter
    const matchLocation = locationFilter === 'All' || e.location?.id === locationFilter
    const matchRole = roleFilter === 'All' || e.role?.id === roleFilter
    const matchStatus = statusFilter === 'All' || (statusFilter === 'Active' ? e.isActive : !e.isActive)
    return matchSearch && matchEntity && matchBusinessUnit && matchLocation && matchRole && matchStatus
  })

  const hasActiveFilters = search || entityFilter !== 'All' || businessUnitFilter !== 'All' || locationFilter !== 'All' || roleFilter !== 'All' || statusFilter !== 'All'
  function resetFilters() { setSearch(''); setEntityFilter('All'); setBusinessUnitFilter('All'); setLocationFilter('All'); setRoleFilter('All'); setStatusFilter('All') }

  useEffect(() => { setPage(0) }, [search, entityFilter, businessUnitFilter, locationFilter, roleFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  // "By Location" view — same `filtered` set as the table (search/filters still apply),
  // just clustered under each work location so it's obvious at a glance who's based
  // where (office vs. which specific vessel) instead of scanning one long flat list.
  const locationGroups = (() => {
    const map = new Map<string, Employee[]>()
    filtered.forEach(e => {
      const key = e.location?.name ?? 'Unassigned'
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    })
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'Unassigned') return 1
      if (b === 'Unassigned') return -1
      return a.localeCompare(b)
    })
  })()

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

      {/* ── View toggle ── */}
      <div className="inline-flex rounded-md border p-0.5 bg-muted/40 w-fit">
        {([['table', 'Table'], ['location', 'By Location']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setViewMode(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors ${
              viewMode === key ? 'bg-white shadow-sm text-amber-700' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {label}
          </button>
        ))}
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
          value={businessUnitFilter} onChange={e => setBusinessUnitFilter(e.target.value)}
        >
          <option value="All">All Business Units</option>
          {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
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
      ) : viewMode === 'location' ? (
        <div className="space-y-3">
          {locationGroups.length === 0 ? (
            <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
              <IdCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
              {hasActiveFilters ? 'No employees match your filters.' : 'No employees yet. Click "Add Employee" to get started.'}
            </div>
          ) : locationGroups.map(([locName, emps]) => (
            <div key={locName} className="rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b">
                <p className="font-semibold text-sm">{locName}</p>
                <span className="text-xs text-muted-foreground">{emps.length} employee{emps.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y">
                {emps.map(emp => (
                  <div key={emp.id} onClick={() => openEdit(emp)}
                    className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${!emp.isActive ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-sm flex items-center gap-1.5 truncate">
                        {emp.fullName}
                        {emp.userId && (
                          <span title={`Linked to login: ${emp.user?.email ?? ''}`} className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-muted-foreground">{emp.role?.title ?? '—'}</span>
                      <span className="text-xs text-muted-foreground">{emp.department ?? '—'}</span>
                      <button onClick={e => { e.stopPropagation(); toggleActive(emp) }} title={!emp.isActive ? 'Reactivate' : 'Deactivate'}>
                        {emp.isActive
                          ? <ToggleRight className="h-5 w-5 text-green-600" />
                          : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Work Location</th>
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
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground text-sm">
                  <IdCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  {hasActiveFilters ? 'No employees match your filters.' : 'No employees yet. Click "Add Employee" to get started.'}
                </td></tr>
              ) : paginated.map(emp => (
                <tr key={emp.id} onClick={() => openEdit(emp)} className={`cursor-pointer hover:bg-muted/30 transition-colors ${!emp.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium flex items-center gap-1.5">
                      {emp.fullName}
                      {emp.userId && (
                        <span title={`Linked to login: ${emp.user?.email ?? ''}`} className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.location?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.role?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.manager?.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.gender ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.employmentStatus ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs text-center">{emp.leaveBalance ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatServiceYear(emp.joinDate, emp.resignedAt)}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
          </table></div>
        </div>
      )}

      {/* Pagination */}
      {!loading && viewMode === 'table' && filtered.length > 0 && (
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
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
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

              {/* Tabs */}
              <div className="flex items-center gap-1 px-6 pt-4 border-b bg-gray-50/50">
                {([
                  { value: 'details', label: 'Details' },
                  { value: 'contact', label: 'Contact Info' },
                  { value: 'bank', label: 'Bank & Tax' },
                  { value: 'salary', label: 'Salary' },
                  { value: 'documents', label: 'Documents' },
                ] as const).map(t => (
                  <button key={t.value} type="button" onClick={() => setModalTab(t.value)}
                    className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      modalTab === t.value ? 'border-[#bdac7e] text-[#8a744a]' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                )}

                {modalTab === 'details' && (
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
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Unit</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.businessUnitId} onChange={e => setForm(f => ({ ...f, businessUnitId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
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
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    >
                      <option value="">—</option>
                      {withCurrent(DEPARTMENTS, form.department).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role / Position</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}
                    >
                      <option value="">—</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">Skill tier within the role — compared against the approved salary range on Roles &amp; Compensation.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment Status</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.employmentStatus} onChange={e => setForm(f => ({ ...f, employmentStatus: e.target.value }))}
                    >
                      <option value="">—</option>
                      {withCurrent(EMPLOYMENT_STATUSES, form.employmentStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gender</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                    >
                      <option value="">—</option>
                      {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Join Date</label>
                    <input
                      type="date"
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leave Balance (days)</label>
                    <input
                      type="number"
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      placeholder="e.g. 12"
                      value={form.leaveBalance} onChange={e => setForm(f => ({ ...f, leaveBalance: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Start</label>
                    <input
                      type="date"
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.contractStartDate} onChange={e => setForm(f => ({ ...f, contractStartDate: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract End</label>
                    <input
                      type="date"
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      placeholder="Leave blank for permanent staff"
                      value={form.contractEndDate} onChange={e => setForm(f => ({ ...f, contractEndDate: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leave Entitlement</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.leaveEntitlementPolicy} onChange={e => setForm(f => ({ ...f, leaveEntitlementPolicy: e.target.value }))}
                    >
                      <option value="">—</option>
                      {withCurrent(LEAVE_ENTITLEMENT_POLICIES, form.leaveEntitlementPolicy).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reports To (Manager)</label>
                    <ManagerCombobox
                      value={form.managerId}
                      options={employees.filter(e => e.isActive && e.id !== editing?.id)}
                      onChange={id => setForm(f => ({ ...f, managerId: id }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Drives who approves this employee&apos;s purchase requests.</p>
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Linked Login Account</label>
                    <UserCombobox
                      value={form.userId}
                      options={users.filter(u => u.id === form.userId || !employees.some(e => e.userId === u.id && e.id !== editing?.id))}
                      onChange={id => setForm(f => ({ ...f, userId: id }))}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {users.length === 0 ? 'Only Admin/Super Admin can link login accounts.' : 'Required for this person to approve requests or receive notifications.'}
                    </p>
                  </div>
                </div>
                )}

                {modalTab === 'contact' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      <input
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all placeholder:text-gray-400"
                        placeholder="e.g. 0812-3456-7890"
                        value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Personal Email</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all placeholder:text-gray-400"
                      placeholder="personal@email.com"
                      value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Birth Date</label>
                    <div className="relative">
                      <Cake className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      <input
                        type="date"
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                        value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Place of Birth</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.placeOfBirth} onChange={e => setForm(f => ({ ...f, placeOfBirth: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">NIK / Passport</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.nikPassport} onChange={e => setForm(f => ({ ...f, nikPassport: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nationality</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      placeholder="e.g. Indonesia"
                      value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Religion</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.religion} onChange={e => setForm(f => ({ ...f, religion: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marital Status (PTKP)</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.maritalStatus} onChange={e => setForm(f => ({ ...f, maritalStatus: e.target.value }))}
                    >
                      <option value="">—</option>
                      {withCurrent(MARITAL_STATUSES, form.maritalStatus).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mother&apos;s Name</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.motherName} onChange={e => setForm(f => ({ ...f, motherName: e.target.value }))}
                    />
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address 1 (as per ID)</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                      <textarea
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all resize-none placeholder:text-gray-400"
                        placeholder="Alamat lengkap sesuai KTP"
                        rows={2}
                        value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address 2 (current, if different)</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                      <textarea
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all resize-none placeholder:text-gray-400"
                        placeholder="Alamat domisili saat ini, jika berbeda dari KTP"
                        rows={2}
                        value={form.addressCurrent} onChange={e => setForm(f => ({ ...f, addressCurrent: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="col-span-2 border-t border-dashed pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Emergency Contact</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-xs text-muted-foreground">Name</label>
                        <input
                          className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                          value={form.emergencyContactName} onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Phone No.</label>
                        <input
                          className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                          value={form.emergencyContactPhone} onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Relation</label>
                        <input
                          className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                          placeholder="e.g. Spouse, Parent"
                          value={form.emergencyContactRelation} onChange={e => setForm(f => ({ ...f, emergencyContactRelation: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {modalTab === 'bank' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">NPWP</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.npwp} onChange={e => setForm(f => ({ ...f, npwp: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">KK (Kartu Keluarga) No.</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.kkNumber} onChange={e => setForm(f => ({ ...f, kkNumber: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BPJS Kesehatan No.</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.bpjsKesehatanNumber} onChange={e => setForm(f => ({ ...f, bpjsKesehatanNumber: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BPJS Ketenagakerjaan No.</label>
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                      value={form.bpjsTkNumber} onChange={e => setForm(f => ({ ...f, bpjsTkNumber: e.target.value }))}
                    />
                  </div>

                  <div className="col-span-2 border-t border-dashed pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bank Details</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Bank Name</label>
                        <input
                          className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                          placeholder="e.g. Bank Mandiri"
                          value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Account No.</label>
                        <input
                          className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                          value={form.bankAccountNumber} onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-xs text-muted-foreground">Account Holder Name</label>
                        <input
                          className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all"
                          value={form.bankAccountName} onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {modalTab === 'salary' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic Salary</label>
                      <RupiahInput value={form.basicSalary} onChange={digits => setForm(f => ({ ...f, basicSalary: digits }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Allowance</label>
                      <RupiahInput value={form.allowance} onChange={digits => setForm(f => ({ ...f, allowance: digits }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uang Layar (base rate)</label>
                      <RupiahInput value={form.uangLayar} onChange={digits => setForm(f => ({ ...f, uangLayar: digits }))} />
                      <p className="text-[11px] text-muted-foreground">For crew stationed on a yacht (Work Location = yacht name), Payroll multiplies this by that yacht&apos;s trip days each period. Shore-based staff get this flat.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uang Makan (per day)</label>
                      <RupiahInput value={form.uangMakan} onChange={digits => setForm(f => ({ ...f, uangMakan: digits }))} />
                      <p className="text-[11px] text-muted-foreground">Daily rate — Payroll multiplies this by days actually present (from Attendance Recap) each period.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">THR</label>
                      <RupiahInput value={form.thr} onChange={digits => setForm(f => ({ ...f, thr: digits }))} />
                      <p className="text-[11px] text-muted-foreground">Pre-fills the payslip&apos;s THR line at generation — still editable per period.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other Income</label>
                    <div className="space-y-2">
                      {form.otherIncome.map(item => (
                        <div key={item.id} className="flex items-start gap-2 border-2 border-gray-100 rounded-xl p-2.5">
                          <div className="flex-1 space-y-1 min-w-0">
                            <input value={item.name} onChange={e => updateOtherIncomeRow(item.id, { name: e.target.value })} placeholder="Name"
                              className="w-full h-8 text-sm font-medium bg-transparent focus:outline-none" />
                            <input value={item.description} onChange={e => updateOtherIncomeRow(item.id, { description: e.target.value })} placeholder="Description (optional)"
                              className="w-full h-6 text-xs text-muted-foreground bg-transparent focus:outline-none" />
                          </div>
                          <div className="w-32 shrink-0">
                            <RupiahInput value={String(item.amount)} onChange={digits => updateOtherIncomeRow(item.id, { amount: Number(digits) || 0 })} />
                          </div>
                          <button type="button" onClick={() => removeOtherIncomeRow(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addOtherIncomeRow}
                        className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed rounded-xl py-2.5 text-sm text-muted-foreground hover:border-[#bdac7e] hover:text-foreground transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add Other Income
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {modalTab === 'documents' && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buku Pelaut</label>
                    <MultiFilePicker files={form.seamanBookFiles} onChange={files => setForm(f => ({ ...f, seamanBookFiles: files }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BST (Basic Safety Training)</label>
                    <MultiFilePicker files={form.bstFiles} onChange={files => setForm(f => ({ ...f, bstFiles: files }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medical Check Up</label>
                    <MultiFilePicker files={form.medicalCheckupFiles} onChange={files => setForm(f => ({ ...f, medicalCheckupFiles: files }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ijazah</label>
                    <MultiFilePicker files={form.ijazahFiles} onChange={files => setForm(f => ({ ...f, ijazahFiles: files }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Certificates</label>
                    <MultiFilePicker files={form.certificateFiles} onChange={files => setForm(f => ({ ...f, certificateFiles: files }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract</label>
                    <MultiFilePicker files={form.contractFiles} onChange={files => setForm(f => ({ ...f, contractFiles: files }))} />
                    <p className="text-[11px] text-muted-foreground">Expiry is the Contract End date (Details tab, optional) — shows on HR Overview&apos;s Contracts Expiring Soon list.</p>
                  </div>
                </div>
                )}
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
