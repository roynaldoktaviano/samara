'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Loader2, User } from 'lucide-react'
import { toast } from 'sonner'

export interface GuestFormState {
  firstName: string; lastName: string; gender: string
  email: string; phone: string; passport: string
  dateOfBirth: string; address: string; nationality: string
  passportExpiry: string; emergencyContact: string
  dietaryRequirements: string; allergies: string; drinkPreferences: string
  equipmentSizes: string; operationalNotes: string
}

export const GUEST_FORM_EMPTY: GuestFormState = {
  firstName: '', lastName: '', gender: '', email: '', phone: '',
  passport: '', dateOfBirth: '', address: '', nationality: '',
  passportExpiry: '', emergencyContact: '',
  dietaryRequirements: '', allergies: '', drinkPreferences: '',
  equipmentSizes: '', operationalNotes: '',
}

export function toGuestFormState(data: any): GuestFormState {
  const parts = (data.name ?? '').trim().split(/\s+/)
  return {
    firstName:           data.firstName           || parts[0]                 || '',
    lastName:            data.lastName            || parts.slice(1).join(' ') || '',
    gender:              data.gender              ?? '',
    email:               data.email               ?? '',
    phone:               data.phone               ?? '',
    passport:            data.passport            ?? '',
    dateOfBirth:         data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
    address:             data.address             ?? '',
    nationality:         data.nationality         ?? '',
    passportExpiry:      data.passportExpiry ? data.passportExpiry.split('T')[0] : '',
    emergencyContact:    data.emergencyContact    ?? '',
    dietaryRequirements: data.dietaryRequirements ?? '',
    allergies:           data.allergies           ?? '',
    drinkPreferences:    data.drinkPreferences    ?? '',
    equipmentSizes:      data.equipmentSizes      ?? '',
    operationalNotes:    data.operationalNotes    ?? '',
  }
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

interface Props {
  open: boolean
  guestId?: string | null
  onClose: () => void
  onSaved?: (guest: any) => void
}

export default function GuestEditSheet({ open, guestId, onClose, onSaved }: Props) {
  const isEdit = !!guestId
  const [form, setForm] = useState<GuestFormState>(GUEST_FORM_EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [guestName, setGuestName] = useState('')

  useEffect(() => {
    if (!open) return
    if (!guestId) { setForm(GUEST_FORM_EMPTY); setGuestName(''); return }
    setLoading(true)
    setForm(GUEST_FORM_EMPTY)
    setGuestName('')
    fetch(`/api/customers/${guestId}`)
      .then(r => r.json())
      .then(data => { setGuestName(data.name ?? ''); setForm(toGuestFormState(data)) })
      .finally(() => setLoading(false))
  }, [open, guestId])

  const set = (k: keyof GuestFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.firstName.trim()) return
    setSaving(true)
    try {
      const res = isEdit
        ? await fetch(`/api/customers/${guestId}`, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/customers',             { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      const saved = await res.json()
      toast.success(isEdit ? 'Guest profile updated' : 'Guest added successfully')
      onSaved?.(saved)
      onClose()
    } catch {
      toast.error(isEdit ? 'Failed to save changes' : 'Failed to add guest')
    } finally {
      setSaving(false)
    }
  }

  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || guestName

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-[95vw] sm:w-170 sm:max-w-none p-0 flex flex-col overflow-hidden">
        <SheetTitle className="sr-only">{isEdit ? 'Edit Guest' : 'Add Guest'}</SheetTitle>

        {/* ── Header ── */}
        <div className="bg-[#1a5f6e] px-5 pt-5 pb-5 text-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-full bg-white/20 ring-2 ring-white/25 flex items-center justify-center font-bold text-sm shrink-0">
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin opacity-70" />
                : displayName ? getInitials(displayName) : <User className="h-4.5 w-4.5 opacity-70" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-widest text-white/50 font-semibold mb-0.5">
                {isEdit ? 'Edit Guest Profile' : 'New Guest'}
              </p>
              <p className="font-semibold text-[15px] leading-snug truncate">
                {loading ? 'Loading…' : (displayName || 'Enter name below')}
              </p>
              {form.gender && !loading && (
                <span className="inline-block mt-1 text-[9px] bg-white/15 px-2 py-0.5 rounded-full tracking-wide">{form.gender}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* ── Personal Information ── */}
            <div className="px-5 pt-5 pb-4 space-y-4">
              <SectionTitle>Personal Information</SectionTitle>

              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name *">
                  <Input value={form.firstName} onChange={set('firstName')} placeholder="First name" className="h-8 text-sm" />
                </Field>
                <Field label="Last Name">
                  <Input value={form.lastName} onChange={set('lastName')} placeholder="Last name" className="h-8 text-sm" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Gender">
                  <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date of Birth">
                  <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className="h-8 text-sm" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Citizenship / Nationality">
                  <Input value={form.nationality} onChange={set('nationality')} placeholder="Indonesian, Australian…" className="h-8 text-sm" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" className="h-8 text-sm" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+62 812 3456 7890" className="h-8 text-sm" />
                </Field>
                <Field label="Emergency Contact">
                  <Input value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Name & phone number" className="h-8 text-sm" />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Passport / ID Number">
                  <Input value={form.passport} onChange={set('passport')} placeholder="A1234567" className="h-8 text-sm" />
                </Field>
                <Field label="Passport Expiry Date">
                  <Input type="date" value={form.passportExpiry} onChange={set('passportExpiry')} className="h-8 text-sm" />
                </Field>
                <Field label="Address">
                  <Input value={form.address} onChange={set('address')} placeholder="City, Country" className="h-8 text-sm" />
                </Field>
              </div>
            </div>

            <Separator />

            {/* ── Health & Preferences ── */}
            <div className="px-5 pt-4 pb-5 space-y-4">
              <SectionTitle>Health & Preferences</SectionTitle>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Dietary Requirements / Food Preferences">
                  <Textarea rows={3} value={form.dietaryRequirements} onChange={set('dietaryRequirements')}
                    placeholder="Vegetarian, Halal…" className="text-sm resize-none" />
                </Field>
                <Field label="Food Allergies">
                  <Textarea rows={3} value={form.allergies} onChange={set('allergies')}
                    placeholder="Shellfish, Peanuts…" className="text-sm resize-none" />
                </Field>
              </div>

              <Field label="Drink Preferences">
                <Input value={form.drinkPreferences} onChange={set('drinkPreferences')}
                  placeholder="e.g. Coffee, Beer, Wine, Juice…" className="h-8 text-sm" />
              </Field>

              <Field label="Equipment Sizes">
                <Input value={form.equipmentSizes} onChange={set('equipmentSizes')}
                  placeholder="e.g. Wetsuit M, Fins L, BCD S" className="h-8 text-sm" />
              </Field>

              <Field label="Operational Notes">
                <Textarea rows={3} value={form.operationalNotes} onChange={set('operationalNotes')}
                  placeholder="Internal crew notes…" className="text-sm resize-none" />
              </Field>
            </div>

          </div>
        )}

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-3.5 border-t flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-8 px-4 text-sm">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !form.firstName.trim()}
            className="h-8 px-5 text-sm bg-[#1a5f6e] hover:bg-[#145260] text-white"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Guest'}
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}
