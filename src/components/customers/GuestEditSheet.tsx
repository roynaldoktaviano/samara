'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, User, Mail, Phone, CreditCard, CalendarDays, MapPin, Utensils, AlertCircle, Shirt, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'

interface GuestFormState {
  firstName: string; lastName: string; gender: string
  email: string; phone: string; passport: string
  dateOfBirth: string; address: string
  dietaryRequirements: string; allergies: string
  equipmentSizes: string; operationalNotes: string
}

const EMPTY: GuestFormState = {
  firstName: '', lastName: '', gender: '', email: '', phone: '',
  passport: '', dateOfBirth: '', address: '',
  dietaryRequirements: '', allergies: '', equipmentSizes: '', operationalNotes: '',
}

function toFormState(data: any): GuestFormState {
  // Fall back to splitting name when firstName/lastName not yet populated
  const parts = (data.name ?? '').trim().split(/\s+/)
  const fallbackFirst = parts[0] ?? ''
  const fallbackLast  = parts.slice(1).join(' ')

  return {
    firstName:           data.firstName           || fallbackFirst,
    lastName:            data.lastName            || fallbackLast,
    gender:              data.gender              ?? '',
    email:               data.email               ?? '',
    phone:               data.phone               ?? '',
    passport:            data.passport            ?? '',
    dateOfBirth:         data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
    address:             data.address             ?? '',
    dietaryRequirements: data.dietaryRequirements ?? '',
    allergies:           data.allergies           ?? '',
    equipmentSizes:      data.equipmentSizes      ?? '',
    operationalNotes:    data.operationalNotes    ?? '',
  }
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function FieldRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[20px_1fr] gap-3 items-start">
      <Icon className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</Label>
        {children}
      </div>
    </div>
  )
}

interface Props {
  guestId: string | null
  onClose: () => void
  onSaved?: () => void
}

export default function GuestEditSheet({ guestId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<GuestFormState>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [guestName, setGuestName] = useState('')

  useEffect(() => {
    if (!guestId) return
    setLoading(true)
    setForm(EMPTY)
    setGuestName('')
    fetch(`/api/customers/${guestId}`)
      .then(r => r.json())
      .then(data => {
        setGuestName(data.name ?? '')
        setForm(toFormState(data))
      })
      .finally(() => setLoading(false))
  }, [guestId])

  const set = (k: keyof GuestFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleSave = async () => {
    if (!guestId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${guestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Guest profile updated')
      onSaved?.()
      onClose()
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || guestName

  return (
    <Sheet open={!!guestId} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="w-100 sm:w-115 p-0 flex flex-col overflow-hidden border-l">

        {/* ── Header ── */}
        <div className="bg-[#1a5f6e] px-6 pt-8 pb-6 text-white shrink-0">
          <SheetHeader>
            <SheetTitle className="sr-only">Edit Guest</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold shrink-0 ring-2 ring-white/30">
              {loading ? <Loader2 className="h-5 w-5 animate-spin opacity-70" /> : (displayName ? getInitials(displayName) : <User className="h-6 w-6 opacity-70" />)}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-white/60 font-medium mb-0.5">Guest Profile</p>
              <h2 className="text-xl font-bold truncate">{loading ? 'Loading…' : (displayName || '—')}</h2>
              {form.gender && !loading && (
                <span className="inline-block mt-1 text-[10px] bg-white/15 px-2 py-0.5 rounded-full">{form.gender}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* Guest Information section */}
            <div className="px-6 pt-5 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Guest Information</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-4">
                {/* Name row */}
                <FieldRow icon={User} label="Name">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={form.firstName}
                      onChange={set('firstName')}
                      placeholder="First name"
                      className="h-9 text-sm"
                    />
                    <Input
                      value={form.lastName}
                      onChange={set('lastName')}
                      placeholder="Last name"
                      className="h-9 text-sm"
                    />
                  </div>
                </FieldRow>

                <div className="grid grid-cols-2 gap-4">
                  <FieldRow icon={User} label="Gender">
                    <Select value={form.gender} onValueChange={v => setForm(prev => ({ ...prev, gender: v }))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow icon={CalendarDays} label="Date of Birth">
                    <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className="h-9 text-sm" />
                  </FieldRow>
                </div>

                <FieldRow icon={Mail} label="Email">
                  <Input type="email" value={form.email} onChange={set('email')} placeholder="john@email.com" className="h-9 text-sm" />
                </FieldRow>

                <div className="grid grid-cols-2 gap-4">
                  <FieldRow icon={Phone} label="Phone">
                    <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+62 812..." className="h-9 text-sm" />
                  </FieldRow>
                  <FieldRow icon={CreditCard} label="Passport / ID">
                    <Input value={form.passport} onChange={set('passport')} placeholder="A1234567" className="h-9 text-sm" />
                  </FieldRow>
                </div>

                <FieldRow icon={MapPin} label="Address">
                  <Input value={form.address} onChange={set('address')} placeholder="City, Country" className="h-9 text-sm" />
                </FieldRow>
              </div>
            </div>

            {/* Special Requirements section */}
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Health & Requirements</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-4">
                <FieldRow icon={Utensils} label="Dietary Requirements">
                  <Textarea
                    rows={2}
                    value={form.dietaryRequirements}
                    onChange={set('dietaryRequirements')}
                    placeholder="e.g. Vegetarian, Halal, Vegan..."
                    className="text-sm resize-none"
                  />
                </FieldRow>
                <FieldRow icon={AlertCircle} label="Allergies">
                  <Textarea
                    rows={2}
                    value={form.allergies}
                    onChange={set('allergies')}
                    placeholder="e.g. Shellfish, Peanuts..."
                    className="text-sm resize-none"
                  />
                </FieldRow>
                <FieldRow icon={Shirt} label="Equipment Sizes">
                  <Input value={form.equipmentSizes} onChange={set('equipmentSizes')} placeholder="e.g. Wetsuit M, Fins L" className="h-9 text-sm" />
                </FieldRow>
                <FieldRow icon={ClipboardList} label="Operational Notes">
                  <Textarea
                    rows={2}
                    value={form.operationalNotes}
                    onChange={set('operationalNotes')}
                    placeholder="Crew-facing notes..."
                    className="text-sm resize-none"
                  />
                </FieldRow>
              </div>
            </div>

          </div>
        )}

        {/* ── Footer ── */}
        <div className="shrink-0 px-6 py-4 border-t bg-muted/30 flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving} className="min-w-20">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !form.firstName.trim()}
            className="min-w-30 bg-[#1a5f6e] hover:bg-[#145260] text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}
