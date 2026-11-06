'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, Lock, FileText, Trash2, Upload, AlertTriangle, Briefcase, MapPin, CalendarDays, Clock } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'
import { readUploadFile } from '@/lib/fileUpload'
import { formatDate } from '@/lib/format'
import {
  ONBOARDING_DOCS, ONBOARDING_SECTIONS, isDocRequired, isDocVisible, isFieldRequired, isFieldVisible,
  missingOnboardingFields, type OnboardingDocField, type OnboardingFormType, type OnboardingTextField,
} from '@/lib/onboarding-fields'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'
const MAX_FILE_BYTES = 10 * 1024 * 1024

interface FormView {
  status: 'INVITED' | 'REVISION_REQUESTED'
  formType: OnboardingFormType
  isCrew: boolean
  revisionNote: string | null
  expiresAt: string
  lastSavedAt: string | null
  position: string | null
  location: string | null
  department: string | null
  joinDate: string | null
  values: Record<OnboardingTextField, string>
  docCounts: Record<OnboardingDocField, number>
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'closed'; status: string; firstName: string }
  | { kind: 'pin'; lockedUntil: string | null }
  | { kind: 'form'; form: FormView }
  | { kind: 'done' }

const inputCls = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500'

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 pb-28"><div className="max-w-2xl mx-auto px-4 pt-8">{children}</div></div>
}

function Centered({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        {icon ?? <img src={LOGO} alt="Samara" className="w-16 h-16 mx-auto mb-4 opacity-70" />}
        <h1 className="text-xl font-bold text-gray-800 mb-2">{title}</h1>
        <div className="text-gray-500 text-sm">{children}</div>
      </div>
    </div>
  )
}

function PinScreen({ token, lockedUntil, onUnlocked }: { token: string; lockedUntil: string | null; onUnlocked: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(lockedUntil ? `Too many wrong PINs. Try again after ${new Date(lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, or ask HR to reset your PIN.` : '')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin)) { setError('Please enter the 6-digit PIN'); return }
    setBusy(true); setError('')
    const res = await fetch(`/api/onboarding/${token}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not verify PIN'); setPin(''); return }
    onUnlocked()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border p-6 text-center">
        <img src={LOGO} alt="Samara" className="w-12 h-12 mx-auto mb-3 opacity-80" />
        <h1 className="text-lg font-bold text-gray-900">Onboarding Form</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">Enter the 6-digit PIN you received from our HR team.</p>
        <label htmlFor="onboarding-pin" className="sr-only">PIN</label>
        <input id="onboarding-pin" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full text-center tracking-[0.5em] text-2xl font-semibold border border-gray-300 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="••••••" />
        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy || pin.length !== 6}
          className="mt-4 w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Open Form
        </button>
        <p className="text-xs text-gray-400 mt-4">Didn&apos;t get a PIN? Contact the HR team who sent you this link.</p>
      </form>
    </div>
  )
}

function DocUpload({ token, field, label, hint, required, count, onCount, onSessionLost }: {
  token: string; field: OnboardingDocField; label: string; hint?: string; required: boolean
  count: number; onCount: (n: number) => void; onSessionLost: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(body: Record<string, unknown>) {
    setBusy(true); setError('')
    const res = await fetch(`/api/onboarding/${token}/files`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, ...body }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.status === 401) { onSessionLost(); return }
    if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
    onCount(data.count)
  }

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list)
    const tooBig = files.find(f => f.size > MAX_FILE_BYTES && f.type === 'application/pdf')
    if (tooBig) { setError(`${tooBig.name} is larger than 10 MB`); return }
    if (files.some(f => !f.type.startsWith('image/') && f.type !== 'application/pdf')) { setError('Only photos or PDF files are accepted'); return }
    setBusy(true)
    try {
      const add = await Promise.all(files.map(f => readUploadFile(f, 1800, 0.82)))
      await send({ add })
    } catch {
      setBusy(false); setError('Could not read that file — try another photo or PDF')
    }
  }

  const { isDragging, dropProps } = useFileDrop(handleFiles)

  return (
    <div className="border border-gray-200 rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}{required && <span className="text-red-500"> *</span>}</p>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        {count > 0 && <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle2 className="h-3 w-3" /> Uploaded</span>}
      </div>
      {count > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="flex items-center gap-2 text-gray-700"><FileText className="h-4 w-4 text-gray-400" /> File {i + 1}</span>
              <button type="button" disabled={busy} onClick={() => send({ removeIndex: i })} aria-label={`Remove ${label} file ${i + 1}`}
                className="text-gray-400 hover:text-red-600 disabled:opacity-40 p-1"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" aria-label={`Upload ${label}`}
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} {...dropProps}
        className={`mt-2.5 w-full border-2 border-dashed rounded-xl py-3.5 flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          isDragging ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-700'
        }`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? 'Uploading…' : isDragging ? 'Drop to upload' : count > 0 ? 'Add another file' : 'Take a photo or upload photo/PDF'}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function OnboardingFormPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [values, setValues] = useState<Record<string, string>>({})
  const [docCounts, setDocCounts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const dirty = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/onboarding/${token}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setState({ kind: 'error', message: data.error ?? 'Invalid link' }); return }
    if (data.state === 'closed') { setState({ kind: 'closed', status: data.status, firstName: data.fullName }); return }
    if (data.state === 'pin') { setState({ kind: 'pin', lockedUntil: data.lockedUntil }); return }
    setValues(data.form.values); setDocCounts(data.form.docCounts); setLastSavedAt(data.form.lastSavedAt)
    dirty.current = false
    setState({ kind: 'form', form: data.form })
  }, [token])

  useEffect(() => { load() }, [load])

  // Warn before leaving with unsaved typing.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault() } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const sessionLost = useCallback(() => {
    setMessage({ tone: 'error', text: 'Your session expired — please enter your PIN again. Unsaved changes on this page are kept.' })
    setState({ kind: 'pin', lockedUntil: null })
  }, [])

  if (state.kind === 'loading') return (
    <Centered icon={<Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />} title="Loading…" />
  )
  if (state.kind === 'error') return (
    <Centered title={state.message === 'This link has expired' ? 'Link Expired' : 'Invalid Link'}>
      {state.message === 'This link has expired'
        ? 'This link has expired. Please contact our HR team for a new one.'
        : 'This link is invalid. Please check the link you were sent, or contact our HR team.'}
    </Centered>
  )
  if (state.kind === 'done' || (state.kind === 'closed' && state.status === 'SUBMITTED')) return (
    <Centered icon={<CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />} title="Thank you!">
      Your onboarding form has been submitted. Our HR team will review it and contact you if anything needs to change.
    </Centered>
  )
  if (state.kind === 'closed') return (
    <Centered icon={<CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />} title={state.status === 'CANCELLED' ? 'Form Closed' : 'All Done'}>
      {state.status === 'CANCELLED'
        ? 'This onboarding form is no longer active. Please contact our HR team if you think this is a mistake.'
        : 'Your onboarding form has been reviewed and accepted. Nothing more is needed here.'}
    </Centered>
  )
  if (state.kind === 'pin') return (
    <PinScreen token={token} lockedUntil={state.lockedUntil} onUnlocked={async () => {
      // Keep whatever was typed before the session expired.
      const typed = dirty.current ? values : null
      await load()
      if (typed) { setValues(typed); dirty.current = true }
    }} />
  )

  const form = state.form
  const ctx = { formType: form.formType, isCrew: form.isCrew, nationality: values.nationality }

  function set(key: string, v: string) {
    dirty.current = true
    setValues(prev => ({ ...prev, [key]: v }))
    setMessage(null)
  }

  async function save(kind: 'draft' | 'submit') {
    setMessage(null)
    let stillMissing: string[] = []
    if (kind === 'submit') {
      stillMissing = missingOnboardingFields(values, docCounts, { formType: form.formType, isCrew: form.isCrew })
      setMissing(stillMissing)
      if (stillMissing.length) {
        if (!dirty.current) { setMessage({ tone: 'error', text: 'Some required fields are still empty.' }); return }
        // Still save what's there so nothing typed is lost.
        kind = 'draft'
      }
    }
    setSaving(kind)
    const res = await fetch(kind === 'submit' ? `/api/onboarding/${token}/submit` : `/api/onboarding/${token}`, {
      method: kind === 'submit' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: values }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(null)
    if (res.status === 401) { sessionLost(); return }
    if (!res.ok) {
      if (Array.isArray(data.missing)) setMissing(data.missing)
      setMessage({ tone: 'error', text: data.error ?? 'Could not save' }); return
    }
    dirty.current = false
    if (kind === 'submit') { setState({ kind: 'done' }); return }
    setLastSavedAt(data.lastSavedAt ?? new Date().toISOString())
    setMessage(stillMissing.length
      ? { tone: 'error', text: 'Draft saved, but some required fields are still empty.' }
      : { tone: 'ok', text: 'Draft saved. You can come back to this link later to finish.' })
  }

  const missingSet = new Set(missing)

  return (
    <Shell>
      <div className="text-center mb-6">
        <img src={LOGO} alt="Samara" className="w-12 h-12 mx-auto mb-2 opacity-80" />
        <h1 className="text-xl font-bold text-gray-900">Onboarding Form</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome to the team! Please fill in your details and upload your documents.</p>
      </div>

      {(form.position || form.location || form.joinDate) && (
        <div className="bg-white rounded-2xl border p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2"><Briefcase className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /><div><p className="text-xs text-gray-500">Position</p><p className="font-semibold text-gray-900">{form.position ?? '—'}{form.department ? ` · ${form.department}` : ''}</p></div></div>
          <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /><div><p className="text-xs text-gray-500">Location</p><p className="font-semibold text-gray-900">{form.location ?? '—'}</p></div></div>
          <div className="flex items-start gap-2"><CalendarDays className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /><div><p className="text-xs text-gray-500">Join Date</p><p className="font-semibold text-gray-900">{form.joinDate ? formatDate(form.joinDate) : '—'}</p></div></div>
        </div>
      )}

      {form.status === 'REVISION_REQUESTED' && form.revisionNote && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-orange-800"><AlertTriangle className="h-4 w-4" /> HR asked for changes</p>
          <p className="text-sm text-orange-900 mt-1.5 whitespace-pre-wrap">{form.revisionNote}</p>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" /> Link valid until {formatDate(form.expiresAt)}. Fields marked <span className="text-red-500">*</span> are required.
      </p>

      {ONBOARDING_SECTIONS.map(section => {
        const fields = section.fields.filter(f => isFieldVisible(f, ctx))
        if (!fields.length || (section.standardOnly && form.formType === 'FREELANCE')) return null
        return (
          <section key={section.title} className="bg-white rounded-2xl border p-4 sm:p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
            {section.description && <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
              {fields.map(f => {
                const id = `onb-${f.key}`
                const req = isFieldRequired(f, ctx)
                const err = missingSet.has(f.label) && !String(values[f.key] ?? '').trim()
                const cls = `${inputCls} ${err ? 'border-red-400 ring-1 ring-red-300' : ''}`
                return (
                  <div key={f.key} className={`space-y-1.5 ${f.wide ? 'sm:col-span-2' : ''}`}>
                    <label htmlFor={id} className="text-sm font-medium text-gray-800">{f.label}{req && <span className="text-red-500"> *</span>}</label>
                    {f.type === 'select' ? (
                      <select id={id} className={cls} value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                        <option value="">Select…</option>
                        {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea id={id} rows={2} className={cls} value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
                    ) : (
                      <input id={id} type={f.type} className={cls} value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                        {...(f.key === 'nationality' ? { list: 'onb-nationalities' } : {})} />
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      <datalist id="onb-nationalities"><option value="Indonesian" /></datalist>

      <section className="bg-white rounded-2xl border p-4 sm:p-5 mb-4">
        <h2 className="text-base font-bold text-gray-900">Documents</h2>
        <p className="text-xs text-gray-500 mt-0.5">Photos or PDF, max 10 MB each. Uploads are saved right away. For your privacy, uploaded files can&apos;t be viewed again from this page.</p>
        <div className="grid grid-cols-1 gap-3 mt-4">
          {ONBOARDING_DOCS.filter(d => isDocVisible(d, ctx)).map(d => (
            <div key={d.key} className={missingSet.has(d.label) && !(docCounts[d.key] ?? 0) ? 'rounded-xl ring-2 ring-red-300' : ''}>
              <DocUpload token={token} field={d.key} label={d.label} hint={d.hint} required={isDocRequired(d, ctx)}
                count={docCounts[d.key] ?? 0} onCount={n => setDocCounts(c => ({ ...c, [d.key]: n }))} onSessionLost={sessionLost} />
            </div>
          ))}
        </div>
      </section>

      {missing.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-sm text-red-800">
          <p className="font-semibold">Please complete:</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">{missing.map(m => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {message && (
            <p className={`text-xs mb-2 ${message.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
          )}
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => save('draft')} disabled={!!saving}
              className="flex-1 py-3 border border-gray-300 bg-white text-gray-800 rounded-xl font-semibold text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors">
              {saving === 'draft' ? 'Saving…' : 'Save Draft'}
            </button>
            <button type="button" onClick={() => save('submit')} disabled={!!saving}
              className="flex-2 py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700 disabled:opacity-40 transition-colors">
              {saving === 'submit' ? 'Submitting…' : 'Submit to HR'}
            </button>
          </div>
          {lastSavedAt && !message && <p className="text-[11px] text-gray-400 mt-1.5 text-center">Last saved {new Date(lastSavedAt).toLocaleString()}</p>}
        </div>
      </div>
    </Shell>
  )
}
