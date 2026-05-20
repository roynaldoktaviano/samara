'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Loader2, User, Link2, Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

/* ── Types ── */
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

type SheetTab = 'profile' | 'medical' | 'food' | 'drinks' | 'diving'

const BASE_TABS: { id: SheetTab; label: string }[] = [
  { id: 'profile',  label: 'Profile'  },
  { id: 'medical',  label: 'Medical'  },
  { id: 'food',     label: 'Food'     },
  { id: 'drinks',   label: 'Drinks'   },
]

/* ── Small helpers ── */
function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Field({ label, children, col2 }: { label: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={col2 ? 'col-span-2' : ''}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function YesNo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">Yes</SelectItem>
        <SelectItem value="no">No</SelectItem>
      </SelectContent>
    </Select>
  )
}

/* ── Section components ── */
function ProfileTab({ form, setForm, isEdit }: { form: GuestFormState; setForm: (f: GuestFormState) => void; isEdit: boolean }) {
  const set = (k: keyof GuestFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value })

  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Personal Information</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name *">
            <Input value={form.firstName} onChange={set('firstName')} placeholder="First name" className="h-8 text-sm" />
          </Field>
          <Field label="Last Name">
            <Input value={form.lastName} onChange={set('lastName')} placeholder="Last name" className="h-8 text-sm" />
          </Field>
          <Field label="Gender">
            <Select value={form.gender} onValueChange={v => setForm({ ...form, gender: v })}>
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
          <Field label="Nationality">
            <Input value={form.nationality} onChange={set('nationality')} placeholder="Indonesian, Australian…" className="h-8 text-sm" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" className="h-8 text-sm" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+62 812 3456 7890" className="h-8 text-sm" />
          </Field>
          <Field label="Emergency Contact">
            <Input value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Name & phone" className="h-8 text-sm" />
          </Field>
          <Field label="Passport / ID Number">
            <Input value={form.passport} onChange={set('passport')} placeholder="A1234567" className="h-8 text-sm" />
          </Field>
          <Field label="Passport Expiry">
            <Input type="date" value={form.passportExpiry} onChange={set('passportExpiry')} className="h-8 text-sm" />
          </Field>
          <Field label="Address" col2>
            <Input value={form.address} onChange={set('address')} placeholder="City, Country" className="h-8 text-sm" />
          </Field>
        </div>
      </div>

      {isEdit && (
        <div>
          <SectionTitle>General Preferences</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dietary Requirements / Food Preferences">
              <Textarea rows={2} value={form.dietaryRequirements} onChange={set('dietaryRequirements')}
                placeholder="Vegetarian, Halal…" className="text-sm resize-none" />
            </Field>
            <Field label="Food Allergies">
              <Textarea rows={2} value={form.allergies} onChange={set('allergies')}
                placeholder="Shellfish, Peanuts…" className="text-sm resize-none" />
            </Field>
            <Field label="Drink Preferences">
              <Input value={form.drinkPreferences} onChange={set('drinkPreferences')}
                placeholder="Coffee, Beer, Wine…" className="h-8 text-sm" />
            </Field>
            <Field label="Equipment Sizes">
              <Input value={form.equipmentSizes} onChange={set('equipmentSizes')}
                placeholder="Wetsuit M, Fins L, BCD S" className="h-8 text-sm" />
            </Field>
            <Field label="Operational Notes" col2>
              <Textarea rows={2} value={form.operationalNotes} onChange={set('operationalNotes')}
                placeholder="Internal crew notes…" className="text-sm resize-none" />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

function JsonTab({ data, onChange, fields }: {
  data: any
  onChange: (k: string, v: string) => void
  fields: { key: string; label: string; type?: string; options?: string[]; rows?: number; col2?: boolean }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(f => (
        <Field key={f.key} label={f.label} col2={f.col2}>
          {f.options ? (
            <Select value={data[f.key] ?? ''} onValueChange={v => onChange(f.key, v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {f.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : f.type === 'yesno' ? (
            <YesNo value={data[f.key] ?? ''} onChange={v => onChange(f.key, v)} />
          ) : f.rows ? (
            <Textarea rows={f.rows}
              value={data[f.key] ?? ''}
              onChange={e => onChange(f.key, e.target.value)}
              className="text-sm resize-none"
            />
          ) : (
            <Input type={f.type ?? 'text'}
              value={data[f.key] ?? ''}
              onChange={e => onChange(f.key, e.target.value)}
              className="h-8 text-sm"
            />
          )}
        </Field>
      ))}
    </div>
  )
}

const MEDICAL_FIELDS = [
  { key: 'medicalConditions',          label: 'Medical Conditions',           rows: 2 },
  { key: 'medications',                label: 'Medications',                  rows: 2 },
  { key: 'foodAllergy',                label: 'Food Allergy',                 type: 'yesno' },
  { key: 'foodAllergyDetails',         label: 'Food Allergy Details',         rows: 2 },
  { key: 'otherAllergies',             label: 'Other Allergies',              rows: 2 },
  { key: 'motionSickness',             label: 'Motion Sickness',              type: 'yesno' },
  { key: 'physicalLimitations',        label: 'Physical Limitations',         rows: 2 },
  { key: 'specialAssistance',          label: 'Special Assistance Required',  type: 'yesno' },
  { key: 'emergencyContactName',       label: 'Emergency Contact Name',       },
  { key: 'emergencyContactRelationship', label: 'Relationship',               },
  { key: 'emergencyContactPhone',      label: 'Emergency Phone',              type: 'tel' },
  { key: 'emergencyContactEmail',      label: 'Emergency Email',              type: 'email', col2: true },
]

const FOOD_FIELDS = [
  { key: 'dietaryType',        label: 'Dietary Type',          },
  { key: 'allergy',            label: 'Allergy',               options: ['None','Nuts','Shellfish','Dairy','Gluten','Other'] },
  { key: 'allergyDetails',     label: 'Allergy Details',       rows: 2 },
  { key: 'dislikes',           label: 'Dislikes',              rows: 2 },
  { key: 'favoriteFoods',      label: 'Favorite Foods',        rows: 2 },
  { key: 'breakfastPreference',label: 'Breakfast Preference',  },
  { key: 'lactoseIntolerant',  label: 'Lactose Intolerant',    type: 'yesno' },
  { key: 'glutenFree',         label: 'Gluten Free',           type: 'yesno' },
  { key: 'halal',              label: 'Halal',                 type: 'yesno' },
  { key: 'vegetarian',         label: 'Vegetarian',            type: 'yesno' },
  { key: 'vegan',              label: 'Vegan',                 type: 'yesno' },
  { key: 'pescatarian',        label: 'Pescatarian',           type: 'yesno' },
  { key: 'kosher',             label: 'Kosher',                type: 'yesno' },
  { key: 'snackPreference',    label: 'Snack Preference',      },
]

const DRINKS_FIELDS = [
  { key: 'drinksAlcohol',      label: 'Drinks Alcohol',        type: 'yesno' },
  { key: 'winePreference',     label: 'Wine Preference',       },
  { key: 'spiritsPreference',  label: 'Spirits Preference',    },
  { key: 'cocktailPreference', label: 'Cocktail Preference',   },
  { key: 'beerPreference',     label: 'Beer Preference',       },
  { key: 'coffeePreference',   label: 'Coffee Preference',     },
  { key: 'teaPreference',      label: 'Tea Preference',        },
  { key: 'softDrinkPreference',label: 'Soft Drink Preference', },
  { key: 'waterPreference',    label: 'Water Preference',      },
  { key: 'drinkNotes',         label: 'Notes',                 rows: 2, col2: true },
]

const DIVING_FIELDS = [
  { key: 'isDiver',           label: 'Is Diver',               type: 'yesno' },
  { key: 'diveLevel',         label: 'Dive Level',             options: ['Beginner','Open Water','Advanced','Rescue Diver','Divemaster','Instructor'] },
  { key: 'certAgency',        label: 'Certification Agency',   },
  { key: 'diveCount',         label: 'Number of Dives',        type: 'number' },
  { key: 'lastDiveDate',      label: 'Last Dive Date',         type: 'date' },
  { key: 'diveRentalRequired',label: 'Equipment Rental',       type: 'yesno' },
  { key: 'wetsuitSize',       label: 'Wetsuit Size',           },
  { key: 'bcdSize',           label: 'BCD Size',               },
  { key: 'finsSize',          label: 'Fins Size',              },
  { key: 'maskSize',          label: 'Mask Size',              },
  { key: 'divingNotes',       label: 'Diving Notes',           rows: 2, col2: true },
]

interface Props {
  open: boolean
  guestId?: string | null
  bookingGuestId?: string | null
  hasDiving?: boolean
  onClose: () => void
  onSaved?: (guest: any) => void
}

export default function GuestEditSheet({ open, guestId, bookingGuestId, hasDiving = false, onClose, onSaved }: Props) {
  const isEdit = !!guestId
  const [activeTab, setActiveTab] = useState<SheetTab>('profile')

  const [form, setForm]           = useState<GuestFormState>(GUEST_FORM_EMPTY)
  const [medData, setMedData]     = useState<any>({})
  const [foodData, setFoodData]   = useState<any>({})
  const [drinkData, setDrinkData] = useState<any>({})
  const [divData, setDivData]     = useState<any>({})

  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [guestName, setGuestName]     = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [guestLink, setGuestLink]     = useState('')
  const [linkCopied, setLinkCopied]   = useState(false)

  useEffect(() => {
    if (!open) { setGuestLink(''); setLinkCopied(false); setActiveTab('profile'); return }
    if (!guestId) {
      setForm(GUEST_FORM_EMPTY)
      setMedData({}); setFoodData({}); setDrinkData({}); setDivData({})
      setGuestName('')
      return
    }
    setLoading(true)
    fetch(`/api/customers/${guestId}`)
      .then(r => r.json())
      .then(data => {
        setGuestName(data.name ?? '')
        setForm(toGuestFormState(data))
        setMedData(data.medicalData  ?? {})
        setFoodData(data.foodData    ?? {})
        setDrinkData(data.drinksData ?? {})
        setDivData(data.divingData   ?? {})
      })
      .finally(() => setLoading(false))
  }, [open, guestId, bookingGuestId])

  const jsonSetter = (setter: (d: any) => void) => (k: string, v: string) =>
    setter((prev: any) => ({ ...prev, [k]: v }))

  const handleGenerateLink = async () => {
    if (!guestId) return
    setGeneratingLink(true)
    try {
      const res = await fetch(`/api/customers/${guestId}/generate-link`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const { link } = await res.json()
      setGuestLink(bookingGuestId ? `${link}?bg=${bookingGuestId}` : link)
    } catch {
      toast.error('Failed to generate link')
    } finally {
      setGeneratingLink(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(guestLink)
    setLinkCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const handleSave = async () => {
    if (!form.firstName.trim()) return
    setSaving(true)
    try {
      const body = {
        ...form,
        ...(isEdit && {
          medicalData:  medData,
          foodData:     foodData,
          drinksData:   drinkData,
          ...(hasDiving && { divingData: divData }),
        }),
      }
      const res = isEdit
        ? await fetch(`/api/customers/${guestId}`, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/customers',             { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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

  const allTabs: { id: SheetTab; label: string }[] = hasDiving
    ? [...BASE_TABS, { id: 'diving', label: 'Diving' }]
    : BASE_TABS
  const visibleTabs = isEdit ? allTabs : allTabs.filter(t => t.id === 'profile')

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-[95vw] sm:w-180 sm:max-w-none p-0 flex flex-col overflow-hidden">
        <SheetTitle className="sr-only">{isEdit ? 'Edit Guest' : 'Add Guest'}</SheetTitle>

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

        {/* Tab bar */}
        {isEdit && (
          <div className="shrink-0 bg-white border-b">
            <div className="flex overflow-x-auto scrollbar-none">
              {visibleTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
                    activeTab === tab.id
                      ? 'border-[#1a5f6e] text-[#1a5f6e]'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {activeTab === 'profile' && (
              <ProfileTab form={form} setForm={setForm} isEdit={isEdit} />
            )}
            {activeTab === 'medical' && (
              <JsonTab data={medData} onChange={jsonSetter(setMedData)} fields={MEDICAL_FIELDS} />
            )}
            {activeTab === 'food' && (
              <JsonTab data={foodData} onChange={jsonSetter(setFoodData)} fields={FOOD_FIELDS} />
            )}
            {activeTab === 'drinks' && (
              <JsonTab data={drinkData} onChange={jsonSetter(setDrinkData)} fields={DRINKS_FIELDS} />
            )}
            {activeTab === 'diving' && (
              <JsonTab data={divData} onChange={jsonSetter(setDivData)} fields={DIVING_FIELDS} />
            )}

          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t space-y-2.5">
          {isEdit && (
            <div className="flex items-center gap-2">
              {guestLink ? (
                <>
                  <div className="flex-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 min-w-0">
                    <Link2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="flex-1 text-xs text-emerald-700 truncate font-mono">{guestLink}</span>
                  </div>
                  <button onClick={copyLink} className="shrink-0 p-1.5 rounded text-emerald-700 hover:bg-emerald-50 border border-emerald-200" title="Copy link">
                    {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <a href={guestLink} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 rounded text-emerald-700 hover:bg-emerald-50 border border-emerald-200" title="Open in new tab">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={handleGenerateLink} disabled={generatingLink}
                  className="h-8 text-xs gap-1.5 border-dashed">
                  {generatingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                  Generate Guest Form Link
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="h-8 px-4 text-sm">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || loading || !form.firstName.trim()}
              className="h-8 px-5 text-sm bg-[#1a5f6e] hover:bg-[#145260] text-white"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Guest'}
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}
