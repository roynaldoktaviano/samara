'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, User, Check, ChevronsUpDown, Search } from 'lucide-react'
import { toast } from 'sonner'
import { NATIONALITIES } from '@/lib/nationalities'

/* ── Types ── */
export interface LeadFormState {
  firstName: string; lastName: string; nationality: string
  email: string; phone: string; instagram: string; notes: string
  productInterest: string; destinationId: string
  travelStartDate: string; travelEndDate: string; travelSeason: string
  guestCount: string; leadQuality: string
  budgetMin: string; budgetMax: string; budgetCurrency: string
}

export const LEAD_FORM_EMPTY: LeadFormState = {
  firstName: '', lastName: '', nationality: '', email: '', phone: '', instagram: '', notes: '',
  productInterest: '', destinationId: '',
  travelStartDate: '', travelEndDate: '', travelSeason: '',
  guestCount: '', leadQuality: '',
  budgetMin: '', budgetMax: '', budgetCurrency: 'USD',
}

export function toLeadFormState(data: any): LeadFormState {
  const parts = (data.name ?? '').trim().split(/\s+/)
  return {
    firstName:   data.firstName   || parts[0]                 || '',
    lastName:    data.lastName    || parts.slice(1).join(' ') || '',
    nationality: data.nationality ?? '',
    email:       data.email       ?? '',
    phone:       data.phone       ?? '',
    instagram:   data.instagram   ?? '',
    notes:       data.notes       ?? '',
    productInterest: data.productInterest ?? '',
    destinationId:   data.destinationId   ?? '',
    travelStartDate: data.travelStartDate ? data.travelStartDate.slice(0, 10) : '',
    travelEndDate:   data.travelEndDate   ? data.travelEndDate.slice(0, 10)   : '',
    travelSeason:    data.travelSeason    ?? '',
    guestCount:      data.guestCount != null ? String(data.guestCount) : '',
    leadQuality:     data.leadQuality     ?? '',
    budgetMin:       data.budgetMin != null ? String(data.budgetMin) : '',
    budgetMax:       data.budgetMax != null ? String(data.budgetMax) : '',
    budgetCurrency:  data.budgetCurrency  ?? 'USD',
  }
}

function NationalitySelect({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? NATIONALITIES.filter(n => n.toLowerCase().includes(query.toLowerCase()))
    : NATIONALITIES

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full justify-between font-normal px-3 border-input"
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
              aria-label="Search nationality"
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

interface IdNameOption { id: string; name: string }

function DestinationSelect({ id, value, onChange }: { id?: string; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<IdNameOption[]>([])

  useEffect(() => {
    fetch('/api/destinations').then(r => r.ok ? r.json() : []).then(setOptions).catch(() => {})
  }, [])

  const filtered = query.trim()
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options
  const selected = options.find(o => o.id === value)

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full justify-between font-normal px-3 border-input"
        >
          <span className={selected ? '' : 'text-muted-foreground'}>{selected?.name || 'Select destination'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              aria-label="Search destination"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search destination…"
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
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id === value ? '' : o.id); setOpen(false); setQuery('') }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left"
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${value === o.id ? 'opacity-100' : 'opacity-0'}`} />
                {o.name}
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

function Field({ label, htmlFor, hint, children, col2 }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={col2 ? 'sm:col-span-2' : ''}>
      <Label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First Name *" htmlFor="lead-first-name">
          <Input id="lead-first-name" value={form.firstName} onChange={set('firstName')} placeholder="First name" />
        </Field>
        <Field label="Last Name" htmlFor="lead-last-name">
          <Input id="lead-last-name" value={form.lastName} onChange={set('lastName')} placeholder="Last name" />
        </Field>
        <Field label="Country" htmlFor="lead-nationality" col2>
          <NationalitySelect id="lead-nationality" value={form.nationality} onChange={v => setForm({ ...form, nationality: v })} />
        </Field>
        <Field label="Email" htmlFor="lead-email">
          <Input id="lead-email" type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" />
        </Field>
        <Field label="Phone" htmlFor="lead-phone">
          <Input id="lead-phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+62 812 3456 7890" />
        </Field>
        <Field label="Instagram" htmlFor="lead-instagram" col2>
          <Input id="lead-instagram" value={form.instagram} onChange={set('instagram')} placeholder="username (without @)" />
        </Field>
        <Field label="Notes" htmlFor="lead-notes" col2>
          <Textarea id="lead-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional context about this lead…" rows={3} />
        </Field>
      </div>
    </div>
  )
}

function QualificationFields({ form, setForm }: { form: LeadFormState; setForm: (f: LeadFormState) => void }) {
  const set = (k: keyof LeadFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value })

  const [yachtNames, setYachtNames] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.ok ? r.json() : []).then((yachts: { name: string }[]) => setYachtNames(yachts.map(y => y.name))).catch(() => {})
  }, [])

  return (
    <div>
      <SectionTitle>Trip Qualification</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Yacht / Product Interest" htmlFor="lead-product-interest" col2 hint="Required before this lead can be marked Qualified.">
          <Input id="lead-product-interest" list="lead-yacht-options" value={form.productInterest} onChange={set('productInterest')} placeholder="e.g. Phinisi charter, day trip…" />
          <datalist id="lead-yacht-options">
            {yachtNames.map(n => <option key={n} value={n} />)}
          </datalist>
        </Field>
        <Field label="Destination" htmlFor="lead-destination" col2>
          <DestinationSelect id="lead-destination" value={form.destinationId} onChange={v => setForm({ ...form, destinationId: v })} />
        </Field>
        <Field label="Travel Start Date" htmlFor="lead-travel-start">
          <Input id="lead-travel-start" type="date" value={form.travelStartDate} onChange={set('travelStartDate')} />
        </Field>
        <Field label="Travel End Date" htmlFor="lead-travel-end">
          <Input id="lead-travel-end" type="date" value={form.travelEndDate} onChange={set('travelEndDate')} />
        </Field>
        <Field label="Season (if dates unknown)" htmlFor="lead-travel-season" col2 hint="Fill this if exact dates aren't fixed yet, e.g. “High season Aug 2026”.">
          <Input id="lead-travel-season" value={form.travelSeason} onChange={set('travelSeason')} placeholder="e.g. High season, Aug 2026" />
        </Field>
        <Field label="Number of Guests" htmlFor="lead-guest-count">
          <Input id="lead-guest-count" type="number" min={1} value={form.guestCount} onChange={set('guestCount')} placeholder="e.g. 6" />
        </Field>
        <Field label="Lead Quality" htmlFor="lead-quality">
          <Select value={form.leadQuality || undefined} onValueChange={v => setForm({ ...form, leadQuality: v })}>
            <SelectTrigger id="lead-quality" className="w-full"><SelectValue placeholder="Select quality" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="HOT">Hot</SelectItem>
              <SelectItem value="WARM">Warm</SelectItem>
              <SelectItem value="COLD">Cold</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Budget Range (optional)" htmlFor="lead-budget-min" col2 hint="Only fill if the guest's budget was actually discussed — never required to progress the pipeline.">
          <div className="flex items-center gap-2">
            <Input id="lead-budget-min" type="number" min={0} value={form.budgetMin} onChange={set('budgetMin')} placeholder="Min" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="number" min={0} value={form.budgetMax} onChange={set('budgetMax')} placeholder="Max" aria-label="Budget max" />
            <Input value={form.budgetCurrency} onChange={set('budgetCurrency')} placeholder="USD" aria-label="Budget currency" className="w-20 shrink-0" />
          </div>
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
        <div className="bg-brand px-5 pt-5 pb-4 text-brand-foreground shrink-0">
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
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            <ProfileFields form={form} setForm={setForm} />
            <QualificationFields form={form} setForm={setForm} />
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t space-y-2.5">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              variant="brand"
              onClick={handleSave}
              loading={saving}
              disabled={loading || !form.firstName.trim()}
            >
              {isEdit ? 'Save Changes' : 'Add Lead'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
