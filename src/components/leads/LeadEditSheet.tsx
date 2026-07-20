'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Loader2, User, Check, ChevronsUpDown, Search } from 'lucide-react'
import { toast } from 'sonner'
import { NATIONALITIES } from '@/lib/nationalities'

/* ── Types ── */
export interface LeadFormState {
  firstName: string; lastName: string; nationality: string
  email: string; phone: string; notes: string
}

export const LEAD_FORM_EMPTY: LeadFormState = {
  firstName: '', lastName: '', nationality: '', email: '', phone: '', notes: '',
}

export function toLeadFormState(data: any): LeadFormState {
  const parts = (data.name ?? '').trim().split(/\s+/)
  return {
    firstName:   data.firstName   || parts[0]                 || '',
    lastName:    data.lastName    || parts.slice(1).join(' ') || '',
    nationality: data.nationality ?? '',
    email:       data.email       ?? '',
    phone:       data.phone       ?? '',
    notes:       data.notes       ?? '',
  }
}

function NationalitySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? NATIONALITIES.filter(n => n.toLowerCase().includes(query.toLowerCase()))
    : NATIONALITIES

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between text-sm font-normal px-3"
        >
          <span className={value ? '' : 'text-muted-foreground'}>{value || 'Select nationality'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search nationality…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div
            className="overflow-y-scroll p-1 overscroll-contain"
            style={{ maxHeight: 208 }}
            onWheel={e => e.stopPropagation()}
          >
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Not found.</p>
            ) : filtered.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => { onChange(n === value ? '' : n); setOpen(false); setQuery('') }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left"
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${value === n ? 'opacity-100' : 'opacity-0'}`} />
                {n}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/* ── Small helpers ── */
function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Field({ label, hint, children, col2 }: { label: string; hint?: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={col2 ? 'col-span-2' : ''}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">{hint}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function ProfileFields({ form, setForm }: { form: LeadFormState; setForm: (f: LeadFormState) => void }) {
  const set = (k: keyof LeadFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      <SectionTitle>Personal Information</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name *">
          <Input value={form.firstName} onChange={set('firstName')} placeholder="First name" className="h-8 text-sm" />
        </Field>
        <Field label="Last Name">
          <Input value={form.lastName} onChange={set('lastName')} placeholder="Last name" className="h-8 text-sm" />
        </Field>
        <Field label="Nationality" col2>
          <NationalitySelect value={form.nationality} onChange={v => setForm({ ...form, nationality: v })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" className="h-8 text-sm" />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+62 812 3456 7890" className="h-8 text-sm" />
        </Field>
        <Field label="Notes" col2>
          <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional context about this lead…" rows={3} className="text-sm" />
        </Field>
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  leadId?: string | null
  onClose: () => void
  onSaved?: (lead: any) => void
}

export default function LeadEditSheet({ open, leadId, onClose, onSaved }: Props) {
  const isEdit = !!leadId

  const [form, setForm] = useState<LeadFormState>(LEAD_FORM_EMPTY)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [leadName, setLeadName] = useState('')

  useEffect(() => {
    if (!open) return
    if (!leadId) {
      setForm(LEAD_FORM_EMPTY)
      setLeadName('')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/leads/${leadId}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setLeadName(data.name ?? '')
        setForm(toLeadFormState(data))
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [open, leadId])

  const handleSave = async () => {
    if (!form.firstName.trim()) return
    setSaving(true)
    try {
      const res = isEdit
        ? await fetch(`/api/leads/${leadId}`, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/leads',            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      const saved = await res.json()
      toast.success(isEdit ? 'Lead updated' : 'Lead added successfully')
      onSaved?.(saved)
      onClose()
    } catch {
      toast.error(isEdit ? 'Failed to save changes' : 'Failed to add lead')
    } finally {
      setSaving(false)
    }
  }

  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || leadName

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-[95vw] sm:w-120 sm:max-w-none p-0 flex flex-col overflow-hidden">
        <SheetTitle className="sr-only">{isEdit ? 'Edit Lead' : 'Add Lead'}</SheetTitle>

        {/* Header */}
        <div className="bg-[#1a5f6e] px-5 pt-5 pb-4 text-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-full bg-white/20 ring-2 ring-white/25 flex items-center justify-center font-bold text-sm shrink-0">
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin opacity-70" />
                : displayName ? getInitials(displayName) : <User className="h-4.5 w-4.5 opacity-70" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-widest text-white/50 font-semibold mb-0.5">
                {isEdit ? 'Edit Lead' : 'New Lead'}
              </p>
              <p className="font-semibold text-[15px] leading-snug truncate">
                {loading ? 'Loading…' : (displayName || 'Enter name below')}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <ProfileFields form={form} setForm={setForm} />
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t space-y-2.5">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="h-8 px-4 text-sm">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || loading || !form.firstName.trim()}
              className="h-8 px-5 text-sm bg-[#1a5f6e] hover:bg-[#145260] text-white"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Lead'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
