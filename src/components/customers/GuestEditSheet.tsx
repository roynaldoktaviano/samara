'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Loader2, User, Check, ChevronsUpDown, Search } from 'lucide-react'
import { toast } from 'sonner'
import { NATIONALITIES } from '@/lib/nationalities'
import { compressImage } from '@/lib/compressImage'

/* ── Types ── */
export interface GuestFormState {
  firstName: string; lastName: string; gender: string
  email: string; phone: string; passport: string
  dateOfBirth: string; address: string; nationality: string
  passportExpiry: string; emergencyContact: string
  operationalNotes: string
}

export const GUEST_FORM_EMPTY: GuestFormState = {
  firstName: '', lastName: '', gender: '', email: '', phone: '',
  passport: '', dateOfBirth: '', address: '', nationality: '',
  passportExpiry: '', emergencyContact: '',
  operationalNotes: '',
}

export function toGuestFormState(data: any): GuestFormState {
  const parts = (data.name ?? '').trim().split(/\s+/)
  return {
    firstName:        data.firstName        || parts[0]                 || '',
    lastName:         data.lastName         || parts.slice(1).join(' ') || '',
    gender:           data.gender           ?? '',
    email:            data.email            ?? '',
    phone:            data.phone            ?? '',
    passport:         data.passport         ?? '',
    dateOfBirth:      data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
    address:          data.address          ?? '',
    nationality:      data.nationality      ?? '',
    passportExpiry:   data.passportExpiry ? data.passportExpiry.split('T')[0] : '',
    emergencyContact: data.emergencyContact ?? '',
    operationalNotes: data.operationalNotes ?? '',
  }
}

type SheetTab = 'profile' | 'medical' | 'food' | 'drinks' | 'diving'

const ALL_TABS: { id: SheetTab; label: string }[] = [
  { id: 'profile',  label: 'Profile'  },
  { id: 'medical',  label: 'Medical'  },
  { id: 'food',     label: 'Food'     },
  { id: 'drinks',   label: 'Drinks'   },
  { id: 'diving',   label: 'Diving'   },
]


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

function YesNo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5">
      <button type="button" onClick={() => onChange(value === 'yes' ? '' : 'yes')}
        className={['flex-1 h-7 rounded text-xs font-semibold border transition-all',
          value === 'yes' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-background text-muted-foreground border-border hover:bg-muted/40',
        ].join(' ')}>Yes</button>
      <button type="button" onClick={() => onChange(value === 'no' ? '' : 'no')}
        className={['flex-1 h-7 rounded text-xs font-semibold border transition-all',
          value === 'no' ? 'bg-red-400 text-white border-red-400' : 'bg-background text-muted-foreground border-border hover:bg-muted/40',
        ].join(' ')}>No</button>
    </div>
  )
}

/* ── Image upload helper ── */
function ImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (b64: string) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    compressImage(file).then(onChange).catch(() => {})
  }
  return (
    <div>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5 space-y-2">
        {value ? (
          <div className="relative group w-full">
            <img src={value} alt={label} className="w-full max-h-48 object-contain rounded-lg border bg-muted/20" />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >✕</button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
            <span className="text-xs text-muted-foreground">Click to upload</span>
            <span className="text-[10px] text-muted-foreground/60 mt-0.5">JPG, PNG, PDF</span>
            <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFile} />
          </label>
        )}
      </div>
    </div>
  )
}

/* ── Section components ── */
function ProfileTab({ form, setForm, passportImage, onPassportImage }: {
  form: GuestFormState
  setForm: (f: GuestFormState) => void
  passportImage: string
  onPassportImage: (v: string) => void
}) {
  const set = (k: keyof GuestFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value })

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Personal Information</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name *" hint="Legal name exactly as on passport">
            <Input value={form.firstName} onChange={set('firstName')} placeholder="First name" className="h-8 text-sm" />
          </Field>
          <Field label="Last Name" hint="Legal surname exactly as on passport">
            <Input value={form.lastName} onChange={set('lastName')} placeholder="Last name" className="h-8 text-sm" />
          </Field>
          <Field label="Gender" hint="Used for crew briefing and cabin assignment">
            <Select value={form.gender} onValueChange={v => setForm({ ...form, gender: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date of Birth" hint="Used to determine age category (adult / child)">
            <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className="h-8 text-sm" />
          </Field>
          <Field label="Nationality" hint="Country of citizenship as stated on passport">
            <NationalitySelect value={form.nationality} onChange={v => setForm({ ...form, nationality: v })} />
          </Field>
          <Field label="Email" hint="Used for booking confirmations and communications">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" className="h-8 text-sm" />
          </Field>
          <Field label="Phone" hint="WhatsApp number preferred, with country code">
            <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+62 812 3456 7890" className="h-8 text-sm" />
          </Field>
          <Field label="Emergency Contact" hint="Full name and phone number of the emergency contact">
            <Input value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Name & phone" className="h-8 text-sm" />
          </Field>
          <Field label="Passport / ID Number" hint="As printed on the travel document">
            <Input value={form.passport} onChange={set('passport')} placeholder="A1234567" className="h-8 text-sm" />
          </Field>
          <Field label="Passport Expiry" hint="Must be valid for at least 6 months past travel date">
            <Input type="date" value={form.passportExpiry} onChange={set('passportExpiry')} className="h-8 text-sm" />
          </Field>
          <Field label="Address" hint="City and country of residence" col2>
            <Input value={form.address} onChange={set('address')} placeholder="City, Country" className="h-8 text-sm" />
          </Field>
          <Field label="Passport Scan" hint="Upload a photo or scan of the passport data page" col2>
            <ImageUpload label="Passport Scan" value={passportImage} onChange={onPassportImage} />
          </Field>
        </div>
      </div>

      <div>
        <SectionTitle>Notes</SectionTitle>
        <Textarea rows={3} value={form.operationalNotes} onChange={set('operationalNotes')}
          placeholder="Internal crew notes…" className="text-sm resize-none" />
        <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">Internal notes visible to crew and operations team only</p>
      </div>
    </div>
  )
}

function JsonTab({ data, onChange, fields }: {
  data: any
  onChange: (k: string, v: string) => void
  fields: { key: string; label: string; hint?: string; type?: string; options?: string[]; rows?: number; col2?: boolean }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 items-start">
      {fields.map(f => {
        if (f.type === 'section') {
          return (
            <div key={f.key} className={`${f.col2 ? 'col-span-2' : ''} flex items-center gap-2 pt-1`}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{f.label}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )
        }
        return (
          <Field key={f.key} label={f.label} hint={f.hint} col2={f.col2}>
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
        )
      })}
    </div>
  )
}

const MEDICAL_FIELDS = [
  { key: 'medicalConditions',            label: 'Medical Conditions',          hint: 'Any diagnosed conditions the crew should be aware of',         rows: 2 },
  { key: 'medications',                  label: 'Medications',                 hint: 'Current medications including name and dosage',                rows: 2 },
  { key: 'foodAllergy',                  label: 'Food Allergy',                hint: 'Does the guest have any food allergies?',                      type: 'yesno' },
  { key: 'foodAllergyDetails',           label: 'Food Allergy Details',        hint: 'Describe the allergy and severity',                            rows: 2 },
  { key: 'otherAllergies',               label: 'Other Allergies',             hint: 'e.g. latex, sunscreen, insect bites',                          rows: 2 },
  { key: 'motionSickness',               label: 'Motion Sickness',             hint: 'Is the guest prone to seasickness?',                           type: 'yesno' },
  { key: 'physicalLimitations',          label: 'Physical Limitations',        hint: 'Any mobility or physical restrictions the crew should know',   rows: 2 },
  { key: 'specialAssistance',            label: 'Special Assistance Required', hint: 'Does the guest need any special assistance on board?',         type: 'yesno' },
  { key: '_emergency',                   label: 'Emergency Contact',           type: 'section', col2: true },
  { key: 'emergencyContactName',         label: 'Name',                        hint: 'Full name of the person to contact in an emergency' },
  { key: 'emergencyContactRelationship', label: 'Relationship',                hint: 'e.g. Spouse, Parent, Sibling, Friend' },
  { key: 'emergencyContactPhone',        label: 'Emergency Phone',             hint: 'Phone number with country code',                               type: 'tel' },
  { key: 'emergencyContactEmail',        label: 'Emergency Email',             hint: 'Email address of the emergency contact',                       type: 'email', col2: true },
]

const FOOD_FIELDS = [
  { key: 'dietaryType',         label: 'Dietary Type',         hint: 'e.g. Omnivore, Vegetarian, Vegan, Halal' },
  { key: 'allergy',             label: 'Allergy',              hint: 'Select the primary food allergy',         options: ['None','Nuts','Shellfish','Dairy','Gluten','Other'] },
  { key: 'allergyDetails',      label: 'Allergy Details',      hint: 'Describe the allergy and severity level', rows: 2 },
  { key: 'dislikes',            label: 'Dislikes',             hint: 'Ingredients or dishes to avoid',          rows: 2 },
  { key: 'favoriteFoods',       label: 'Favorite Foods',       hint: 'Foods the guest particularly enjoys',     rows: 2, col2: true },
  { key: 'breakfastPreference', label: 'Breakfast Preference', hint: 'e.g. Continental, Full English, Light' },
  { key: 'snackPreference',     label: 'Snack Preference',     hint: 'e.g. Fruit, Nuts, Chips, Chocolate' },
  { key: '_restrictions',       label: 'Dietary Restrictions', type: 'section', col2: true },
  { key: 'lactoseIntolerant',   label: 'Lactose Intolerant',   hint: 'Avoid all dairy products',                type: 'yesno' },
  { key: 'glutenFree',          label: 'Gluten Free',          hint: 'Avoid gluten-containing foods',           type: 'yesno' },
  { key: 'halal',               label: 'Halal',                hint: 'Halal-certified food required',           type: 'yesno' },
  { key: 'vegetarian',          label: 'Vegetarian',           hint: 'No meat or fish',                         type: 'yesno' },
  { key: 'vegan',               label: 'Vegan',                hint: 'No animal products whatsoever',           type: 'yesno' },
  { key: 'pescatarian',         label: 'Pescatarian',          hint: 'No meat, but fish is fine',               type: 'yesno' },
  { key: 'kosher',              label: 'Kosher',               hint: 'Kosher-certified food required',          type: 'yesno' },
]

const DRINKS_FIELDS = [
  { key: 'drinksAlcohol',       label: 'Drinks Alcohol',       hint: 'Will the guest consume alcoholic beverages?',     type: 'yesno' },
  { key: '_alcoholic',          label: 'Alcoholic',            type: 'section' },
  { key: 'winePreference',      label: 'Wine',                 hint: 'e.g. Red, White, Rosé, Champagne' },
  { key: 'spiritsPreference',   label: 'Spirits',              hint: 'e.g. Whisky, Vodka, Gin, Rum' },
  { key: 'cocktailPreference',  label: 'Cocktails',            hint: 'Favorite cocktails or mixers' },
  { key: 'beerPreference',      label: 'Beer',                 hint: 'e.g. Lager, Craft IPA, Non-alcoholic' },
  { key: '_nonalcoholic',       label: 'Non-Alcoholic',        type: 'section' },
  { key: 'coffeePreference',    label: 'Coffee',               hint: 'e.g. Espresso, Flat White, Cappuccino, No coffee' },
  { key: 'teaPreference',       label: 'Tea',                  hint: 'e.g. English Breakfast, Green Tea, Herbal' },
  { key: 'softDrinkPreference', label: 'Soft Drinks',          hint: 'e.g. Cola, Juice, Sparkling water' },
  { key: 'waterPreference',     label: 'Water',                hint: 'Still or sparkling, brand preference' },
  { key: 'drinkNotes',          label: 'Notes',                hint: 'Any other drink preferences or restrictions',     rows: 2, col2: true },
]

const DIVING_FIELDS = [
  { key: 'isDiver',            label: 'Is Diver',              hint: 'Is the guest a certified diver?',                                     type: 'yesno' },
  { key: 'diveLevel',          label: 'Dive Level',            hint: 'Highest certification level achieved',                                options: ['Beginner','Open Water','Advanced','Rescue Diver','Divemaster','Instructor'] },
  { key: 'certAgency',         label: 'Certification Agency',  hint: 'e.g. PADI, SSI, NAUI, CMAS' },
  { key: 'diveCount',          label: 'Number of Dives',       hint: 'Total number of logged dives',                                        type: 'number' },
  { key: 'lastDiveDate',       label: 'Last Dive Date',        hint: 'Date of most recent dive',                                            type: 'date' },
  { key: 'diveRentalRequired', label: 'Equipment Rental',      hint: 'Does the guest need to rent dive equipment on board?',                type: 'yesno' },
  { key: 'wetsuitSize',        label: 'Wetsuit Size',          hint: 'e.g. XS, S, M, L, XL' },
  { key: 'bcdSize',            label: 'BCD Size',              hint: 'e.g. XS, S, M, L, XL' },
  { key: 'finsSize',           label: 'Fins Size',             hint: 'Foot size or fin size (EU / US)' },
  { key: 'maskSize',           label: 'Mask Size',             hint: 'Standard or wide-face' },
  { key: 'divingNotes',        label: 'Diving Notes',          hint: 'Any special diving requirements or requests',                         rows: 2, col2: true },
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
  const [passportImage, setPassportImage] = useState('')
  useEffect(() => {
    if (!open) { setActiveTab('profile'); return }
    if (!guestId) {
      setForm(GUEST_FORM_EMPTY)
      setMedData({}); setFoodData({}); setDrinkData({}); setDivData({})
      setPassportImage('')
      setGuestName('')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/customers/${guestId}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setGuestName(data.name ?? '')
        setForm(toGuestFormState(data))
        setMedData(data.medicalData  ?? {})
        setFoodData(data.foodData    ?? {})
        setDrinkData(data.drinksData ?? {})
        setDivData(data.divingData   ?? {})
        setPassportImage(data.passportImage ?? '')
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [open, guestId])

  const jsonSetter = (setter: (d: any) => void) => (k: string, v: string) =>
    setter((prev: any) => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.firstName.trim()) return
    setSaving(true)
    try {
      const body = {
        ...form,
        medicalData:   medData,
        foodData:      foodData,
        drinksData:    drinkData,
        divingData:    divData,
        passportImage: passportImage || null,
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

  const visibleTabs = ALL_TABS

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

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {activeTab === 'profile' && (
              <ProfileTab form={form} setForm={setForm}
                passportImage={passportImage} onPassportImage={setPassportImage} />
            )}
            {activeTab === 'medical' && (
              <div className="space-y-1">
                <JsonTab data={medData} onChange={jsonSetter(setMedData)} fields={MEDICAL_FIELDS} />
              </div>
            )}
            {activeTab === 'food' && (
              <div className="space-y-1">
                <JsonTab data={foodData} onChange={jsonSetter(setFoodData)} fields={FOOD_FIELDS} />
              </div>
            )}
            {activeTab === 'drinks' && (
              <div className="space-y-1">
                <JsonTab data={drinkData} onChange={jsonSetter(setDrinkData)} fields={DRINKS_FIELDS} />
              </div>
            )}
            {activeTab === 'diving' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Is Diver" hint="Is the guest a certified diver?">
                    <YesNo value={divData.isDiver ?? ''} onChange={v => setDivData((prev: any) => ({ ...prev, isDiver: v }))} />
                  </Field>
                </div>
                <div className={divData.isDiver === 'no' ? 'opacity-40 pointer-events-none select-none' : ''}>
                  <JsonTab data={divData} onChange={jsonSetter(setDivData)} fields={DIVING_FIELDS.filter(f => f.key !== 'isDiver')} />
                  <div className="mt-6">
                    <SectionTitle>Diving Certificate</SectionTitle>
                    <ImageUpload
                      label="Upload Certificate"
                      value={divData.certImage ?? ''}
                      onChange={v => setDivData((prev: any) => ({ ...prev, certImage: v }))}
                    />
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">Upload a photo or scan of the guest's dive certification card</p>
                  </div>
                </div>
              </div>
            )}

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
              {isEdit ? 'Save Changes' : 'Add Guest'}
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}
