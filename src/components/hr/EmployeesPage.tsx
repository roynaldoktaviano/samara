'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, IdCard, AlertTriangle, Search, Download, Upload, FileDown, CheckCircle2, AlertCircle, UserX, ChevronLeft, ChevronRight, ChevronsUpDown, Phone, MapPin, Cake, ImageIcon, FileText, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useFileDrop } from '@/hooks/useFileDrop'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiFilePicker } from '@/components/ui/file-preview'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { usePasswordGate } from '@/components/ui/password-gate'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { formatDate, formatMoney } from '@/lib/format'
import { downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'
import type { OtherIncomeItem } from '@/lib/payroll'
import AddFreelanceModal, { type FreelanceEmployee } from './AddFreelanceModal'

interface LegalEntity { id: string; name: string; code: string | null }
interface BusinessUnit { id: string; name: string }
interface EmployeeRole { id: string; title: string }
interface Location { id: string; name: string }
interface AppUser { id: string; name: string | null; email: string; role: string }
interface Employee {
  id: string; employeeNumber: string; fullName: string; nickName: string | null; department: string | null; isActive: boolean
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
  freelanceFee: number | null; freelanceFeeType: string | null
  replacingEmployeeId: string | null; replacingEmployee: { id: string; fullName: string } | null
  tripAssignments: { booking: { id: string; bookingCode: string; destination: string | null; startDate: string; endDate: string; yacht: { name: string } | null } }[]
}

interface LeaveRequestRow {
  id: string; employee: { id: string }
  startDate: string; endDate: string; days: number; reason: string | null
  status: 'PENDING' | 'PENDING_HR_APPROVAL' | 'APPROVED' | 'REJECTED'
  requiresCrewApproval: boolean
}

interface PerformanceReviewRow {
  id: string; employee: { id: string }
  status: 'REQUESTED' | 'COMPLETED'
  requestedAt: string; reviewedAt: string | null; reviewDate: string | null
  attendanceDiscipline: string | null; workPerformance: string | null; communicationTeamwork: string | null
  attitudeResponsibility: string | null; initiativeProblemSolving: string | null; adaptabilityLearning: string | null
  managerComments: string | null
  decision: string | null; salaryIncrementApproved: boolean
  currentSalary: number | null; newSalary: number | null; reasonNotes: string | null
}

interface CompensationBandRow { id: string; roleId: string; level: 'HIGH' | 'MEDIUM' | 'LOW'; minSalary: number; maxSalary: number }

const BLANK = {
  fullName: '', nickName: '', employeeNumber: '', legalEntityId: '', businessUnitId: '', locationId: '', department: '', roleId: '', level: '', gender: '', employmentStatus: '', leaveBalance: '', leaveEntitlementPolicy: '',
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
// Display-only labels; the stored values above stay as-is.
const LEAVE_POLICY_LABEL: Record<string, string> = { '12 hari': '12 days', '20 hari': '20 days', '2 bulan': '2 months' }

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

function monthsRemaining(endDateStr: string): number {
  const end = new Date(endDateStr)
  const now = new Date()
  return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()))
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

function ManagerCombobox({ id, value, options, onChange }: {
  id?: string; value: string; options: { id: string; fullName: string; employeeNumber: string }[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : options
  const selected = options.find(e => e.id === value)

  return (
    <div className="relative">
      <Button type="button" variant="outline" role="combobox" aria-expanded={open} id={id} onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full justify-between px-3 font-normal">
        <span className={`min-w-0 truncate ${selected ? '' : 'text-muted-foreground'}`}>{selected ? `${selected.fullName} (${selected.employeeNumber})` : '— No manager set —'}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input autoFocus className="h-8 pl-8" aria-label="Search employee"
                  placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors">
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

function UserCombobox({ id, value, options, onChange }: {
  id?: string; value: string; options: { id: string; name: string | null; email: string }[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(u => (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : options
  const selected = options.find(u => u.id === value)

  return (
    <div className="relative">
      <Button type="button" variant="outline" role="combobox" aria-expanded={open} id={id} onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full justify-between px-3 font-normal">
        <span className={`min-w-0 truncate ${selected ? '' : 'text-muted-foreground'}`}>{selected ? (selected.name ? `${selected.name} (${selected.email})` : selected.email) : '— No login linked —'}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input autoFocus className="h-8 pl-8" aria-label="Search login account"
                  placeholder="Search login account…" value={search} onChange={e => setSearch(e.target.value)} />
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors">
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

const DETAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'contract', label: 'Contract' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'leave', label: 'Leave' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'documents', label: 'Documents' },
] as const
type DetailTab = typeof DETAIL_TABS[number]['value']

function detailLeaveStatusLabel(r: LeaveRequestRow): string {
  if (r.status === 'PENDING') return r.requiresCrewApproval ? 'Awaiting Cruise Director/Captain' : 'Pending'
  if (r.status === 'PENDING_HR_APPROVAL') return 'Awaiting HR'
  return r.status.charAt(0) + r.status.slice(1).toLowerCase()
}

const REVIEW_STATUS_LABEL: Record<string, string> = { REQUESTED: 'Requested', COMPLETED: 'Completed' }
const RATING_LABEL: Record<string, string> = { NEEDS_IMPROVEMENT: 'Needs Improvement', GOOD: 'Good', VERY_GOOD: 'Very Good', EXCELLENT: 'Excellent' }
const RATING_COLOR: Record<string, string> = { NEEDS_IMPROVEMENT: 'text-destructive', GOOD: 'text-warning', VERY_GOOD: 'text-info', EXCELLENT: 'text-success' }
const DECISION_LABEL: Record<string, string> = { CONFIRM_PERMANENT: 'Confirmed as Permanent', EXTEND_PROBATION: 'Probation Extended', END_EMPLOYMENT: 'Employment Ended' }
const REVIEW_CRITERIA: { key: keyof PerformanceReviewRow; label: string }[] = [
  { key: 'attendanceDiscipline', label: 'Attendance & Discipline' },
  { key: 'workPerformance', label: 'Work Performance' },
  { key: 'communicationTeamwork', label: 'Communication & Teamwork' },
  { key: 'attitudeResponsibility', label: 'Attitude & Responsibility' },
  { key: 'initiativeProblemSolving', label: 'Initiative & Problem Solving' },
  { key: 'adaptabilityLearning', label: 'Adaptability & Learning' },
]

const DOC_FIELDS: { key: 'seamanBookFiles' | 'bstFiles' | 'medicalCheckupFiles' | 'ijazahFiles' | 'certificateFiles'; label: string }[] = [
  { key: 'seamanBookFiles', label: 'Seaman Book' },
  { key: 'bstFiles', label: 'BST (Basic Safety Training)' },
  { key: 'medicalCheckupFiles', label: 'Medical Check Up' },
  { key: 'ijazahFiles', label: 'Diploma' },
  { key: 'certificateFiles', label: 'Certificates' },
]

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-xl px-4 py-3.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-bold mt-1.5 leading-tight">{value}</div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm border-b border-border last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-semibold text-right">{value ?? '—'}</span>
    </div>
  )
}

function DetailEmpty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground text-center py-10 border-2 border-dashed rounded-xl">{children}</div>
}

function PrivateDataRevealButton({ revealed, onReveal, onHide, label = 'Show' }: { revealed: boolean; onReveal: () => void; onHide: () => void; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={revealed ? onHide : onReveal}
      className="rounded-full text-muted-foreground"
    >
      {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      {revealed ? 'Hide' : label}
    </Button>
  )
}

function DocFileRow({ name, onDownload }: { name: string; onDownload: () => void }) {
  return (
    <div className="flex items-center gap-3 border border-border rounded-xl px-4 py-3">
      <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary-strong flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onDownload} aria-label={`Download ${name}`}
        className="size-7 text-muted-foreground hover:text-primary-strong shrink-0">
        <Download className="size-3.5" />
      </Button>
    </div>
  )
}

// Read-only "detail view" opened by clicking an employee row — mirrors the shape of the
// Edit form's tabs (Details/Contact/Bank/Salary/Documents) but organized for glanceable
// review rather than data entry, with Leave/Reviews pulled in from their own modules.
// The Edit button in the footer hands off to the existing edit modal for changes.
function EmployeeDetailModal({
  employee, leaveRequests, performanceReviews, compensationBand, tab, onTabChange, onClose, onEdit,
}: {
  employee: Employee
  leaveRequests: LeaveRequestRow[]
  performanceReviews: PerformanceReviewRow[]
  compensationBand: CompensationBandRow | null
  tab: DetailTab
  onTabChange: (t: DetailTab) => void
  onClose: () => void
  onEdit: () => void
}) {
  const years = formatServiceYear(employee.joinDate, employee.resignedAt)
  const otherIncomeTotal = employee.otherIncome.reduce((sum, i) => sum + (i.amount || 0), 0)
  const privateGate = usePasswordGate()
  const rangePosition = compensationBand && employee.basicSalary != null
    ? Math.min(100, Math.max(0, ((employee.basicSalary - compensationBand.minSalary) / Math.max(1, compensationBand.maxSalary - compensationBand.minSalary)) * 100))
    : null
  const approvedDays = leaveRequests.filter(r => r.status === 'APPROVED').reduce((sum, r) => sum + r.days, 0)
  const pendingCount = leaveRequests.filter(r => r.status === 'PENDING' || r.status === 'PENDING_HR_APPROVAL').length

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
        <div className="flex items-start justify-between px-8 pt-7 pb-5 pr-14">
          <div className="flex items-center gap-4 min-w-0">
            <span className="h-16 w-16 rounded-full bg-primary/15 text-primary-strong font-bold text-xl flex items-center justify-center shrink-0">
              {initials(employee.fullName)}
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-bold text-2xl leading-tight truncate">
                {employee.fullName}
                {employee.nickName && <span className="text-muted-foreground font-normal"> ({employee.nickName})</span>}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1 truncate">
                {employee.employeeNumber} · {employee.role?.title ?? 'No role'} · {employee.location?.name ?? 'No location'}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-8 border-b overflow-x-auto">
          {DETAIL_TABS.map(t => (
            <button key={t.value} type="button" onClick={() => onTabChange(t.value)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.value ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-8 py-7 space-y-7 max-h-[65vh] overflow-y-auto">
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                <DetailSection title="Employment Assignment">
                  <DetailRow label="Legal Entity" value={employee.legalEntity?.name} />
                  <DetailRow label="Business Unit" value={employee.businessUnit?.name} />
                  <DetailRow label="Work Location" value={employee.location?.name} />
                  <DetailRow label="Department" value={employee.department} />
                  <DetailRow label="Manager" value={employee.manager?.fullName} />
                  <DetailRow label="Join Date" value={employee.joinDate ? `${formatDate(employee.joinDate)} · ${years}` : null} />
                  <DetailRow label="Status" value={<StatusBadge className="px-2.5 py-1 font-semibold" tone={employee.isActive ? 'success' : 'neutral'}>{employee.isActive ? 'Active' : 'Inactive'}</StatusBadge>} />
                </DetailSection>
                <DetailSection title="Contact & Emergency">
                  <DetailRow label="Phone" value={employee.phone} />
                  <DetailRow label="Personal Email" value={employee.personalEmail} />
                  <DetailRow label="NIK / Passport" value={employee.nikPassport} />
                  <DetailRow label="Nationality" value={employee.nationality} />
                  <DetailRow label="Emergency Contact" value={employee.emergencyContactName ? `${employee.emergencyContactName}${employee.emergencyContactRelation ? ` (${employee.emergencyContactRelation})` : ''}` : null} />
                  <DetailRow label="Emergency Phone" value={employee.emergencyContactPhone} />
                </DetailSection>
              </div>
              {!employee.isActive && employee.resignedAt && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-sm text-destructive">
                  <b>{RESIGN_STATUS_LABEL[employee.resignStatus ?? ''] ?? 'Left'}</b> on {formatDate(employee.resignedAt)}
                  {employee.resignReason && <p className="mt-1.5 text-destructive">{employee.resignReason}</p>}
                </div>
              )}
            </div>
          )}

          {tab === 'contract' && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-3">
                <DetailStat label="Contract Type" value={employee.employmentStatus ?? '—'} />
                <DetailStat label="Start" value={formatDate(employee.contractStartDate)} />
                <DetailStat label="End" value={employee.contractEndDate ? formatDate(employee.contractEndDate) : 'No end date'} />
                <DetailStat label="Remaining" value={employee.contractEndDate ? `${monthsRemaining(employee.contractEndDate)} months` : 'Permanent'} />
              </div>
              <DetailSection title="Contract Documents">
                {employee.contractFiles.length === 0 ? (
                  <DetailEmpty>No contract documents uploaded.</DetailEmpty>
                ) : (
                  <div className="space-y-2.5">
                    {employee.contractFiles.map((f, i) => (
                      <DocFileRow key={i} name={`Contract${employee.contractFiles.length > 1 ? ` — file ${i + 1}` : ''}`}
                        onDownload={() => downloadDataUrl(f, `${employee.fullName.replace(/[^a-z0-9]+/gi, '-')}-contract-${i + 1}.${extFromDataUrl(f)}`)} />
                    ))}
                  </div>
                )}
              </DetailSection>
            </div>
          )}

          {tab === 'compensation' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <PrivateDataRevealButton revealed={privateGate.revealed} onReveal={privateGate.requestReveal} onHide={privateGate.hide} label="Show Amounts" />
              </div>

              {!privateGate.revealed ? (
                <DetailEmpty>Salary figures are hidden. Click &quot;Show Amounts&quot; and enter your password to view them.</DetailEmpty>
              ) : employee.employmentStatus === 'Freelance' ? (
                <div className="grid grid-cols-2 gap-3">
                  <DetailStat label="Freelance Fee" value={formatMoney(employee.freelanceFee)} />
                  <DetailStat label="Fee Type" value={employee.freelanceFeeType ?? '—'} />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <DetailStat label="Basic Salary" value={formatMoney(employee.basicSalary)} />
                    <DetailStat label="Allowance" value={formatMoney(employee.allowance)} />
                    <DetailStat label="Uang Layar (base)" value={formatMoney(employee.uangLayar)} />
                    <DetailStat label="Meal Allowance (per day)" value={formatMoney(employee.uangMakan)} />
                    <DetailStat label="THR" value={formatMoney(employee.thr)} />
                    <DetailStat label="Other Income" value={formatMoney(otherIncomeTotal)} />
                  </div>

                  {employee.otherIncome.length > 0 && (
                    <DetailSection title="Other Income Components">
                      <div className="space-y-2.5">
                        {employee.otherIncome.map(item => (
                          <div key={item.id} className="flex items-center justify-between border border-border rounded-xl px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{item.name || 'Untitled'}</p>
                              {item.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>}
                            </div>
                            <span className="text-sm font-bold shrink-0">{formatMoney(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  {employee.role && (
                    <DetailSection title="Role Compensation Range">
                      {compensationBand ? (
                        <div className="border border-border rounded-xl px-5 py-4">
                          <p className="text-sm font-bold">{formatMoney(compensationBand.minSalary)} — {formatMoney(compensationBand.maxSalary)}</p>
                          <div className="relative h-2 bg-muted rounded-full mt-3.5">
                            <div className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-primary border-2 border-card shadow" style={{ left: `calc(${rangePosition ?? 0}% - 7px)` }} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-2.5">
                            {employee.basicSalary != null ? `Basic salary is positioned at ${Math.round(rangePosition ?? 0)}% of the approved range for ${employee.level?.toLowerCase() ?? 'unset'} level.` : 'No basic salary set.'}
                          </p>
                        </div>
                      ) : (
                        <DetailEmpty>No compensation band set for this role{employee.level ? ` at ${employee.level.toLowerCase()} level` : ''}.</DetailEmpty>
                      )}
                    </DetailSection>
                  )}
                </>
              )}
              {privateGate.dialog}
            </div>
          )}

          {tab === 'leave' && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <DetailStat label="Entitlement Policy" value={employee.leaveEntitlementPolicy ? (LEAVE_POLICY_LABEL[employee.leaveEntitlementPolicy] ?? employee.leaveEntitlementPolicy) : '—'} />
                <DetailStat label="Current Balance" value={employee.leaveBalance != null ? `${employee.leaveBalance} days` : '—'} />
                <DetailStat label="Approved This Cycle" value={`${approvedDays} days`} />
              </div>
              {pendingCount > 0 && (
                <p className="text-xs font-medium text-warning bg-warning/10 border border-warning/30 rounded-lg px-3.5 py-2.5">{pendingCount} request{pendingCount !== 1 ? 's' : ''} awaiting decision.</p>
              )}
              {leaveRequests.length === 0 ? (
                <DetailEmpty>No leave requests yet.</DetailEmpty>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Dates</th>
                        <th className="text-left px-4 py-3 font-semibold">Reason</th>
                        <th className="text-center px-4 py-3 font-semibold">Days</th>
                        <th className="text-left px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {leaveRequests.map(r => (
                        <tr key={r.id}>
                          <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.startDate)} → {formatDate(r.endDate)}</td>
                          <td className="px-4 py-3 text-muted-foreground truncate max-w-40">{r.reason ?? '—'}</td>
                          <td className="px-4 py-3 text-center font-semibold">{r.days}</td>
                          <td className="px-4 py-3"><StatusBadge className="px-2.5 py-1 font-semibold" tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'destructive' : r.status === 'PENDING_HR_APPROVAL' ? 'info' : 'warning'}>{detailLeaveStatusLabel(r)}</StatusBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'reviews' && (
            <div className="space-y-3.5">
              {performanceReviews.length === 0 ? (
                <DetailEmpty>No performance review history yet.</DetailEmpty>
              ) : performanceReviews.map(r => (
                <div key={r.id} className="border border-border rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge className="px-2.5 py-1 font-semibold" tone={r.status === 'COMPLETED' ? 'success' : 'warning'}>{REVIEW_STATUS_LABEL[r.status]}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{formatDate(r.reviewDate ?? r.requestedAt)}</span>
                  </div>
                  {REVIEW_CRITERIA.some(c => r[c.key]) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {REVIEW_CRITERIA.filter(c => r[c.key]).map(c => (
                        <span key={c.key} className={`text-xs font-semibold bg-muted/60 rounded-full px-3 py-1.5 ${RATING_COLOR[r[c.key] as string]}`}>
                          {c.label}: {RATING_LABEL[r[c.key] as string]}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.decision && <p className="text-sm font-semibold mt-3">{DECISION_LABEL[r.decision]}</p>}
                  {r.salaryIncrementApproved && r.newSalary != null && (
                    <p className="text-xs font-medium text-success mt-1.5">Salary increment approved: {r.currentSalary != null ? `${formatMoney(r.currentSalary)} → ` : ''}{formatMoney(r.newSalary)}</p>
                  )}
                  {r.managerComments && <p className="text-sm text-muted-foreground mt-2.5">{r.managerComments}</p>}
                  {r.reasonNotes && <p className="text-xs text-muted-foreground mt-2 italic">{r.reasonNotes}</p>}
                </div>
              ))}
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <PrivateDataRevealButton revealed={privateGate.revealed} onReveal={privateGate.requestReveal} onHide={privateGate.hide} label="Show Documents" />
              </div>

              {!privateGate.revealed ? (
                <DetailEmpty>Documents are hidden. Click &quot;Show Documents&quot; and enter your password to view &amp; download them.</DetailEmpty>
              ) : (
                DOC_FIELDS.map(f => (
                  <DetailSection key={f.key} title={f.label}>
                    {employee[f.key].length === 0 ? (
                      <p className="text-sm text-muted-foreground">Not uploaded.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {employee[f.key].map((file, i) => (
                          <DocFileRow key={i} name={`${f.label}${employee[f.key].length > 1 ? ` — file ${i + 1}` : ''}`}
                            onDownload={() => downloadDataUrl(file, `${employee.fullName.replace(/[^a-z0-9]+/gi, '-')}-${f.key}-${i + 1}.${extFromDataUrl(file)}`)} />
                        ))}
                      </div>
                    )}
                  </DetailSection>
                ))
              )}
              {privateGate.dialog}
            </div>
          )}
        </div>

        <DialogFooter className="gap-3 px-8 py-5 border-t bg-muted/50">
          <Button variant="outline" onClick={onClose} className="text-muted-foreground">
            Close
          </Button>
          <Button onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRow[]>([])
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReviewRow[]>([])
  const [compensationBands, setCompensationBands] = useState<CompensationBandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')

  const [viewMode, setViewMode] = useState<'table' | 'location'>('table')
  const [entityFilter, setEntityFilter] = useState('All')
  const [businessUnitFilter, setBusinessUnitFilter] = useState('All')
  const [locationFilter, setLocationFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [modal, setModal] = useState(false)
  const [modalTab, setModalTab] = useState<'details' | 'contact' | 'bank' | 'salary' | 'documents' | 'assets'>('details')
  const [editing, setEditing] = useState<Employee | null>(null)
  const privateGate = usePasswordGate()
  const confirm = useConfirm()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [freelanceModal, setFreelanceModal] = useState(false)
  const [editingFreelance, setEditingFreelance] = useState<Employee | null>(null)

  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)
  const [resignForm, setResignForm] = useState({ ...RESIGN_BLANK })
  const [deactivating, setDeactivating] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; total: number; errors: { row: number; sku: string; error: string }[] } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [empRes, entRes, buRes, roleRes, locRes, userRes, leaveRes, reviewRes, bandRes] = await Promise.all([
      fetch('/api/hr/employees'),
      fetch('/api/hr/legal-entities'),
      fetch('/api/hr/business-units'),
      fetch('/api/hr/roles'),
      fetch('/api/hr/work-locations'),
      // Admin/Super Admin only — HR editors won't be able to link login accounts,
      // the picker below just stays empty for them rather than failing the page load.
      fetch('/api/users'),
      // Feed the employee detail view's Leave/Reviews/Compensation tabs. HR-only
      // endpoints — for a role that can see this page but not those, these just come
      // back non-ok and those tabs render empty rather than failing the page load.
      fetch('/api/hr/leave-requests'),
      fetch('/api/hr/performance-reviews'),
      fetch('/api/hr/compensation-bands'),
    ])
    if (empRes.ok) setEmployees(await empRes.json())
    if (entRes.ok) setLegalEntities(await entRes.json())
    if (buRes.ok) setBusinessUnits(await buRes.json())
    if (roleRes.ok) setRoles(await roleRes.json())
    if (locRes.ok) setLocations(await locRes.json())
    if (userRes.ok) setUsers(await userRes.json())
    if (leaveRes.ok) setLeaveRequests(await leaveRes.json())
    if (reviewRes.ok) setPerformanceReviews(await reviewRes.json())
    if (bandRes.ok) setCompensationBands(await bandRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openDetail(emp: Employee) { setDetailEmployee(emp); setDetailTab('overview') }

  function openAdd() { setForm({ ...BLANK }); setEditing(null); setFormError(''); setModalTab('details'); setModal(true); privateGate.hide() }
  function openEdit(emp: Employee) {
    setForm({
      fullName: emp.fullName, nickName: emp.nickName ?? '', employeeNumber: emp.employeeNumber,
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
    setEditing(emp); setFormError(''); setModalTab('details'); setModal(true); privateGate.hide()
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
    if (!(await confirm({
      title: 'Delete Employee?',
      description: <><span className="font-medium text-foreground">{emp.fullName}</span> ({emp.employeeNumber}) will be permanently deleted.</>,
      destructive: true,
    }))) return
    const res = await fetch(`/api/hr/employees/${emp.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to delete') }
    load()
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
    if (!res.ok) { toast.error(data.error ?? 'Import failed'); return }
    setImportResult(data)
    load()
  }

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.fullName.toLowerCase().includes(search.toLowerCase()) || e.employeeNumber.toLowerCase().includes(search.toLowerCase()) || (e.nickName?.toLowerCase().includes(search.toLowerCase()) ?? false)
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
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="text-muted-foreground"
            title="Download template CSV"
          >
            <FileDown className="h-4 w-4" /> Template
          </Button>
          <Button
            variant="outline"
            onClick={exportCSV}
            disabled={employees.length === 0}
            className="text-muted-foreground"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="text-muted-foreground"
          >
            <Upload className="h-4 w-4" /> {importing ? 'Importing…' : 'Import CSV'}
          </Button>
          <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Employee
          </Button>
          <Button
            variant="outline"
            onClick={() => { setEditingFreelance(null); setFreelanceModal(true) }}
            className="border-primary text-primary-strong hover:bg-primary/10 hover:text-primary-strong"
          >
            <Plus className="h-4 w-4" /> Add Freelance
          </Button>
        </div>
      </div>

      {/* ── View toggle ── */}
      <div className="inline-flex rounded-md border p-0.5 bg-muted/40 w-fit">
        {([['table', 'Table'], ['location', 'By Location']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setViewMode(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors ${
              viewMode === key ? 'bg-card shadow-sm text-primary-strong' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
        <div className="relative flex-1 min-w-45 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 bg-background"
            aria-label="Search employees"
            placeholder="Search name or employee number…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        <NativeSelect
          className="w-auto bg-background"
          aria-label="Filter by legal entity"
          value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
        >
          <option value="All">All Legal Entities</option>
          {legalEntities.map(le => <option key={le.id} value={le.id}>{le.name}</option>)}
        </NativeSelect>

        <NativeSelect
          className="w-auto bg-background"
          aria-label="Filter by business unit"
          value={businessUnitFilter} onChange={e => setBusinessUnitFilter(e.target.value)}
        >
          <option value="All">All Business Units</option>
          {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
        </NativeSelect>

        <NativeSelect
          className="w-auto bg-background"
          aria-label="Filter by work location"
          value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
        >
          <option value="All">All Work Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </NativeSelect>

        <NativeSelect
          className="w-auto bg-background"
          aria-label="Filter by role"
          value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="All">All Roles</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </NativeSelect>

        <NativeSelect
          className="w-auto bg-background"
          aria-label="Filter by status"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'All' | 'Active' | 'Inactive')}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </NativeSelect>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-muted-foreground ml-auto">
            Reset
          </Button>
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
                  <div key={emp.id} onClick={() => openDetail(emp)}
                    className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${!emp.isActive ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-sm flex items-center gap-1.5 truncate">
                        {emp.fullName}
                        {emp.nickName && <span className="text-muted-foreground font-normal">({emp.nickName})</span>}
                        {emp.userId && (
                          <span title={`Linked to login: ${emp.user?.email ?? ''}`} className="inline-block h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-muted-foreground">{emp.role?.title ?? '—'}</span>
                      <span className="text-xs text-muted-foreground">{emp.department ?? '—'}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); toggleActive(emp) }} title={!emp.isActive ? 'Reactivate' : 'Deactivate'} aria-label={`${!emp.isActive ? 'Reactivate' : 'Deactivate'} ${emp.fullName}`}>
                        {emp.isActive
                          ? <ToggleRight className="h-5 w-5 text-success" />
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
                <tr key={emp.id} onClick={() => openDetail(emp)} className={`cursor-pointer hover:bg-muted/30 transition-colors ${!emp.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium flex items-center gap-1.5">
                      {emp.fullName}
                      {emp.nickName && <span className="text-muted-foreground font-normal">({emp.nickName})</span>}
                      {emp.userId && (
                        <span title={`Linked to login: ${emp.user?.email ?? ''}`} className="inline-block h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.location?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.role?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.manager?.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{emp.gender ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {emp.employmentStatus === 'Freelance' ? (
                      <span className="inline-block text-xs font-medium bg-primary/15 text-primary-strong rounded-full px-2 py-0.5">Freelance</span>
                    ) : (
                      <span className="text-muted-foreground">{emp.employmentStatus ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs text-center">{emp.leaveBalance ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(emp.joinDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatServiceYear(emp.joinDate, emp.resignedAt)}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => toggleActive(emp)} title={!emp.isActive ? 'Reactivate' : 'Deactivate'} aria-label={`${!emp.isActive ? 'Reactivate' : 'Deactivate'} ${emp.fullName}`}>
                      {emp.isActive
                        ? <ToggleRight className="h-5 w-5 text-success mx-auto" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground mx-auto" />}
                    </button>
                    {!emp.isActive && emp.resignedAt && (
                      <div className="mt-1 text-[10px] text-muted-foreground leading-tight" title={emp.resignReason ?? undefined}>
                        {RESIGN_STATUS_LABEL[emp.resignStatus ?? ''] ?? 'Left'} · {formatDate(emp.resignedAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (emp.employmentStatus === 'Freelance') { setEditingFreelance(emp); setFreelanceModal(true) }
                          else openEdit(emp)
                        }}
                        aria-label={`Edit ${emp.fullName}`}
                        className="size-7 text-muted-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => doDelete(emp)} aria-label={`Delete ${emp.fullName}`}
                        className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="size-3.5" />
                      </Button>
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
              <SelectTrigger className="h-7 w-16 text-xs" aria-label="Rows per page">
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="size-6"
              title="First page"
              aria-label="First page"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="size-6"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="text-xs px-1">Page {safePage + 1} / {totalPages}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="size-6"
              aria-label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="size-6"
              title="Last page"
              aria-label="Last page"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={false} onInteractOutside={e => e.preventDefault()}>
          <div className="px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)' }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary-foreground/20 rounded-xl">
                  <IdCard className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <DialogTitle className="font-bold text-primary-foreground text-lg leading-tight">{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
                  <DialogDescription className="text-primary-foreground/80 text-xs mt-0.5">{editing ? 'Update this employee’s details' : 'Add a new employee to the master data'}</DialogDescription>
                </div>
              </div>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" aria-label="Close" className="size-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/20">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 pt-4 border-b bg-muted/30">
            {([
              { value: 'details', label: 'Details' },
              { value: 'contact', label: 'Contact Info' },
              { value: 'bank', label: 'Bank & Tax' },
              { value: 'salary', label: 'Salary' },
              { value: 'documents', label: 'Documents' },
              { value: 'assets', label: 'Company Assets' },
            ] as const).map(t => (
              <button key={t.value} type="button" onClick={() => setModalTab(t.value)}
                className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  modalTab === t.value ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
              </div>
            )}

            {modalTab === 'details' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-full-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Full Name <span className="text-destructive normal-case">*</span>
                </Label>
                <Input
                  id="emp-full-name"
                  value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-nick-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nickname</Label>
                <Input
                  id="emp-nick-name"
                  value={form.nickName} onChange={e => setForm(f => ({ ...f, nickName: e.target.value }))}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-employee-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee Number</Label>
                <Input
                  id="emp-employee-number"
                  placeholder="Generated if blank"
                  value={form.employeeNumber} onChange={e => setForm(f => ({ ...f, employeeNumber: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-legal-entity-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Legal Entity</Label>
                <NativeSelect
                  id="emp-legal-entity-id"
                  value={form.legalEntityId} onChange={e => setForm(f => ({ ...f, legalEntityId: e.target.value }))}
                >
                  <option value="">—</option>
                  {legalEntities.map(le => <option key={le.id} value={le.id}>{le.name}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-business-unit-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Unit</Label>
                <NativeSelect
                  id="emp-business-unit-id"
                  value={form.businessUnitId} onChange={e => setForm(f => ({ ...f, businessUnitId: e.target.value }))}
                >
                  <option value="">—</option>
                  {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-location-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Location</Label>
                <NativeSelect
                  id="emp-location-id"
                  value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}
                >
                  <option value="">—</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-department" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department</Label>
                <NativeSelect
                  id="emp-department"
                  value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                >
                  <option value="">—</option>
                  {withCurrent(DEPARTMENTS, form.department).map(d => <option key={d} value={d}>{d}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-role-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role / Position</Label>
                <NativeSelect
                  id="emp-role-id"
                  value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}
                >
                  <option value="">—</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-level" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level</Label>
                <NativeSelect
                  id="emp-level"
                  value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </NativeSelect>
                <p className="text-[11px] text-muted-foreground">Skill tier within the role — compared against the approved salary range on Roles &amp; Compensation.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-employment-status" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment Status</Label>
                <NativeSelect
                  id="emp-employment-status"
                  value={form.employmentStatus} onChange={e => setForm(f => ({ ...f, employmentStatus: e.target.value }))}
                >
                  <option value="">—</option>
                  {withCurrent(EMPLOYMENT_STATUSES, form.employmentStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-gender" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gender</Label>
                <NativeSelect
                  id="emp-gender"
                  value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                >
                  <option value="">—</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-join-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Join Date</Label>
                <Input
                  id="emp-join-date"
                  type="date"
                  value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-leave-balance" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leave Balance (days)</Label>
                <Input
                  id="emp-leave-balance"
                  type="number"
                  placeholder="e.g. 12"
                  value={form.leaveBalance} onChange={e => setForm(f => ({ ...f, leaveBalance: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-contract-start-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Start</Label>
                <Input
                  id="emp-contract-start-date"
                  type="date"
                  value={form.contractStartDate} onChange={e => setForm(f => ({ ...f, contractStartDate: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-contract-end-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract End</Label>
                <Input
                  id="emp-contract-end-date"
                  type="date"
                  placeholder="Leave blank for permanent staff"
                  value={form.contractEndDate} onChange={e => setForm(f => ({ ...f, contractEndDate: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-leave-entitlement-policy" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leave Entitlement</Label>
                <NativeSelect
                  id="emp-leave-entitlement-policy"
                  value={form.leaveEntitlementPolicy} onChange={e => setForm(f => ({ ...f, leaveEntitlementPolicy: e.target.value }))}
                >
                  <option value="">—</option>
                  {withCurrent(LEAVE_ENTITLEMENT_POLICIES, form.leaveEntitlementPolicy).map(p => <option key={p} value={p}>{LEAVE_POLICY_LABEL[p] ?? p}</option>)}
                </NativeSelect>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-manager-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reports To (Manager)</Label>
                <ManagerCombobox
                  id="emp-manager-id"
                  value={form.managerId}
                  options={employees.filter(e => e.isActive && e.id !== editing?.id)}
                  onChange={id => setForm(f => ({ ...f, managerId: id }))}
                />
                <p className="text-[11px] text-muted-foreground">Drives who approves this employee&apos;s purchase requests.</p>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-user-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Linked Login Account</Label>
                <UserCombobox
                  id="emp-user-id"
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
                <Label htmlFor="emp-phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Input
                    id="emp-phone"
                    className="pl-10"
                    placeholder="e.g. 0812-3456-7890"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-personal-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Personal Email</Label>
                <Input
                  id="emp-personal-email"
                  placeholder="personal@email.com"
                  value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-birth-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Birth Date</Label>
                <div className="relative">
                  <Cake className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Input
                    id="emp-birth-date"
                    type="date"
                    className="pl-10"
                    value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-place-of-birth" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Place of Birth</Label>
                <Input
                  id="emp-place-of-birth"
                  value={form.placeOfBirth} onChange={e => setForm(f => ({ ...f, placeOfBirth: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-nik-passport" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">NIK / Passport</Label>
                <Input
                  id="emp-nik-passport"
                  value={form.nikPassport} onChange={e => setForm(f => ({ ...f, nikPassport: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-nationality" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nationality</Label>
                <Input
                  id="emp-nationality"
                  placeholder="e.g. Indonesia"
                  value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-religion" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Religion</Label>
                <Input
                  id="emp-religion"
                  value={form.religion} onChange={e => setForm(f => ({ ...f, religion: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-marital-status" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marital Status (PTKP)</Label>
                <NativeSelect
                  id="emp-marital-status"
                  value={form.maritalStatus} onChange={e => setForm(f => ({ ...f, maritalStatus: e.target.value }))}
                >
                  <option value="">—</option>
                  {withCurrent(MARITAL_STATUSES, form.maritalStatus).map(m => <option key={m} value={m}>{m}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-mother-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mother&apos;s Name</Label>
                <Input
                  id="emp-mother-name"
                  value={form.motherName} onChange={e => setForm(f => ({ ...f, motherName: e.target.value }))}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-address" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address 1 (as per ID)</Label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Textarea
                    id="emp-address"
                    className="pl-10 resize-none"
                    placeholder="Full address as per KTP"
                    rows={2}
                    value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="emp-address-current" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address 2 (current, if different)</Label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Textarea
                    id="emp-address-current"
                    className="pl-10 resize-none"
                    placeholder="Current address, if different from KTP"
                    rows={2}
                    value={form.addressCurrent} onChange={e => setForm(f => ({ ...f, addressCurrent: e.target.value }))}
                  />
                </div>
              </div>

              <div className="col-span-2 border-t border-dashed pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Emergency Contact</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="emp-emergency-contact-name" className="text-xs font-normal text-muted-foreground">Name</Label>
                    <Input
                      id="emp-emergency-contact-name"
                      value={form.emergencyContactName} onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="emp-emergency-contact-phone" className="text-xs font-normal text-muted-foreground">Phone No.</Label>
                    <Input
                      id="emp-emergency-contact-phone"
                      value={form.emergencyContactPhone} onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="emp-emergency-contact-relation" className="text-xs font-normal text-muted-foreground">Relation</Label>
                    <Input
                      id="emp-emergency-contact-relation"
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
                <Label htmlFor="emp-npwp" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">NPWP</Label>
                <Input
                  id="emp-npwp"
                  value={form.npwp} onChange={e => setForm(f => ({ ...f, npwp: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-kk-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Family Card (KK) No.</Label>
                <Input
                  id="emp-kk-number"
                  value={form.kkNumber} onChange={e => setForm(f => ({ ...f, kkNumber: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-bpjs-kesehatan-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BPJS Kesehatan No.</Label>
                <Input
                  id="emp-bpjs-kesehatan-number"
                  value={form.bpjsKesehatanNumber} onChange={e => setForm(f => ({ ...f, bpjsKesehatanNumber: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-bpjs-tk-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BPJS Ketenagakerjaan No.</Label>
                <Input
                  id="emp-bpjs-tk-number"
                  value={form.bpjsTkNumber} onChange={e => setForm(f => ({ ...f, bpjsTkNumber: e.target.value }))}
                />
              </div>

              <div className="col-span-2 border-t border-dashed pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bank Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="emp-bank-name" className="text-xs font-normal text-muted-foreground">Bank Name</Label>
                    <Input
                      id="emp-bank-name"
                      placeholder="e.g. Bank Mandiri"
                      value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="emp-bank-account-number" className="text-xs font-normal text-muted-foreground">Account No.</Label>
                    <Input
                      id="emp-bank-account-number"
                      value={form.bankAccountNumber} onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="emp-bank-account-name" className="text-xs font-normal text-muted-foreground">Account Holder Name</Label>
                    <Input
                      id="emp-bank-account-name"
                      value={form.bankAccountName} onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
            )}

            {modalTab === 'salary' && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <PrivateDataRevealButton revealed={privateGate.revealed} onReveal={privateGate.requestReveal} onHide={privateGate.hide} label="Show Amounts" />
              </div>

              {!privateGate.revealed ? (
                <div className="border-2 border-dashed rounded-xl py-12 text-center text-sm text-muted-foreground">
                  Salary figures are hidden. Click &quot;Show Amounts&quot; and enter your password to view &amp; edit.
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic Salary</span>
                    <RupiahInput value={form.basicSalary} onChange={digits => setForm(f => ({ ...f, basicSalary: digits }))} />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Allowance</span>
                    <RupiahInput value={form.allowance} onChange={digits => setForm(f => ({ ...f, allowance: digits }))} />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uang Layar (base rate)</span>
                    <RupiahInput value={form.uangLayar} onChange={digits => setForm(f => ({ ...f, uangLayar: digits }))} />
                  </label>
                  <p className="text-[11px] text-muted-foreground">For crew stationed on a yacht (Work Location = yacht name), Payroll multiplies this by that yacht&apos;s trip days each period. Shore-based staff get this flat.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meal Allowance (per day)</span>
                    <RupiahInput value={form.uangMakan} onChange={digits => setForm(f => ({ ...f, uangMakan: digits }))} />
                  </label>
                  <p className="text-[11px] text-muted-foreground">Daily rate — Payroll multiplies this by days actually present (from Attendance Recap) each period.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">THR</span>
                    <RupiahInput value={form.thr} onChange={digits => setForm(f => ({ ...f, thr: digits }))} />
                  </label>
                  <p className="text-[11px] text-muted-foreground">Pre-fills the payslip&apos;s THR line at generation — still editable per period.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p id="emp-other-income-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other Income</p>
                <div className="space-y-2" role="group" aria-labelledby="emp-other-income-label">
                  {form.otherIncome.map(item => (
                    <div key={item.id} className="flex items-start gap-2 border-2 border-border rounded-xl p-2.5">
                      <div className="flex-1 space-y-1 min-w-0">
                        <Input value={item.name} onChange={e => updateOtherIncomeRow(item.id, { name: e.target.value })} placeholder="Name"
                          aria-label="Income name" className="h-8 font-medium" />
                        <Input value={item.description} onChange={e => updateOtherIncomeRow(item.id, { description: e.target.value })} placeholder="Description (optional)"
                          aria-label="Income description" className="h-8 text-muted-foreground" />
                      </div>
                      <label className="w-32 shrink-0">
                        <span className="sr-only">Amount</span>
                        <RupiahInput value={String(item.amount)} onChange={digits => updateOtherIncomeRow(item.id, { amount: Number(digits) || 0 })} />
                      </label>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeOtherIncomeRow(item.id)} aria-label="Remove income"
                        className="size-7 text-muted-foreground hover:text-destructive shrink-0">
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={addOtherIncomeRow}
                    className="w-full gap-1.5 border-2 border-dashed rounded-xl text-muted-foreground shadow-none hover:border-primary hover:text-foreground">
                    <Plus className="size-3.5" /> Add Other Income
                  </Button>
                </div>
              </div>
              </>
              )}
              {privateGate.dialog}
            </div>
            )}

            {modalTab === 'documents' && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <PrivateDataRevealButton revealed={privateGate.revealed} onReveal={privateGate.requestReveal} onHide={privateGate.hide} label="Show Documents" />
              </div>

              {!privateGate.revealed ? (
                <div className="border-2 border-dashed rounded-xl py-12 text-center text-sm text-muted-foreground">
                  Documents are hidden. Click &quot;Show Documents&quot; and enter your password to view &amp; upload.
                </div>
              ) : (
              <>
              <div className="space-y-1.5" role="group" aria-labelledby="emp-seaman-book-files-label">
                <p id="emp-seaman-book-files-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seaman Book</p>
                <MultiFilePicker files={form.seamanBookFiles} onChange={files => setForm(f => ({ ...f, seamanBookFiles: files }))} />
              </div>
              <div className="space-y-1.5" role="group" aria-labelledby="emp-bst-files-label">
                <p id="emp-bst-files-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BST (Basic Safety Training)</p>
                <MultiFilePicker files={form.bstFiles} onChange={files => setForm(f => ({ ...f, bstFiles: files }))} />
              </div>
              <div className="space-y-1.5" role="group" aria-labelledby="emp-medical-checkup-files-label">
                <p id="emp-medical-checkup-files-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medical Check Up</p>
                <MultiFilePicker files={form.medicalCheckupFiles} onChange={files => setForm(f => ({ ...f, medicalCheckupFiles: files }))} />
              </div>
              <div className="space-y-1.5" role="group" aria-labelledby="emp-ijazah-files-label">
                <p id="emp-ijazah-files-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diploma</p>
                <MultiFilePicker files={form.ijazahFiles} onChange={files => setForm(f => ({ ...f, ijazahFiles: files }))} />
              </div>
              <div className="space-y-1.5" role="group" aria-labelledby="emp-certificate-files-label">
                <p id="emp-certificate-files-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Certificates</p>
                <MultiFilePicker files={form.certificateFiles} onChange={files => setForm(f => ({ ...f, certificateFiles: files }))} />
              </div>
              <div className="space-y-1.5" role="group" aria-labelledby="emp-contract-files-label">
                <p id="emp-contract-files-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract</p>
                <MultiFilePicker files={form.contractFiles} onChange={files => setForm(f => ({ ...f, contractFiles: files }))} />
                <p className="text-[11px] text-muted-foreground">Expiry is the Contract End date (Details tab, optional) — shows on HR Overview&apos;s Contracts Expiring Soon list.</p>
              </div>
              </>
              )}
              {privateGate.dialog}
            </div>
            )}

            {modalTab === 'assets' && (
              editing ? <CompanyAssetsTab employeeId={editing.id} /> : (
                <div className="text-sm text-muted-foreground text-center py-8">Save this employee first, then come back to record the company items assigned to them.</div>
              )
            )}
          </div>

          <DialogFooter className="sm:justify-between px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Employee Detail (read-only) ── */}
      {detailEmployee && (
        <EmployeeDetailModal
          employee={detailEmployee}
          leaveRequests={leaveRequests.filter(r => r.employee.id === detailEmployee.id)}
          performanceReviews={performanceReviews.filter(r => r.employee.id === detailEmployee.id)}
          compensationBand={compensationBands.find(b => b.roleId === detailEmployee.role?.id && b.level === detailEmployee.level) ?? null}
          tab={detailTab}
          onTabChange={setDetailTab}
          onClose={() => setDetailEmployee(null)}
          onEdit={() => {
            const emp = detailEmployee
            setDetailEmployee(null)
            if (emp.employmentStatus === 'Freelance') { setEditingFreelance(emp); setFreelanceModal(true) }
            else openEdit(emp)
          }}
        />
      )}

      {freelanceModal && (
        <AddFreelanceModal
          key={editingFreelance?.id ?? 'new'}
          editing={editingFreelance as FreelanceEmployee | null}
          employees={employees}
          onClose={() => { setFreelanceModal(false); setEditingFreelance(null) }}
          onSaved={() => { setFreelanceModal(false); setEditingFreelance(null); load() }}
        />
      )}

      {/* ── Deactivate / Resignation Modal ── */}
      <Dialog open={!!deactivateTarget} onOpenChange={o => { if (!o) setDeactivateTarget(null) }}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" showCloseButton={false} onInteractOutside={e => e.preventDefault()}>
          {deactivateTarget && (<>
            <DialogHeader className="flex-row items-center gap-3 px-6 py-5 border-b text-left">
              <div className="p-2 rounded-full bg-destructive/10 shrink-0">
                <UserX className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle className="font-semibold text-base leading-tight">Deactivate Employee</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">{deactivateTarget.fullName}</span> ({deactivateTarget.employeeNumber})
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">Is this employee resigning? Record the details below.</p>

              <div className="space-y-1.5">
                <Label htmlFor="emp-resign-status" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
                <NativeSelect
                  id="emp-resign-status"
                  value={resignForm.resignStatus} onChange={e => setResignForm(f => ({ ...f, resignStatus: e.target.value }))}
                >
                  {RESIGN_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-resigned-at" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resignation Date</Label>
                <Input
                  id="emp-resigned-at"
                  type="date"
                  value={resignForm.resignedAt} onChange={e => setResignForm(f => ({ ...f, resignedAt: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-resign-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</Label>
                <Textarea
                  id="emp-resign-reason"
                  className="resize-none"
                  rows={3}
                  placeholder="Optional notes on why this employee is leaving…"
                  value={resignForm.resignReason} onChange={e => setResignForm(f => ({ ...f, resignReason: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter className="gap-3 px-6 py-4 border-t bg-muted/20">
              <Button variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDeactivate} loading={deactivating}>
                {deactivating ? 'Deactivating…' : 'Deactivate'}
              </Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* ── Import Result Modal ── */}
      <Dialog open={!!importResult} onOpenChange={o => { if (!o) setImportResult(null) }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          {importResult && (<>
            <DialogHeader className="p-6 pr-12 border-b">
              <DialogTitle className="font-semibold text-lg">CSV Import Results</DialogTitle>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-center">
                  <p className="text-2xl font-bold text-success">{importResult.imported}</p>
                  <p className="text-xs text-success mt-0.5">New employees</p>
                </div>
                <div className="rounded-lg bg-info/10 border border-info/30 p-3 text-center">
                  <p className="text-2xl font-bold text-info">{importResult.updated}</p>
                  <p className="text-xs text-info mt-0.5">Updated</p>
                </div>
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{importResult.errors.length}</p>
                  <p className="text-xs text-destructive mt-0.5">Errors</p>
                </div>
              </div>

              {importResult.errors.length === 0 ? (
                <div className="flex items-center gap-2 text-success bg-success/10 rounded-lg px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">All {importResult.total} rows processed successfully</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-warning bg-warning/10 rounded-lg px-4 py-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p className="text-sm">{importResult.total} succeeded, {importResult.errors.length} rows failed:</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-sm">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 flex gap-3">
                        <span className="text-muted-foreground shrink-0">Row {e.row}</span>
                        <span className="font-mono text-xs shrink-0 text-warning">{e.sku}</span>
                        <span className="text-destructive text-xs">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30">
              <Button onClick={() => setImportResult(null)}>
                Done
              </Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface EmployeeAssetRow {
  id: string
  itemName: string
  category: string | null
  serialNumber: string | null
  condition: string | null
  assignedDate: string
  notes: string | null
  photoUrl: string | null
  isReturned: boolean
  returnedAt: string | null
  returnCondition: string | null
  returnNotes: string | null
}

const ASSET_BLANK = { itemName: '', category: '', serialNumber: '', condition: '', assignedDate: todayISO(), notes: '', photoUrl: null as string | null }

// Company-owned items handed to one employee — feeds the return checklist on the
// Separation menu (see SeparationPage) if this employee ever resigns.
function CompanyAssetsTab({ employeeId }: { employeeId: string }) {
  const [assets, setAssets] = useState<EmployeeAssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(ASSET_BLANK)
  const [saving, setSaving] = useState(false)

  const processAssetPhoto = (file: File) => {
    const canvas = document.createElement('canvas')
    const img = new window.Image()
    img.onload = () => {
      const MAX = 800
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      canvas.width = img.width * scale; canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      setForm(f => ({ ...f, photoUrl: canvas.toDataURL('image/jpeg', 0.8) }))
    }
    img.src = URL.createObjectURL(file)
  }
  const { isDragging: isDraggingAssetPhoto, dropProps: assetPhotoDropProps } = useFileDrop(files => { if (files[0]) processAssetPhoto(files[0]) })

  const load = useCallback(() => {
    fetch(`/api/hr/employees/${employeeId}/assets`).then(r => r.ok ? r.json() : []).then(setAssets).finally(() => setLoading(false))
  }, [employeeId])

  useEffect(() => { load() }, [load])

  async function addAsset() {
    if (!form.itemName.trim()) return
    setSaving(true)
    await fetch(`/api/hr/employees/${employeeId}/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setForm(ASSET_BLANK); setAdding(false); setSaving(false)
    load()
  }

  async function toggleReturned(asset: EmployeeAssetRow) {
    await fetch(`/api/hr/employees/${employeeId}/assets/${asset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isReturned: !asset.isReturned }) })
    load()
  }

  async function removeAsset(id: string) {
    await fetch(`/api/hr/employees/${employeeId}/assets/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Company-owned items handed to this employee (laptop, phone, uniform, ID card, tools, ...). These feed the return checklist on the Separation menu if this employee ever resigns.
      </p>

      {assets.length === 0 && !adding && (
        <div className="text-sm text-muted-foreground text-center py-6 border-2 border-dashed rounded-xl">No company assets recorded yet.</div>
      )}

      <div className="space-y-2">
        {assets.map(a => (
          <div key={a.id} className={`border-2 rounded-xl p-3 flex items-start gap-3 ${a.isReturned ? 'border-success/30 bg-success/5' : 'border-border'}`}>
            <button type="button" onClick={() => toggleReturned(a)} title={a.isReturned ? 'Mark as not returned' : 'Mark as returned'} aria-label={a.isReturned ? 'Mark as not returned' : 'Mark as returned'} className="mt-0.5 shrink-0">
              {a.isReturned ? <ToggleRight className="h-6 w-6 text-success" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
            </button>
            {a.photoUrl ? (
              <img src={a.photoUrl} alt={a.itemName} className="w-12 h-12 rounded-lg object-cover border shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg border-2 border-dashed border-muted flex items-center justify-center text-muted-foreground shrink-0">
                <ImageIcon className="h-4 w-4 opacity-40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{a.itemName}</span>
                {a.category && <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{a.category}</span>}
                {a.isReturned && <span className="text-[10px] font-semibold text-success">Returned</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {a.serialNumber && <>S/N {a.serialNumber} · </>}
                Assigned {formatDate(a.assignedDate)}
                {a.condition && <> · Condition: {a.condition}</>}
              </div>
              {a.notes && <div className="text-xs text-muted-foreground mt-0.5">{a.notes}</div>}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeAsset(a.id)} aria-label={`Remove ${a.itemName}`}
              className="size-6 text-muted-foreground hover:text-destructive shrink-0">
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="border-2 border-border rounded-xl p-3 space-y-2">
          <div {...assetPhotoDropProps} className={`flex items-center gap-3 rounded-lg p-1.5 -m-1.5 transition-colors ${isDraggingAssetPhoto ? 'ring-2 ring-primary bg-primary/10' : ''}`}>
            {form.photoUrl ? (
              <div className="relative shrink-0">
                <img src={form.photoUrl} alt="Asset" className="w-16 h-16 rounded-lg object-cover border" />
                <button type="button" onClick={() => setForm(f => ({ ...f, photoUrl: null }))} aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs">×</button>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-lg border-2 border-dashed border-muted flex items-center justify-center text-muted-foreground shrink-0">
                <ImageIcon className="h-5 w-5 opacity-40" />
              </div>
            )}
            <label className="cursor-pointer flex-1">
              <div className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                <Upload className="h-4 w-4" />
                <span>{isDraggingAssetPhoto ? 'Drop to upload' : form.photoUrl ? 'Change photo' : 'Upload or drag photo'}</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                processAssetPhoto(file)
                e.target.value = ''
              }} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Item name" placeholder="Item name *" value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} autoFocus />
            <Input aria-label="Category" placeholder="Category (e.g. Laptop)" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            <Input aria-label="Serial number" placeholder="Serial number" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
            <Input aria-label="Condition" placeholder="Condition (e.g. New)" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} />
            <Input aria-label="Assigned date" type="date" value={form.assignedDate} onChange={e => setForm(f => ({ ...f, assignedDate: e.target.value }))} />
          </div>
          <Textarea aria-label="Notes" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(false); setForm(ASSET_BLANK) }}>Cancel</Button>
            <Button type="button" size="sm" onClick={addAsset} disabled={!form.itemName.trim()} loading={saving}>
              {saving ? 'Adding…' : 'Add Item'}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}
          className="w-full gap-1.5 border-2 border-dashed rounded-xl text-muted-foreground shadow-none hover:border-primary hover:text-foreground">
          <Plus className="size-3.5" /> Add Company Asset
        </Button>
      )}
    </div>
  )
}
