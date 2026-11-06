'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Copy, Mail, KeyRound, CalendarPlus, Ban, CheckCircle2, Undo2, UserCheck, Trash2, ClipboardCheck,
  Download, FileText, Anchor, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { MultiFilePicker } from '@/components/ui/file-preview'
import { usePasswordGate } from '@/components/ui/password-gate'
import { formatDate } from '@/lib/format'
import { downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'
import {
  DEFAULT_PROBATION_MONTHS, ONBOARDING_DOCS, ONBOARDING_SECTIONS, ONBOARDING_STATUS_LABEL, isDocVisible, isFieldVisible,
  missingOnboardingFields, type OnboardingDocField, type OnboardingFormType, type OnboardingStatus, type OnboardingTextField,
} from '@/lib/onboarding-fields'
import { DEPARTMENTS } from './EmployeesPage'

interface Option { id: string; name: string }
interface Lookups {
  roles: { id: string; title: string }[]
  locations: { id: string; name: string; isYacht: boolean }[]
  legalEntities: Option[]
  businessUnits: Option[]
  managers: { id: string; fullName: string }[]
}

interface OnboardingRow {
  id: string
  token: string
  status: OnboardingStatus
  formType: OnboardingFormType
  isCrew: boolean
  fullName: string
  inviteEmail: string | null
  phone: string | null
  department: string | null
  joinDate: string | null
  probationEndDate: string | null
  expiresAt: string
  pinLockedUntil: string | null
  submittedAt: string | null
  revisionNote: string | null
  createdAt: string
  role: { id: string; title: string } | null
  location: { id: string; name: string } | null
  candidate: { id: string; fullName: string; status: string } | null
  employee: { id: string; employeeNumber: string; fullName: string } | null
}

type OnboardingDetail = OnboardingRow & Record<OnboardingTextField, string | null> & Record<OnboardingDocField, string[]> & {
  roleId: string | null; locationId: string | null; legalEntityId: string | null; businessUnitId: string | null; managerId: string | null
  basicSalary: number | null; allowance: number | null; freelanceFee: number | null; freelanceFeeType: string | null
  approvedAt: string | null; probationStartedAt: string | null; lastSavedAt: string | null
}

export interface ShareInfo { fullName: string; link: string; pin?: string; email?: { ok: boolean; error?: string } | null }

export const STATUS_TONE: Record<OnboardingStatus, StatusTone> = {
  INVITED: 'info',
  SUBMITTED: 'warning',
  REVISION_REQUESTED: 'pink',
  APPROVED: 'primary',
  PROBATION_STARTED: 'success',
  CANCELLED: 'neutral',
}
const STATUSES = Object.keys(ONBOARDING_STATUS_LABEL) as OnboardingStatus[]
const labelCls = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide'

const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '')
function addMonthsISO(date: string, months: number) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  d.setDate(1); d.setMonth(d.getMonth() + months)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return d.toISOString().slice(0, 10)
}
const isExpired = (r: { expiresAt: string }) => new Date(r.expiresAt).getTime() < Date.now()

function useLookups(enabled: boolean) {
  const [lookups, setLookups] = useState<Lookups | null>(null)
  useEffect(() => {
    if (!enabled || lookups) return
    fetch('/api/hr/onboarding/lookups').then(r => (r.ok ? r.json() : null)).then(setLookups).catch(() => {})
  }, [enabled, lookups])
  return lookups
}

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`) } catch { toast.error('Could not copy — select and copy it manually') }
}

// ── Link + PIN hand-off (after create / Reset PIN) ───────────────────────────
export function ShareDialog({ info, onClose }: { info: ShareInfo | null; onClose: () => void }) {
  return (
    <Dialog open={!!info} onOpenChange={o => { if (!o) onClose() }}>
      {info && (
        <DialogContent className="sm:max-w-md" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Onboarding link for {info.fullName}</DialogTitle>
            <DialogDescription>Send the link and the PIN through different channels (e.g. link by email, PIN by WhatsApp or phone).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className={labelCls}>Link</p>
              <div className="flex gap-2">
                <Input readOnly value={info.link} onFocus={e => e.currentTarget.select()} aria-label="Onboarding link" />
                <Button variant="outline" size="icon" onClick={() => copy(info.link, 'Link')} aria-label="Copy link"><Copy /></Button>
              </div>
              {info.email && (
                info.email.ok
                  ? <p className="text-xs text-success">Link emailed to the joiner.</p>
                  : <p className="text-xs text-destructive">Email not sent: {info.email.error}</p>
              )}
            </div>
            {info.pin && (
              <div className="space-y-1.5">
                <p className={labelCls}>PIN</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-center font-mono text-3xl font-bold tracking-[0.4em] rounded-lg border bg-muted/40 py-2.5">{info.pin}</span>
                  <Button variant="outline" size="icon" onClick={() => copy(info.pin!, 'PIN')} aria-label="Copy PIN"><Copy /></Button>
                </div>
                <p className="text-xs text-warning">This PIN is shown only once. If it gets lost, use Reset PIN.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

// ── Create ───────────────────────────────────────────────────────────────────
export interface CandidatePrefill {
  id: string; fullName: string; email: string | null; phone: string | null
  appliedRoleId: string | null; readyJoinDate: string | null
}

const CREATE_BLANK = {
  fullName: '', inviteEmail: '', phone: '', formType: 'STANDARD' as OnboardingFormType,
  roleId: '', department: '', locationId: '', managerId: '', joinDate: '', isCrew: false, sendEmail: true,
}

export function CreateOnboardingDialog({ open, candidate, onClose, onCreated }: {
  open: boolean
  candidate?: CandidatePrefill | null
  onClose: () => void
  onCreated: (share: ShareInfo) => void
}) {
  const lookups = useLookups(open)
  const [form, setForm] = useState(CREATE_BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm({
      ...CREATE_BLANK,
      ...(candidate && {
        fullName: candidate.fullName, inviteEmail: candidate.email ?? '', phone: candidate.phone ?? '',
        roleId: candidate.appliedRoleId ?? '', joinDate: toDateInput(candidate.readyJoinDate),
      }),
    })
  }, [open, candidate])

  function pickLocation(id: string) {
    const loc = lookups?.locations.find(l => l.id === id)
    setForm(f => ({ ...f, locationId: id, isCrew: loc ? loc.isYacht : f.isCrew }))
  }

  async function submit() {
    if (!form.fullName.trim()) { setError('Full name is required'); return }
    if (form.sendEmail && !form.inviteEmail.trim()) { setError('Enter an email to send the link to, or untick "Email the link"'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/hr/onboarding', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, candidateId: candidate?.id }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to create onboarding form'); return }
    onCreated({ fullName: data.form.fullName, link: data.link, pin: data.pin, email: data.email })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader className="px-6 py-4 pr-12 border-b text-left">
          <DialogTitle className="text-sm font-bold">New Onboarding Form</DialogTitle>
          <DialogDescription className="text-xs">
            {candidate ? `From candidate ${candidate.fullName}. ` : ''}The joiner fills in their personal data and documents; you&apos;ll get a link and a PIN to send them.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {error && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="onb-new-name" className={labelCls}>Full Name *</Label>
            <Input id="onb-new-name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="onb-new-email" className={labelCls}>Email</Label>
              <Input id="onb-new-email" type="email" value={form.inviteEmail} onChange={e => setForm(f => ({ ...f, inviteEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onb-new-phone" className={labelCls}>Phone</Label>
              <Input id="onb-new-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className={labelCls}>Form Type</p>
            <div className="grid grid-cols-2 gap-2">
              {(['STANDARD', 'FREELANCE'] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, formType: t }))} aria-pressed={form.formType === t}
                  className={`text-left border rounded-lg px-3 py-2 transition-colors ${form.formType === t ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}>
                  <p className="text-sm font-semibold">{t === 'STANDARD' ? 'Employee' : 'Freelance'}</p>
                  <p className="text-[11px] text-muted-foreground">{t === 'STANDARD' ? `Full form · starts ${DEFAULT_PROBATION_MONTHS}-month probation` : 'Short form · no BPJS/KK/NPWP'}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="onb-new-role" className={labelCls}>Position</Label>
              <SearchableSelect id="onb-new-role" value={form.roleId} onChange={v => setForm(f => ({ ...f, roleId: v }))}
                options={(lookups?.roles ?? []).map(r => ({ value: r.id, label: r.title }))} placeholder="Select position…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onb-new-dept" className={labelCls}>Department</Label>
              <NativeSelect id="onb-new-dept" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">—</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onb-new-loc" className={labelCls}>Work Location</Label>
              <NativeSelect id="onb-new-loc" value={form.locationId} onChange={e => pickLocation(e.target.value)}>
                <option value="">—</option>
                {lookups?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onb-new-join" className={labelCls}>Join Date</Label>
              <Input id="onb-new-join" type="date" value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onb-new-manager" className={labelCls}>Reports To</Label>
            <SearchableSelect id="onb-new-manager" value={form.managerId} onChange={v => setForm(f => ({ ...f, managerId: v }))}
              options={(lookups?.managers ?? []).map(m => ({ value: m.id, label: m.fullName }))} placeholder={candidate ? 'From recruitment request, if any' : 'Select manager…'} />
          </div>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Checkbox checked={form.isCrew} onCheckedChange={v => setForm(f => ({ ...f, isCrew: v === true }))} className="mt-0.5" />
            <span><span className="font-medium">Crew</span><span className="block text-xs text-muted-foreground">Also asks for Seaman Book, BST and Medical Check Up. Ticked automatically for yacht locations.</span></span>
          </label>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Checkbox checked={form.sendEmail} onCheckedChange={v => setForm(f => ({ ...f, sendEmail: v === true }))} className="mt-0.5" />
            <span><span className="font-medium">Email the link</span><span className="block text-xs text-muted-foreground">The PIN is never emailed — you&apos;ll see it on the next screen.</span></span>
          </label>
        </div>
        <DialogFooter className="px-6 py-4 border-t bg-muted/50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create & Get Link'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Detail / review ──────────────────────────────────────────────────────────
type DetailTab = 'review' | 'employment' | 'documents'

function DetailDialog({ id, onClose, onChanged, onShare }: {
  id: string | null
  onClose: () => void
  onChanged: () => void
  onShare: (s: ShareInfo) => void
}) {
  const confirm = useConfirm()
  const lookups = useLookups(!!id)
  const gate = usePasswordGate()
  const [detail, setDetail] = useState<OnboardingDetail | null>(null)
  const [edit, setEdit] = useState<Record<string, unknown>>({})
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<DetailTab>('review')
  const [busy, setBusy] = useState<string | null>(null)
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')

  const apply = useCallback((d: OnboardingDetail) => {
    setDetail(d)
    setEdit({
      ...Object.fromEntries(ONBOARDING_SECTIONS.flatMap(s => s.fields).map(f => [f.key, f.type === 'date' ? toDateInput(d[f.key]) : (d[f.key] ?? '')])),
      ...Object.fromEntries(ONBOARDING_DOCS.map(doc => [doc.key, d[doc.key] ?? []])),
      formType: d.formType, isCrew: d.isCrew, inviteEmail: d.inviteEmail ?? '',
      roleId: d.roleId ?? '', department: d.department ?? '', locationId: d.locationId ?? '',
      legalEntityId: d.legalEntityId ?? '', businessUnitId: d.businessUnitId ?? '', managerId: d.managerId ?? '',
      joinDate: toDateInput(d.joinDate), probationEndDate: toDateInput(d.probationEndDate),
      basicSalary: d.basicSalary != null ? String(d.basicSalary) : '', allowance: d.allowance != null ? String(d.allowance) : '',
      freelanceFee: d.freelanceFee != null ? String(d.freelanceFee) : '', freelanceFeeType: d.freelanceFeeType ?? '',
    })
    setDirty(false)
  }, [])

  useEffect(() => {
    setDetail(null)
    if (!id) return
    setTab('review'); gate.hide()
    fetch(`/api/hr/onboarding/${id}`).then(r => (r.ok ? r.json() : null)).then(d => { if (d) apply(d) })
  }, [id, apply])

  if (!id) return null
  const closed = detail?.status === 'PROBATION_STARTED' || detail?.status === 'CANCELLED'
  const set = (k: string, v: unknown) => { setEdit(e => ({ ...e, [k]: v })); setDirty(true) }
  const val = (k: string) => (edit[k] as string) ?? ''

  async function save(silent = false): Promise<boolean> {
    if (!detail) return false
    setBusy('save')
    const res = await fetch(`/api/hr/onboarding/${detail.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return false }
    apply(data); onChanged()
    if (!silent) toast.success('Saved')
    return true
  }

  async function action(name: string, extra: Record<string, unknown> = {}) {
    if (!detail) return null
    if (dirty && !(await save(true))) return null
    setBusy(name)
    const res = await fetch(`/api/hr/onboarding/${detail.id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, ...extra }) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data.error ?? 'Action failed'); return null }
    if (data.form) apply(data.form)
    onChanged()
    return data as { form: OnboardingDetail; link: string; pin?: string; email?: { ok: boolean; error?: string } | null }
  }

  async function startProbation() {
    if (!detail) return
    if (!val('joinDate')) { toast.error('Set the join date first (Employment tab)'); setTab('employment'); return }
    if (!val('roleId')) { toast.error('Set the position first (Employment tab)'); setTab('employment'); return }
    const freelance = val('formType') === 'FREELANCE'
    const ok = await confirm({
      title: 'Start Probation?',
      description: <>
        <span className="font-medium text-foreground">{detail.fullName}</span> will be added to Employees as{' '}
        <b>{freelance ? 'Freelance' : 'Probation'}</b> from {formatDate(val('joinDate'))}
        {val('probationEndDate') ? <> until {formatDate(val('probationEndDate'))}</> : null}, with all their data and documents. The onboarding link stops working.
      </>,
      confirmLabel: 'Start Probation',
    })
    if (!ok) return
    if (dirty && !(await save(true))) return
    setBusy('start')
    const res = await fetch(`/api/hr/onboarding/${detail.id}/start-probation`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to start probation'); return }
    apply({ ...detail, ...data.form })
    onChanged()
    toast.success(`${detail.fullName} added to Employees (${data.employee.employeeNumber})`)
  }

  async function remove() {
    if (!detail) return
    const ok = await confirm({ title: 'Delete onboarding form?', description: <>The form for <span className="font-medium text-foreground">{detail.fullName}</span> and everything they uploaded will be deleted permanently.</>, confirmLabel: 'Delete', destructive: true })
    if (!ok) return
    const res = await fetch(`/api/hr/onboarding/${detail.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? 'Failed to delete'); return }
    onChanged(); onClose()
  }

  const ctx = detail ? { formType: val('formType') as OnboardingFormType, isCrew: edit.isCrew === true, nationality: val('nationality') } : null
  const docCounts = Object.fromEntries(ONBOARDING_DOCS.map(d => [d.key, ((edit[d.key] as string[]) ?? []).length]))
  const missing = detail && ctx ? missingOnboardingFields(edit as Record<OnboardingTextField, string>, docCounts, ctx) : []
  const freelance = val('formType') === 'FREELANCE'

  return (
    <>
      <Dialog open onOpenChange={o => { if (!o) onClose() }}>
        <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          {!detail ? (
            <div className="p-10 text-center text-sm text-muted-foreground"><DialogTitle className="sr-only">Loading</DialogTitle>Loading…</div>
          ) : (
            <>
              <DialogHeader className="px-6 pt-5 pb-4 pr-12 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-lg font-bold">{detail.fullName}</DialogTitle>
                  <StatusBadge tone={STATUS_TONE[detail.status]}>{ONBOARDING_STATUS_LABEL[detail.status]}</StatusBadge>
                  {detail.formType === 'FREELANCE' && <StatusBadge tone="purple">Freelance</StatusBadge>}
                  {detail.isCrew && <StatusBadge tone="cyan"><Anchor className="size-3" /> Crew</StatusBadge>}
                </div>
                <DialogDescription className="text-xs">
                  {detail.role?.title ?? 'No position'}{detail.location ? ` · ${detail.location.name}` : ''}
                  {detail.candidate ? ` · from candidate ${detail.candidate.fullName}` : ''}
                  {detail.submittedAt ? ` · submitted ${formatDate(detail.submittedAt)}` : detail.lastSavedAt ? ` · draft saved ${formatDate(detail.lastSavedAt)}` : ' · not opened yet'}
                </DialogDescription>
                {detail.status === 'PROBATION_STARTED' && detail.employee && (
                  <p className="text-xs text-success mt-1.5 flex items-center gap-1"><UserCheck className="size-3.5" /> Employee {detail.employee.employeeNumber} created — further changes go in Employees.</p>
                )}
                {detail.status === 'REVISION_REQUESTED' && detail.revisionNote && (
                  <p className="text-xs mt-1.5 rounded-md bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/30 px-2.5 py-1.5 whitespace-pre-wrap"><b>Revision asked:</b> {detail.revisionNote}</p>
                )}
                {(detail.status === 'INVITED' || detail.status === 'REVISION_REQUESTED') && (
                  <p className={`text-xs mt-1 ${isExpired(detail) ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Link {isExpired(detail) ? 'expired' : 'valid until'} {formatDate(detail.expiresAt)}
                    {detail.pinLockedUntil && new Date(detail.pinLockedUntil) > new Date() ? ' · locked after too many wrong PINs — Reset PIN to unlock' : ''}
                  </p>
                )}
              </DialogHeader>

              <div className="flex gap-1 px-6 border-b">
                {([['review', 'Joiner Data'], ['employment', 'Employment (HR)'], ['documents', 'Documents']] as const).map(([t, label]) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={`px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px ${tab === t ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-6 py-5 max-h-[58vh] overflow-y-auto space-y-6">
                {missing.length > 0 && detail.status !== 'INVITED' && !closed && (
                  <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">Still missing: {missing.join(', ')}</p>
                )}

                {tab === 'review' && ctx && ONBOARDING_SECTIONS.map(section => {
                  const fields = section.fields.filter(f => isFieldVisible(f, ctx))
                  if (!fields.length) return null
                  return (
                    <div key={section.title}>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">{section.title}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {fields.map(f => {
                          const fid = `onb-hr-${f.key}`
                          return (
                            <div key={f.key} className={`space-y-1 ${f.wide ? 'col-span-2' : ''}`}>
                              <Label htmlFor={fid} className="text-xs text-muted-foreground">{f.label}</Label>
                              {f.type === 'select' ? (
                                <NativeSelect id={fid} disabled={closed} value={val(f.key)} onChange={e => set(f.key, e.target.value)}>
                                  <option value="">—</option>
                                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </NativeSelect>
                              ) : f.type === 'textarea' ? (
                                <Textarea id={fid} rows={2} disabled={closed} value={val(f.key)} onChange={e => set(f.key, e.target.value)} />
                              ) : (
                                <Input id={fid} type={f.type === 'date' ? 'date' : 'text'} disabled={closed} value={val(f.key)} onChange={e => set(f.key, e.target.value)} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {tab === 'employment' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-type" className="text-xs text-muted-foreground">Form Type</Label>
                        <NativeSelect id="onb-hr-type" disabled={closed} value={val('formType')} onChange={e => set('formType', e.target.value)}>
                          <option value="STANDARD">Employee (Probation)</option>
                          <option value="FREELANCE">Freelance</option>
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-email" className="text-xs text-muted-foreground">Invite Email</Label>
                        <Input id="onb-hr-email" type="email" disabled={closed} value={val('inviteEmail')} onChange={e => set('inviteEmail', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-role" className="text-xs text-muted-foreground">Position *</Label>
                        <SearchableSelect id="onb-hr-role" disabled={closed} value={val('roleId')} onChange={v => set('roleId', v)}
                          options={(lookups?.roles ?? []).map(r => ({ value: r.id, label: r.title }))} placeholder="Select position…" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-dept" className="text-xs text-muted-foreground">Department</Label>
                        <NativeSelect id="onb-hr-dept" disabled={closed} value={val('department')} onChange={e => set('department', e.target.value)}>
                          <option value="">—</option>
                          {[...DEPARTMENTS, ...(val('department') && !DEPARTMENTS.includes(val('department')) ? [val('department')] : [])].map(d => <option key={d} value={d}>{d}</option>)}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-loc" className="text-xs text-muted-foreground">Work Location</Label>
                        <NativeSelect id="onb-hr-loc" disabled={closed} value={val('locationId')} onChange={e => {
                          const loc = lookups?.locations.find(l => l.id === e.target.value)
                          set('locationId', e.target.value); if (loc) set('isCrew', loc.isYacht)
                        }}>
                          <option value="">—</option>
                          {lookups?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-manager" className="text-xs text-muted-foreground">Reports To</Label>
                        <SearchableSelect id="onb-hr-manager" disabled={closed} value={val('managerId')} onChange={v => set('managerId', v)}
                          options={(lookups?.managers ?? []).map(m => ({ value: m.id, label: m.fullName }))} placeholder="Select manager…" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-le" className="text-xs text-muted-foreground">Legal Entity</Label>
                        <NativeSelect id="onb-hr-le" disabled={closed} value={val('legalEntityId')} onChange={e => set('legalEntityId', e.target.value)}>
                          <option value="">—</option>
                          {lookups?.legalEntities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-bu" className="text-xs text-muted-foreground">Business Unit</Label>
                        <NativeSelect id="onb-hr-bu" disabled={closed} value={val('businessUnitId')} onChange={e => set('businessUnitId', e.target.value)}>
                          <option value="">—</option>
                          {lookups?.businessUnits.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-join" className="text-xs text-muted-foreground">Join Date *</Label>
                        <Input id="onb-hr-join" type="date" disabled={closed} value={val('joinDate')} onChange={e => {
                          set('joinDate', e.target.value)
                          if (!freelance && e.target.value) set('probationEndDate', addMonthsISO(e.target.value, DEFAULT_PROBATION_MONTHS))
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="onb-hr-end" className="text-xs text-muted-foreground">{freelance ? 'Contract End' : `Probation End (default ${DEFAULT_PROBATION_MONTHS} months)`}</Label>
                        <Input id="onb-hr-end" type="date" disabled={closed} value={val('probationEndDate')} onChange={e => set('probationEndDate', e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                      <Checkbox disabled={closed} checked={edit.isCrew === true} onCheckedChange={v => set('isCrew', v === true)} className="mt-0.5" />
                      <span><span className="font-medium">Crew</span><span className="block text-xs text-muted-foreground">Joiner must upload Seaman Book, BST and Medical Check Up.</span></span>
                    </label>

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compensation</h4>
                        <Button type="button" variant="outline" size="sm" onClick={gate.revealed ? gate.hide : gate.requestReveal}>{gate.revealed ? 'Hide' : 'Show Amounts'}</Button>
                      </div>
                      {!gate.revealed ? (
                        <p className="text-xs text-muted-foreground">Hidden. Optional here — can also be set later in Employees.</p>
                      ) : freelance ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="onb-hr-fee" className="text-xs text-muted-foreground">Freelance Fee</Label>
                            <RupiahInput id="onb-hr-fee" disabled={closed} value={val('freelanceFee')} onChange={v => set('freelanceFee', v)} />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="onb-hr-feetype" className="text-xs text-muted-foreground">Fee Type</Label>
                            <NativeSelect id="onb-hr-feetype" disabled={closed} value={val('freelanceFeeType')} onChange={e => set('freelanceFeeType', e.target.value)}>
                              <option value="">—</option><option value="Per Day">Per Day</option><option value="Per Month">Per Month</option>
                            </NativeSelect>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="onb-hr-salary" className="text-xs text-muted-foreground">Basic Salary</Label>
                            <RupiahInput id="onb-hr-salary" disabled={closed} value={val('basicSalary')} onChange={v => set('basicSalary', v)} />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="onb-hr-allow" className="text-xs text-muted-foreground">Allowance</Label>
                            <RupiahInput id="onb-hr-allow" disabled={closed} value={val('allowance')} onChange={v => set('allowance', v)} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'documents' && ctx && (
                  !gate.revealed ? (
                    <div className="text-sm text-muted-foreground text-center py-10 border-2 border-dashed rounded-xl space-y-3">
                      <p>Documents are hidden. Enter your password to view them.</p>
                      <Button variant="outline" size="sm" onClick={gate.requestReveal}>Show Documents</Button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {ONBOARDING_DOCS.filter(d => isDocVisible(d, ctx) || ((edit[d.key] as string[]) ?? []).length > 0).map(d => {
                        const files = (edit[d.key] as string[]) ?? []
                        return (
                          <div key={d.key} className="space-y-1.5">
                            <p className={labelCls}>{d.label}</p>
                            {closed ? (
                              files.length === 0 ? <p className="text-sm text-muted-foreground">Not uploaded.</p> : (
                                <div className="space-y-2">
                                  {files.map((f, i) => (
                                    <div key={i} className="flex items-center gap-3 border rounded-lg px-3 py-2">
                                      <FileText className="size-4 text-primary-strong" />
                                      <span className="text-sm flex-1">{d.label}{files.length > 1 ? ` — file ${i + 1}` : ''}</span>
                                      <Button variant="ghost" size="icon" className="size-7" aria-label={`Download ${d.label} ${i + 1}`}
                                        onClick={() => downloadDataUrl(f, `${detail.fullName.replace(/[^a-z0-9]+/gi, '-')}-${d.key}-${i + 1}.${extFromDataUrl(f)}`)}>
                                        <Download className="size-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : (
                              <MultiFilePicker files={files} onChange={next => set(d.key, next)} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
                {gate.dialog}
              </div>

              <DialogFooter className="px-6 py-4 border-t bg-muted/50 sm:justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  {detail.status !== 'PROBATION_STARTED' && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={remove}><Trash2 /> Delete</Button>
                  )}
                  {!closed && detail.status !== 'APPROVED' && (
                    <Button variant="ghost" size="sm" disabled={!!busy} onClick={async () => {
                      const ok = await confirm({ title: 'Cancel onboarding?', description: 'The link stops working. The record is kept as Cancelled.', confirmLabel: 'Cancel Onboarding', destructive: true })
                      if (ok) await action('cancel')
                    }}><Ban /> Cancel</Button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {(detail.status === 'INVITED' || detail.status === 'REVISION_REQUESTED') && (
                    <>
                      <Button variant="outline" size="sm" disabled={!!busy} onClick={async () => {
                        const d = await action('reset-pin')
                        if (d?.pin) onShare({ fullName: detail.fullName, link: d.link, pin: d.pin })
                      }}><KeyRound /> Reset PIN</Button>
                      <Button variant="outline" size="sm" disabled={!!busy} onClick={async () => { const d = await action('extend'); if (d) toast.success(`Link valid until ${formatDate(d.form.expiresAt)}`) }}><CalendarPlus /> Extend Link</Button>
                      <Button variant="outline" size="sm" disabled={!!busy || !val('inviteEmail')} title={val('inviteEmail') ? undefined : 'Set the invite email first'}
                        onClick={async () => { const d = await action('send-email'); if (d) toast.success('Link emailed') }}><Mail /> Email Link</Button>
                      <Button size="sm" onClick={() => copy(`${window.location.origin}/onboarding/${detail.token}`, 'Link')}><Copy /> Copy Link</Button>
                    </>
                  )}
                  {(detail.status === 'SUBMITTED' || detail.status === 'APPROVED') && (
                    <Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setRevisionNote(''); setRevisionOpen(true) }}><Undo2 /> Request Revision</Button>
                  )}
                  {!closed && dirty && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => save()}>{busy === 'save' ? 'Saving…' : 'Save Changes'}</Button>}
                  {detail.status === 'SUBMITTED' && (
                    <Button size="sm" disabled={!!busy} onClick={async () => {
                      if (missing.length) {
                        const ok = await confirm({ title: 'Approve with missing data?', description: `Still missing: ${missing.join(', ')}.`, confirmLabel: 'Approve Anyway' })
                        if (!ok) return
                      }
                      const d = await action('approve'); if (d) toast.success('Approved — complete the Employment tab, then Start Probation')
                    }}><CheckCircle2 /> Approve</Button>
                  )}
                  {detail.status === 'APPROVED' && (
                    <Button size="sm" disabled={!!busy} onClick={startProbation}><UserCheck /> {busy === 'start' ? 'Starting…' : 'Start Probation'}</Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
            <DialogDescription>The joiner sees this note on the form{detail?.inviteEmail ? ' and gets it by email' : ''}. Their link and PIN stay the same.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} autoFocus aria-label="What needs to change" placeholder="e.g. KTP photo is blurry — please re-upload. Bank account name must match your ID."
            value={revisionNote} onChange={e => setRevisionNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionOpen(false)}>Cancel</Button>
            <Button disabled={!revisionNote.trim() || !!busy} onClick={async () => {
              const d = await action('request-revision', { note: revisionNote })
              if (!d) return
              setRevisionOpen(false)
              if (d.email && !d.email.ok) toast.error(`Sent back, but email failed: ${d.email.error}`)
              else toast.success('Sent back to the joiner')
            }}>Send Back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [rows, setRows] = useState<OnboardingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OnboardingStatus | 'All'>('All')
  const [createOpen, setCreateOpen] = useState(false)
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/hr/onboarding')
    if (res.ok) setRows(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = filter === 'All' ? rows : rows.filter(r => r.status === filter)
  const toReview = rows.filter(r => r.status === 'SUBMITTED').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Onboarding</h2>
          <p className="text-muted-foreground text-sm mt-1">
            New joiners fill in their own data and documents{toReview > 0 ? ` · ${toReview} waiting for review` : ''}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New Onboarding</Button>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {(['All', ...STATUSES] as const).map(s => {
          const count = s === 'All' ? rows.length : rows.filter(r => r.status === s).length
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                filter === s ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {s === 'All' ? 'All' : ONBOARDING_STATUS_LABEL[s]}
              {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${filter === s ? 'bg-primary/15 text-primary-strong' : 'bg-muted text-muted-foreground'}`}>{count}</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="rounded-xl border h-40 animate-pulse bg-muted/30" />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Position</th>
                <th className="text-left px-4 py-3 font-semibold">Join Date</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  {filter === 'All' ? 'No onboarding forms yet. Create one here or from a candidate at Offer/Hired.' : 'Nothing in this status.'}
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.fullName}</p>
                    <p className="text-[11px] text-muted-foreground">{r.candidate ? 'From Candidates' : 'Direct'}{r.inviteEmail ? ` · ${r.inviteEmail}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.role?.title ?? '—'}{r.location ? <span className="block">{r.location.name}</span> : null}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{r.joinDate ? formatDate(r.joinDate) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <StatusBadge tone={r.formType === 'FREELANCE' ? 'purple' : 'neutral'}>{r.formType === 'FREELANCE' ? 'Freelance' : 'Employee'}</StatusBadge>
                      {r.isCrew && <StatusBadge tone="cyan">Crew</StatusBadge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={STATUS_TONE[r.status]}>{ONBOARDING_STATUS_LABEL[r.status]}</StatusBadge>
                    {r.employee && <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><ExternalLink className="size-3" />{r.employee.employeeNumber}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {r.status === 'INVITED' || r.status === 'REVISION_REQUESTED'
                      ? <span className={isExpired(r) ? 'text-destructive' : 'text-muted-foreground'}>{isExpired(r) ? 'Expired' : `Until ${formatDate(r.expiresAt)}`}</span>
                      : <span className="text-muted-foreground">Closed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <CreateOnboardingDialog open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={s => { setCreateOpen(false); setShare(s); load() }} />
      <ShareDialog info={share} onClose={() => setShare(null)} />
      <DetailDialog id={detailId} onClose={() => setDetailId(null)} onChanged={load} onShare={setShare} />
    </div>
  )
}
