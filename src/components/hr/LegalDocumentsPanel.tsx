'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Plus, Pencil, Trash2, Paperclip, Upload, AlertTriangle, FileText } from 'lucide-react'
import { readUploadFile } from '@/lib/fileUpload'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/format'

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

function expiryStatus(expiryDate: string | null): { label: string; tone: StatusTone } | null {
  if (!expiryDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate); exp.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
  if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, tone: 'destructive' }
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, tone: 'warning' }
  return { label: `Valid until ${formatDate(expiryDate)}`, tone: 'success' }
}

export default function LegalDocumentsPanel({ owner, onBack, backLabel }: { owner: DocsOwner; onBack?: () => void; backLabel?: string }) {
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState<{ doc: LegalDocument | null } | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [uploading, setUploading] = useState(false)
  const confirm = useConfirm()

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
    if (!(await confirm({
      title: 'Delete Document?',
      description: <><span className="font-medium text-foreground">{doc.name}</span> will be removed permanently.</>,
      destructive: true,
    }))) return
    await fetch(`/api/hr/legal-documents/${doc.id}`, { method: 'DELETE' })
    load()
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
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2.5 mb-1 h-7 gap-1.5 text-xs text-muted-foreground">
              <ArrowLeft className="size-3.5" /> {backLabel ?? 'Back'}
            </Button>
          )}
          {onBack && <h2 className="text-2xl font-bold tracking-tight">{owner.name}</h2>}
          <p className="text-muted-foreground text-sm mt-1">Legal & compliance documents — {documents.length} tracked</p>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Add Document
        </Button>
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
                            <StatusBadge tone={status.tone}>
                              {status.tone === 'destructive' && <AlertTriangle className="h-3 w-3" />}
                              {status.label}
                            </StatusBadge>
                          ) : <span className="text-muted-foreground text-xs">No expiry set</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {doc.fileKey ? (
                            <a href={doc.fileKey} target="_blank" rel="noopener noreferrer" className="text-info hover:text-info/80" aria-label={`View file for ${doc.name}`}>
                              <Paperclip className="h-4 w-4 inline" />
                            </a>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(doc)} className="size-7 text-muted-foreground" aria-label="Edit document">
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => doDelete(doc)} className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Delete document">
                              <Trash2 className="size-3.5" />
                            </Button>
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
      <Dialog open={!!modal} onOpenChange={o => { if (!o) setModal(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="font-bold text-sm pr-6">{modal?.doc ? 'Edit Document' : 'Add Document'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="legal-doc-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Name</Label>
                <Input id="legal-doc-name" autoFocus className="h-10"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="legal-doc-section" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Section</Label>
                <Input id="legal-doc-section" placeholder="e.g. Company Legal, Boat / Vessel Documents" className="h-10"
                  value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-category" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</Label>
                <Input id="legal-doc-category" className="h-10"
                  value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-period" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</Label>
                <NativeSelect id="legal-doc-period" className="h-10"
                  value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}>
                  <option value="">—</option>
                  {withCurrent(PERIOD_OPTIONS, form.period).map(p => <option key={p} value={p}>{p}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-sub-detail" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sub Details</Label>
                <NativeSelect id="legal-doc-sub-detail" className="h-10"
                  value={form.subDetail} onChange={e => setForm(f => ({ ...f, subDetail: e.target.value }))}>
                  <option value="">—</option>
                  {withCurrent(SUB_DETAIL_OPTIONS, form.subDetail).map(s => <option key={s} value={s}>{s}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-establish" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Establish Date</Label>
                <Input id="legal-doc-establish" type="date" className="h-10"
                  value={form.establishDate} onChange={e => setForm(f => ({ ...f, establishDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-expiry" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expiry Date</Label>
                <Input id="legal-doc-expiry" type="date" className="h-10"
                  value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground">Leave blank if the document never expires. Reminders fire from this date.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-issuer" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issuer</Label>
                <Input id="legal-doc-issuer" className="h-10"
                  value={form.issuer} onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-doc-vendor" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor</Label>
                <Input id="legal-doc-vendor" className="h-10"
                  value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor={form.fileKey ? undefined : 'legal-doc-file'} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">File</Label>
                {form.fileKey ? (
                  <div className="flex items-center gap-2">
                    <a href={form.fileKey} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-info hover:text-info/80">
                      <Paperclip className="h-3.5 w-3.5" /> View current file
                    </a>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, fileKey: '' }))}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive">Remove</Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 h-10 border border-dashed rounded-lg px-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors w-fit">
                    <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload file'}
                    <input id="legal-doc-file" type="file" className="hidden" onChange={handleFile} disabled={uploading} />
                  </label>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="legal-doc-notes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
                <Textarea id="legal-doc-notes" rows={2} className="resize-none"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50 shrink-0">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving} className="font-semibold">
              {saving ? 'Saving…' : modal?.doc ? 'Save Changes' : 'Add Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
