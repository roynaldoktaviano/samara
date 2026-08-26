'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Plus, X, Pencil, Trash2, Paperclip, Upload, AlertTriangle, FileText } from 'lucide-react'
import { readUploadFile } from '@/lib/fileUpload'

interface LegalDocument {
  id: string; legalEntityId: string | null; yachtId: string | null
  section: string | null; name: string; category: string | null; period: string | null; subDetail: string | null
  fileKey: string | null
  establishDate: string | null; expiryDate: string | null
  issuer: string | null; vendor: string | null; notes: string | null
}

interface DocsOwner { id: string; name: string; kind: 'legalEntity' | 'yacht' }

const PERIOD_OPTIONS = ['Weekly', 'Monthly', '3 Months', '6 Months', 'Yearly', '3 Years', '5 Years', '10 Years', 'Permanent']
const SUB_DETAIL_OPTIONS = ['Mandatory', 'Optional']

function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : list
}

const BLANK = {
  section: '', name: '', category: '', period: '', subDetail: '', fileKey: '',
  establishDate: '', expiryDate: '', issuer: '', vendor: '', notes: '',
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function expiryStatus(expiryDate: string | null): { label: string; color: string } | null {
  if (!expiryDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate); exp.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
  if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: 'bg-red-100 text-red-700' }
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, color: 'bg-amber-100 text-amber-700' }
  return { label: `Valid until ${fmtDate(expiryDate)}`, color: 'bg-green-50 text-green-700' }
}

export default function LegalDocumentsPanel({ owner, onBack, backLabel }: { owner: DocsOwner; onBack?: () => void; backLabel?: string }) {
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState<{ doc: LegalDocument | null } | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<LegalDocument | null>(null)

  const ownerParam = owner.kind === 'yacht' ? 'yachtId' : 'legalEntityId'

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/hr/legal-documents?${ownerParam}=${owner.id}`)
    if (res.ok) setDocuments(await res.json())
    setLoading(false)
  }, [owner.id, ownerParam])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ ...BLANK }); setFormError(''); setModal({ doc: null }) }
  function openEdit(doc: LegalDocument) {
    setForm({
      section: doc.section ?? '', name: doc.name, category: doc.category ?? '', period: doc.period ?? '', subDetail: doc.subDetail ?? '',
      fileKey: doc.fileKey ?? '',
      establishDate: doc.establishDate ? doc.establishDate.slice(0, 10) : '',
      expiryDate: doc.expiryDate ? doc.expiryDate.slice(0, 10) : '',
      issuer: doc.issuer ?? '', vendor: doc.vendor ?? '', notes: doc.notes ?? '',
    })
    setFormError(''); setModal({ doc })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await readUploadFile(file)
      setForm(f => ({ ...f, fileKey: dataUrl }))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function save() {
    if (!form.name.trim()) { setFormError('Document name is required'); return }
    setSaving(true); setFormError('')
    const url = modal?.doc ? `/api/hr/legal-documents/${modal.doc.id}` : '/api/hr/legal-documents'
    const res = await fetch(url, {
      method: modal?.doc ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, [ownerParam]: owner.id }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(null); setSaving(false); load()
  }

  async function doDelete(doc: LegalDocument) {
    await fetch(`/api/hr/legal-documents/${doc.id}`, { method: 'DELETE' })
    setDeleteConfirm(null); load()
  }

  const sections = (() => {
    const map = new Map<string, LegalDocument[]>()
    documents.forEach(d => {
      const key = d.section || 'Other'
      const arr = map.get(key) ?? []
      arr.push(d)
      map.set(key, arr)
    })
    return [...map.entries()]
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-[#bdac7e] transition-colors mb-2">
              <ArrowLeft className="w-3.5 h-3.5" /> {backLabel ?? 'Back'}
            </button>
          )}
          {onBack && <h2 className="text-2xl font-bold tracking-tight">{owner.name}</h2>}
          <p className="text-muted-foreground text-sm mt-1">Legal & compliance documents — {documents.length} tracked</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Document
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border p-5 animate-pulse h-64" />
      ) : documents.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No documents tracked yet for {owner.name}.
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map(([section, docs]) => (
            <div key={section} className="rounded-xl border overflow-hidden">
              <div className="px-5 py-3 bg-muted/20 border-b">
                <p className="font-semibold text-sm">{section}</p>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Document</th>
                    <th className="text-left px-4 py-2.5 font-medium">Category</th>
                    <th className="text-left px-4 py-2.5 font-medium">Period</th>
                    <th className="text-left px-4 py-2.5 font-medium">Sub Details</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-center px-4 py-2.5 font-medium">File</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docs.map(doc => {
                    const status = expiryStatus(doc.expiryDate)
                    return (
                      <tr key={doc.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{doc.name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{doc.category ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{doc.period ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{doc.subDetail ?? '—'}</td>
                        <td className="px-4 py-3">
                          {status ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                              {status.color.includes('red') && <AlertTriangle className="h-3 w-3" />}
                              {status.label}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">No expiry set</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {doc.fileKey ? (
                            <a href={doc.fileKey} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                              <Paperclip className="h-4 w-4 inline" />
                            </a>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(doc)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteConfirm(doc)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Document Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-bold text-sm">{modal.doc ? 'Edit Document' : 'Add Document'}</h3>
              <button onClick={() => setModal(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Name</label>
                  <input autoFocus className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Section</label>
                  <input placeholder="e.g. Company Legal, Boat / Vessel Documents" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</label>
                  <select className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}>
                    <option value="">—</option>
                    {withCurrent(PERIOD_OPTIONS, form.period).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sub Details</label>
                  <select className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.subDetail} onChange={e => setForm(f => ({ ...f, subDetail: e.target.value }))}>
                    <option value="">—</option>
                    {withCurrent(SUB_DETAIL_OPTIONS, form.subDetail).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Establish Date</label>
                  <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.establishDate} onChange={e => setForm(f => ({ ...f, establishDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expiry Date</label>
                  <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
                  <p className="text-[10px] text-muted-foreground">Leave blank if the document never expires. Reminders fire from this date.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issuer</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.issuer} onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">File</label>
                  {form.fileKey ? (
                    <div className="flex items-center gap-2">
                      <a href={form.fileKey} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800">
                        <Paperclip className="h-3.5 w-3.5" /> View current file
                      </a>
                      <button type="button" onClick={() => setForm(f => ({ ...f, fileKey: '' }))} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 h-10 border border-dashed rounded-lg px-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors w-fit">
                      <Upload className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload file'}
                      <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
                    </label>
                  )}
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                  <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80 shrink-0">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : modal.doc ? 'Save Changes' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Delete Document?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.name}</span> will be removed permanently.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
