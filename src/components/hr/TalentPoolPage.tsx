'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Trash2, Pencil, Sparkles, Phone, Mail, Paperclip, Upload, UserPlus, Download, FileText, FileDown } from 'lucide-react'
import { MultiFilePicker } from '@/components/ui/file-preview'
import { PhotoLightbox } from '@/components/purchasing/PhotoLightbox'
import { readUploadFile, isPdfDataUrl, downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'

interface EmployeeRole { id: string; title: string }
interface AdditionalDocument { id: string; name: string; description: string; fileKey: string }
interface Candidate {
  id: string; fullName: string; phone: string | null; email: string | null
  source: string | null; notes: string | null
  resumeFiles: string[]
  expectedSalary: number | null
  location: string | null
  readyJoinDate: string | null
  additionalDocuments: AdditionalDocument[]
  status: 'TALENT_POOL' | 'SHORTLISTED' | 'ASSESSMENT' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED'
  assessmentScore: number | null
  skills: string[]
  languages: string[]
  interviewScheduledAt: string | null
  interviewMeetingLink: string | null
  appliedRole: EmployeeRole | null
  convertedEmployeeId: string | null
  createdAt: string
}

const STATUSES = ['TALENT_POOL', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const
const STATUS_LABEL: Record<string, string> = {
  TALENT_POOL: 'Talent Pool', SHORTLISTED: 'Shortlisted', ASSESSMENT: 'Assessment', INTERVIEW: 'Interview',
  OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
}
const STATUS_COLOR: Record<string, string> = {
  TALENT_POOL: 'bg-slate-100 text-slate-700',
  SHORTLISTED: 'bg-sky-100 text-sky-700',
  ASSESSMENT: 'bg-blue-100 text-blue-700',
  INTERVIEW: 'bg-purple-100 text-purple-700',
  OFFER: 'bg-amber-100 text-amber-700',
  HIRED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

// Real, computed from readyJoinDate rather than a free-text field — "how soon can they
// start", derived the same way whether it was set yesterday or a year ago.
function availabilityLabel(readyJoinDate: string | null): string {
  if (!readyJoinDate) return 'Not specified'
  const days = Math.ceil((new Date(readyJoinDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return days <= 0 ? 'Immediate' : `${days} day${days === 1 ? '' : 's'}`
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 border rounded-lg px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  )
}

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }
  return (
    <div className="min-h-10 border rounded-lg flex items-center gap-1.5 flex-wrap p-1.5 bg-background focus-within:ring-1 focus-within:ring-amber-500">
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 rounded-full px-2.5 py-1">
          {v}
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input
        value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        onBlur={add} placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] h-7 text-sm border-0 bg-transparent focus:outline-none px-1"
      />
    </div>
  )
}

const BLANK = {
  fullName: '', appliedRoleId: '', phone: '', email: '', source: '', notes: '',
  resumeFiles: [] as string[],
  expectedSalary: '',
  location: '',
  readyJoinDate: '',
  additionalDocuments: [] as AdditionalDocument[],
  assessmentScore: '',
  skills: [] as string[],
  languages: [] as string[],
}

export default function TalentPoolPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | typeof STATUSES[number]>('All')
  const [roleFilter, setRoleFilter] = useState('All')

  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Candidate | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [convertError, setConvertError] = useState('')

  const [docModal, setDocModal] = useState(false)
  const [docEditId, setDocEditId] = useState<string | null>(null)
  const [docForm, setDocForm] = useState({ name: '', description: '', fileKey: '' })
  const [docUploading, setDocUploading] = useState(false)
  const [docError, setDocError] = useState('')
  const [docPreview, setDocPreview] = useState<string | null>(null)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailPreview, setDetailPreview] = useState<string | null>(null)

  const [scheduleTarget, setScheduleTarget] = useState<Candidate | null>(null)
  const [scheduleForm, setScheduleForm] = useState({ datetime: '', link: '' })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, rRes] = await Promise.all([fetch('/api/hr/candidates'), fetch('/api/hr/roles')])
    if (cRes.ok) setCandidates(await cRes.json())
    if (rRes.ok) setRoles(await rRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setEditingId(null); setForm({ ...BLANK }); setFormError(''); setModal(true) }

  function openEdit(c: Candidate) {
    setEditingId(c.id)
    setForm({
      fullName: c.fullName,
      appliedRoleId: c.appliedRole?.id ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      source: c.source ?? '',
      notes: c.notes ?? '',
      resumeFiles: c.resumeFiles ?? [],
      expectedSalary: c.expectedSalary != null ? String(c.expectedSalary) : '',
      location: c.location ?? '',
      readyJoinDate: c.readyJoinDate ? c.readyJoinDate.slice(0, 10) : '',
      additionalDocuments: (c.additionalDocuments ?? []).map(d => ({ ...d, description: d.description ?? '' })),
      assessmentScore: c.assessmentScore != null ? String(c.assessmentScore) : '',
      skills: c.skills ?? [],
      languages: c.languages ?? [],
    })
    setFormError(''); setModal(true)
  }

  async function save() {
    if (!form.fullName.trim()) { setFormError('Full name is required'); return }
    setSaving(true); setFormError('')
    const url = editingId ? `/api/hr/candidates/${editingId}` : '/api/hr/candidates'
    const method = editingId ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  function openAddDoc() { setDocEditId(null); setDocForm({ name: '', description: '', fileKey: '' }); setDocError(''); setDocModal(true) }

  function openEditDoc(doc: AdditionalDocument) {
    setDocEditId(doc.id); setDocForm({ name: doc.name, description: doc.description, fileKey: doc.fileKey }); setDocError(''); setDocModal(true)
  }

  async function handleDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setDocUploading(true); setDocError('')
    try {
      const fileKey = await readUploadFile(file)
      setDocForm(f => ({ ...f, name: f.name || file.name.replace(/\.[^.]+$/, ''), fileKey }))
    } catch {
      setDocError('Could not read that file — try a different image or PDF.')
    } finally {
      setDocUploading(false)
    }
  }

  function saveDoc() {
    if (!docForm.name.trim()) { setDocError('Document name is required'); return }
    if (!docForm.fileKey) { setDocError('Please upload a file'); return }
    setForm(f => ({
      ...f,
      additionalDocuments: docEditId
        ? f.additionalDocuments.map(d => d.id === docEditId ? { ...d, ...docForm, name: docForm.name.trim() } : d)
        : [...f.additionalDocuments, { id: crypto.randomUUID(), ...docForm, name: docForm.name.trim() }],
    }))
    setDocModal(false)
  }

  function removeDoc(id: string) {
    setForm(f => ({ ...f, additionalDocuments: f.additionalDocuments.filter(d => d.id !== id) }))
  }

  async function changeStatus(c: Candidate, status: string) {
    await fetch(`/api/hr/candidates/${c.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    load()
  }

  // `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's local time — a plain
  // `.slice(0,16)` on the stored ISO string would show UTC instead, quietly shifting the
  // displayed time by the timezone offset every time the form reopens.
  function toDatetimeLocal(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function openSchedule(c: Candidate) {
    setScheduleForm({ datetime: toDatetimeLocal(c.interviewScheduledAt), link: c.interviewMeetingLink ?? '' })
    setScheduleError('')
    setScheduleTarget(c)
  }

  async function saveSchedule() {
    if (!scheduleTarget) return
    if (!scheduleForm.datetime) { setScheduleError('Please pick a date and time'); return }
    setScheduleSaving(true); setScheduleError('')
    const res = await fetch(`/api/hr/candidates/${scheduleTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'INTERVIEW',
        interviewScheduledAt: new Date(scheduleForm.datetime).toISOString(),
        interviewMeetingLink: scheduleForm.link.trim() || null,
      }),
    })
    setScheduleSaving(false)
    if (!res.ok) { setScheduleError('Failed to save'); return }
    setScheduleTarget(null); load()
  }

  async function doDelete(c: Candidate) {
    await fetch(`/api/hr/candidates/${c.id}`, { method: 'DELETE' })
    setDeleteConfirm(null); load()
  }

  async function convertToEmployee(c: Candidate) {
    setConvertingId(c.id); setConvertError('')
    const res = await fetch(`/api/hr/candidates/${c.id}/convert`, { method: 'POST' })
    const data = await res.json()
    setConvertingId(null)
    if (!res.ok) { setConvertError(data.error ?? 'Failed to convert candidate to employee'); return }
    load()
  }

  const filtered = candidates
    .filter(c => statusFilter === 'All' || c.status === statusFilter)
    .filter(c => roleFilter === 'All' || c.appliedRole?.id === roleFilter)
  const activeCount = candidates.filter(c => c.status !== 'HIRED' && c.status !== 'REJECTED').length
  const detailCandidate = candidates.find(c => c.id === detailId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Talent Pool</h2>
          <p className="text-muted-foreground text-sm mt-1">{activeCount} candidate{activeCount !== 1 ? 's' : ''} in the active pipeline</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Candidate
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 border-b overflow-x-auto">
          {(['All', ...STATUSES] as const).map(s => {
            const count = s === 'All' ? candidates.length : candidates.filter(c => c.status === s).length
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                  statusFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {s === 'All' ? 'All' : STATUS_LABEL[s]}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 shrink-0">
          <option value="All">All applied roles</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </div>

      {convertError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{convertError}</p>
      )}

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Candidate</th>
                <th className="text-left px-4 py-3 font-medium">Applied Role</th>
                <th className="text-left px-4 py-3 font-medium">Contact</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No candidates {statusFilter !== 'All' || roleFilter !== 'All' ? 'match this filter' : 'yet'}.
                </td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} onClick={() => setDetailId(c.id)} className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 font-medium">{c.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.appliedRole?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    <div className="flex flex-col gap-0.5">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                      {!c.phone && !c.email && '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.source ?? '—'}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <select value={c.status} onChange={e => changeStatus(c, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-amber-500 ${STATUS_COLOR[c.status]}`}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {c.status === 'HIRED' && (
                        c.convertedEmployeeId ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-1">
                            <UserPlus className="h-3 w-3" /> Employee
                          </span>
                        ) : (
                          <button onClick={() => convertToEmployee(c)} disabled={convertingId === c.id}
                            className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full px-2 py-1 disabled:opacity-50 transition-colors">
                            <UserPlus className="h-3 w-3" /> {convertingId === c.id ? 'Converting...' : 'Convert to Employee'}
                          </button>
                        )
                      )}
                      <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteConfirm(c)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
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

      {/* ── Add Candidate Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">{editingId ? 'Edit Candidate' : 'Add Candidate'}</h3>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</label>
                <input autoFocus className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Applied Role</label>
                <select className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.appliedRoleId} onChange={e => setForm(f => ({ ...f, appliedRoleId: e.target.value }))}>
                  <option value="">—</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</label>
                <input placeholder="e.g. Referral, LinkedIn, Walk-in" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</label>
                <input placeholder="e.g. Jakarta, Bali" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected Salary</label>
                  <input type="number" min={0} placeholder="Rp" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.expectedSalary} onChange={e => setForm(f => ({ ...f, expectedSalary: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ready to Join</label>
                  <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.readyJoinDate} onChange={e => setForm(f => ({ ...f, readyJoinDate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assessment Score (0-100)</label>
                <input type="number" min={0} max={100} className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.assessmentScore} onChange={e => setForm(f => ({ ...f, assessmentScore: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skills</label>
                <TagInput values={form.skills} onChange={skills => setForm(f => ({ ...f, skills }))} placeholder="Add a skill and press Enter" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Languages</label>
                <TagInput values={form.languages} onChange={languages => setForm(f => ({ ...f, languages }))} placeholder="Add a language and press Enter" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CV</label>
                <MultiFilePicker files={form.resumeFiles} onChange={files => setForm(f => ({ ...f, resumeFiles: files }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional Documents</label>
                <div className="space-y-2">
                  {form.additionalDocuments.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                      <button type="button" onClick={() => openEditDoc(doc)} className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                      </button>
                      <button type="button" onClick={() => setDocPreview(doc.fileKey)} className="p-1.5 text-muted-foreground hover:text-amber-700 shrink-0">
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => downloadDataUrl(doc.fileKey, `${doc.name.replace(/[^a-z0-9]+/gi, '-') || 'document'}.${extFromDataUrl(doc.fileKey)}`)}
                        className="p-1.5 text-muted-foreground hover:text-amber-700 shrink-0">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeDoc(doc.id)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={openAddDoc}
                    className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed rounded-lg py-2.5 text-sm text-muted-foreground hover:border-amber-400 hover:text-amber-700 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add Document
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assessment Notes</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Candidate Detail ── */}
      {detailCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-11 w-11 rounded-full bg-amber-100 text-amber-800 font-bold text-sm flex items-center justify-center shrink-0">
                  {detailCandidate.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-base truncate">{detailCandidate.fullName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {detailCandidate.appliedRole?.title ?? 'No role specified'}{detailCandidate.location ? ` · ${detailCandidate.location}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailId(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <SummaryCard label="Assessment score" value={detailCandidate.assessmentScore != null ? `${detailCandidate.assessmentScore}/100` : '—'} />
                <SummaryCard label="Availability" value={availabilityLabel(detailCandidate.readyJoinDate)} />
                <SummaryCard label="Expected salary" value={detailCandidate.expectedSalary != null ? `Rp ${detailCandidate.expectedSalary.toLocaleString('id-ID')}` : '—'} />
                <SummaryCard label="Current stage" value={STATUS_LABEL[detailCandidate.status]} />
              </div>

              {(detailCandidate.skills.length > 0 || detailCandidate.languages.length > 0) && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Skills and languages</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {[...detailCandidate.skills, ...detailCandidate.languages].map((item, i) => (
                      <span key={i} className="text-xs font-medium bg-blue-50 text-blue-700 rounded-full px-2.5 py-1">{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {detailCandidate.notes && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Assessment notes</h4>
                  <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground whitespace-pre-wrap">{detailCandidate.notes}</div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold mb-2">CV</h4>
                {detailCandidate.resumeFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No CV uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {detailCandidate.resumeFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 border rounded-lg px-3 py-2.5">
                        <span className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">CV{detailCandidate.resumeFiles.length > 1 ? ` — file ${i + 1}` : ''}</p>
                          <p className="text-xs text-muted-foreground">Candidate CV</p>
                        </div>
                        <button type="button" onClick={() => setDetailPreview(f)} className="p-1.5 text-muted-foreground hover:text-amber-700 shrink-0">
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button" onClick={() => downloadDataUrl(f, `${detailCandidate.fullName.replace(/[^a-z0-9]+/gi, '-')}-cv-${i + 1}.${extFromDataUrl(f)}`)}
                          className="p-1.5 text-muted-foreground hover:text-amber-700 shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detailCandidate.additionalDocuments.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Additional Documents</h4>
                  <div className="space-y-2">
                    {detailCandidate.additionalDocuments.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 border rounded-lg px-3 py-2.5">
                        <span className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{doc.name}</p>
                          {doc.description ? <p className="text-xs text-muted-foreground truncate">{doc.description}</p> : <p className="text-xs text-muted-foreground">Document</p>}
                        </div>
                        <button type="button" onClick={() => setDetailPreview(doc.fileKey)} className="p-1.5 text-muted-foreground hover:text-amber-700 shrink-0">
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button" onClick={() => downloadDataUrl(doc.fileKey, `${doc.name.replace(/[^a-z0-9]+/gi, '-') || 'document'}.${extFromDataUrl(doc.fileKey)}`)}
                          className="p-1.5 text-muted-foreground hover:text-amber-700 shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailCandidate.interviewScheduledAt && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Interview Scheduled</p>
                      <p className="text-sm font-medium mt-0.5">
                        {new Date(detailCandidate.interviewScheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button onClick={() => openSchedule(detailCandidate)} className="text-xs font-medium text-amber-700 hover:underline shrink-0">Edit</button>
                  </div>
                  {detailCandidate.interviewMeetingLink && (
                    <a href={detailCandidate.interviewMeetingLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline mt-2">
                      Join Meeting Link →
                    </a>
                  )}
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold mb-2">Move candidate</h4>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button
                      key={s} onClick={() => changeStatus(detailCandidate, s)}
                      className={`text-xs font-medium border rounded-md px-3 py-1.5 transition-colors ${
                        detailCandidate.status === s ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setDetailId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Close</button>
              {detailCandidate.status === 'OFFER' ? (
                <button
                  onClick={() => window.open(`/print/offering-letter/${detailCandidate.id}`, '_blank', 'noopener,noreferrer')}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 transition-colors"
                >
                  <FileDown className="h-3.5 w-3.5" /> Generate Offering Letter
                </button>
              ) : (
                <button
                  onClick={() => openSchedule(detailCandidate)}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 transition-colors"
                >
                  {detailCandidate.interviewScheduledAt ? 'Reschedule Interview' : 'Schedule Interview'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Interview ── */}
      {scheduleTarget && (
        <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">Schedule Interview</h3>
              <button onClick={() => setScheduleTarget(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {scheduleError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{scheduleError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date & Time</label>
                <input
                  type="datetime-local" autoFocus
                  className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={scheduleForm.datetime} onChange={e => setScheduleForm(f => ({ ...f, datetime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zoom Meeting Link</label>
                <input
                  type="url" placeholder="https://zoom.us/j/..."
                  className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={scheduleForm.link} onChange={e => setScheduleForm(f => ({ ...f, link: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setScheduleTarget(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={saveSchedule} disabled={scheduleSaving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {scheduleSaving ? 'Saving...' : 'Save & Move to Interview'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailPreview && <PhotoLightbox photoKey={detailPreview} onClose={() => setDetailPreview(null)} zIndexClass="z-60" />}

      {/* ── Add/Edit Document Modal ── */}
      {docModal && (
        <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">{docEditId ? 'Edit Document' : 'Add Document'}</h3>
              <button onClick={() => setDocModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {docError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{docError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Name</label>
                <input autoFocus className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={docForm.name} onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={docForm.description} onChange={e => setDocForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">File</label>
                {docForm.fileKey ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setDocPreview(docForm.fileKey)} className="flex items-center gap-1.5 text-sm text-amber-700 hover:underline">
                      <Paperclip className="h-3.5 w-3.5" /> {isPdfDataUrl(docForm.fileKey) ? 'View PDF' : 'View file'}
                    </button>
                    <button type="button" onClick={() => setDocForm(f => ({ ...f, fileKey: '' }))} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-1.5 border-2 border-dashed rounded-lg py-2.5 text-sm cursor-pointer transition-colors ${
                    docUploading ? 'opacity-50 pointer-events-none' : 'text-muted-foreground hover:border-amber-400 hover:text-amber-700'
                  }`}>
                    <Upload className="h-3.5 w-3.5" /> {docUploading ? 'Uploading...' : 'Upload file'}
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleDocFile} disabled={docUploading} />
                  </label>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setDocModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={saveDoc} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 transition-colors">
                {docEditId ? 'Save Changes' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {docPreview && <PhotoLightbox photoKey={docPreview} onClose={() => setDocPreview(null)} zIndexClass="z-70" />}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Remove Candidate?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.fullName}</span> will be removed from the talent pool permanently.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
