'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'next/navigation'
import { CheckCircle, Loader2, ChevronRight, ChevronLeft, ChevronDown, Save, Calendar, MapPin, Ship, Anchor, Lock, User, Users, Camera, FileText, Wrench, X as XIcon, Plus, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFileDrop } from '@/hooks/useFileDrop'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'
const TEAL = '#1a5f6e'
const GOLD = '#bdac7e'

type Section = 'profile' | 'medical' | 'food' | 'drinks' | 'diving' | 'travel'
type GuestScopedSection = 'profile' | 'diving'
const GUEST_SCOPED: GuestScopedSection[] = ['profile', 'diving']
const SHARED_SECTIONS: Section[] = ['travel', 'medical', 'food', 'drinks']

interface TripInfo {
  bookingCode: string
  startDate: string
  endDate: string
  destination: string
  yachtName: string
  tripTitle: string | null
  tripType: string
  capacity: number | null
}

interface GuestRecord {
  bookingGuestId: string
  isLead: boolean
  id: string
  name: string
  firstName: string
  lastName: string
  gender: string
  email: string
  phone: string
  passport: string
  dateOfBirth: string
  address: string
  nationality: string
  passportExpiry: string
  passportImage?: string
  divingData: any
}

interface TravelData {
  arrivalPickupTime: string
  arrivalHotel: string
  arrivalFlight: string
  departurePickupTime: string
  departureHotel: string
  departureFlight: string
}

interface BookingFormData {
  tripInfo: TripInfo
  hasDiving: boolean
  guests: GuestRecord[]
  travel: TravelData | null
  medical: any
  food: any
  drinks: any
  expiresAt: string
}

/* ── Shared field-level components ── */
const inputCls  = `w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[${TEAL}]/30 focus:border-[${TEAL}] bg-white placeholder:text-gray-300 transition-all`
const selectCls = `w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[${TEAL}]/30 focus:border-[${TEAL}] bg-white text-gray-700 transition-all`
const textCls   = `w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[${TEAL}]/30 focus:border-[${TEAL}] bg-white placeholder:text-gray-300 transition-all resize-none`

function Field({ label, children, full, style }: { label: string; children: React.ReactNode; full?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''} style={style}>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function YesNo({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={selectCls}>
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )
}

const NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Argentine', 'Armenian', 'Australian', 'Austrian',
  'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi', 'Barbadian', 'Belarusian', 'Belgian', 'Belizean', 'Beninese', 'Bhutanese',
  'Bolivian', 'Bosnian', 'Brazilian', 'British', 'Bruneian', 'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian', 'Cambodian',
  'Cameroonian', 'Canadian', 'Cape Verdean', 'Central African', 'Chadian', 'Chilean', 'Chinese', 'Colombian', 'Comoran', 'Congolese',
  'Costa Rican', 'Croatian', 'Cuban', 'Cypriot', 'Czech', 'Danish', 'Djiboutian', 'Dominican', 'Dutch', 'Ecuadorian',
  'Egyptian', 'Emirati', 'English', 'Equatorial Guinean', 'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino', 'Finnish',
  'French', 'Gabonese', 'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Grenadian', 'Guatemalan', 'Guinean',
  'Guyanese', 'Haitian', 'Honduran', 'Hong Konger', 'Hungarian', 'Icelandic', 'Indian', 'Indonesian', 'Iranian', 'Iraqi',
  'Irish', 'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese', 'Jordanian', 'Kazakh', 'Kenyan', 'Kiribati',
  'Kuwaiti', 'Kyrgyz', 'Laotian', 'Latvian', 'Lebanese', 'Liberian', 'Libyan', 'Liechtensteiner', 'Lithuanian', 'Luxembourgish',
  'Macedonian', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivian', 'Malian', 'Maltese', 'Marshallese', 'Mauritanian', 'Mauritian',
  'Mexican', 'Micronesian', 'Moldovan', 'Monacan', 'Mongolian', 'Montenegrin', 'Moroccan', 'Mozambican', 'Namibian', 'Nauruan',
  'Nepalese', 'New Zealander', 'Nicaraguan', 'Nigerian', 'Nigerien', 'North Korean', 'Norwegian', 'Omani', 'Pakistani', 'Palauan',
  'Palestinian', 'Panamanian', 'Papua New Guinean', 'Paraguayan', 'Peruvian', 'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian',
  'Rwandan', 'Salvadoran', 'Samoan', 'San Marinese', 'Saudi', 'Scottish', 'Senegalese', 'Serbian', 'Seychellois', 'Sierra Leonean',
  'Singaporean', 'Slovak', 'Slovenian', 'Solomon Islander', 'Somali', 'South African', 'South Korean', 'South Sudanese', 'Spanish', 'Sri Lankan',
  'Sudanese', 'Surinamese', 'Swazi', 'Swedish', 'Swiss', 'Syrian', 'Taiwanese', 'Tajik', 'Tanzanian', 'Thai',
  'Timorese', 'Togolese', 'Tongan', 'Trinidadian', 'Tunisian', 'Turkish', 'Turkmen', 'Tuvaluan', 'Ugandan', 'Ukrainian',
  'Uruguayan', 'Uzbek', 'Vanuatuan', 'Venezuelan', 'Vietnamese', 'Welsh', 'Yemeni', 'Zambian', 'Zimbabwean',
]

function Combobox({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value ?? '')
  const [rect, setRect] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setQuery(value ?? '') }, [value])

  const openDropdown = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom
      setRect({ top: r.bottom, left: r.left, width: Math.max(r.width, 200), openUp: spaceBelow < 240 && r.top > spaceBelow })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = inputRef.current?.getBoundingClientRect()
      if (!r) return
      const spaceBelow = window.innerHeight - r.bottom
      setRect({ top: r.bottom, left: r.left, width: Math.max(r.width, 200), openUp: spaceBelow < 240 && r.top > spaceBelow })
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30)
    : options.slice(0, 30)

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={openDropdown}
        onChange={e => { setQuery(e.target.value); openDropdown() }}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(value ?? '') }, 150)}
        className={`${inputCls} ${disabled ? 'opacity-40' : ''}`}
      />
      {open && !disabled && rect && createPortal(
        <div
          className="fixed z-[100] max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1"
          style={{ top: rect.openUp ? undefined : rect.top + 4, bottom: rect.openUp ? window.innerHeight - rect.top + 4 : undefined, left: rect.left, width: rect.width }}
        >
          {filtered.length > 0 ? filtered.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(o); setQuery(o); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${o === value ? 'font-semibold' : ''}`}
              style={o === value ? { color: TEAL, background: '#f0fdfa' } : undefined}
            >
              {o}
            </button>
          )) : (
            <p className="px-3 py-1.5 text-sm text-gray-400">No match</p>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

function compressImageFile(file: File, onChange: (b64: string) => void) {
  const img = new window.Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    const MAX = 1200
    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width  = img.width  * scale
    canvas.height = img.height * scale
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    onChange(canvas.toDataURL('image/jpeg', 0.82))
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function ImageUpload({ label, hint, value, onChange }: { label?: string; hint?: string; value: string; onChange: (b64: string) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    compressImageFile(file, onChange)
  }
  const { isDragging, dropProps } = useFileDrop(files => { if (files[0]) compressImageFile(files[0], onChange) })
  return (
    <div className="space-y-2">
      {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
      {value ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label ?? 'Photo'} className="w-full max-h-52 object-contain rounded-xl border border-gray-200 bg-gray-50" />
          <button type="button" onClick={() => onChange('')}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow">
            ✕
          </button>
        </div>
      ) : (
        <label {...dropProps} className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          isDragging ? 'border-[#1a5f6e] bg-[#1a5f6e]/5' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}>
          <span className="text-2xl mb-1">📷</span>
          <span className="text-xs font-medium text-gray-500">{isDragging ? 'Drop to upload' : 'Tap or drag to upload photo'}</span>
          <span className="text-[11px] text-gray-300 mt-0.5">JPG, PNG — max display 1200px</span>
          <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFile} />
        </label>
      )}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1200
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

function FileUpload({ label, hint, values, onChange }: { label?: string; hint?: string; values: string[]; onChange: (files: string[]) => void }) {
  const list = values ?? []
  function handleFiles(fileList: FileList | File[]) {
    Promise.all(Array.from(fileList).map(readFileAsDataUrl)).then(newOnes => onChange([...list, ...newOnes]))
  }
  function removeAt(i: number) { onChange(list.filter((_, idx) => idx !== i)) }
  const isPdf = (v: string) => v.startsWith('data:application/pdf')
  const { isDragging, dropProps } = useFileDrop(handleFiles)
  return (
    <div className="space-y-2">
      {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {list.map((v, i) => (
          <div key={i} className="relative group aspect-square rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
            {isPdf(v) ? (
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <span className="text-2xl">📄</span>
                <span className="text-[9px] font-medium">PDF</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v} alt={label ?? 'file'} className="w-full h-full object-cover" />
            )}
            <button type="button" onClick={() => removeAt(i)}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow">
              ✕
            </button>
          </div>
        ))}
        <label {...dropProps} className={`aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          isDragging ? 'border-[#1a5f6e] bg-[#1a5f6e]/5' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}>
          <span className="text-xl leading-none mb-0.5 text-gray-400">{isDragging ? '⬇' : '＋'}</span>
          <span className="text-[9px] font-medium text-gray-500 text-center px-1">{isDragging ? 'Drop' : 'Add file'}</span>
          <input type="file" multiple className="hidden" accept="image/*,application/pdf"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

function EquipmentTable({ items, onChange }: { items: any[]; onChange: (items: any[]) => void }) {
  const rows: any[] = Array.isArray(items) && items.length > 0 ? items : [{ item: '', size: '', qty: '' }]
  const update = (i: number, key: string, val: string) => onChange(rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const addRow = () => onChange([...rows, { item: '', size: '', qty: '' }])
  const removeRow = (i: number) => onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [{ item: '', size: '', qty: '' }])
  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[1fr_110px_80px_28px] gap-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
        <span>Equipment</span><span>Size</span><span>Qty</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_80px_28px] gap-2 items-center">
          <input value={r.item ?? ''} onChange={e => update(i, 'item', e.target.value)} placeholder="e.g. Wetsuit, BCD, Fins, Mask" className={inputCls} />
          <input value={r.size ?? ''} onChange={e => update(i, 'size', e.target.value)} placeholder="Size" className={inputCls} />
          <input value={r.qty ?? ''} onChange={e => update(i, 'qty', e.target.value)} placeholder="Qty" className={inputCls} />
          <button type="button" onClick={() => removeRow(i)} aria-label="Remove item" className="text-red-400 hover:text-red-600 text-lg leading-none">✕</button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs font-semibold" style={{ color: TEAL }}>+ Add Item</button>
    </div>
  )
}

/* ── Shared (booking-level) section forms ── */
function MedicalSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Medical Conditions"><textarea rows={3} value={data.medicalConditions ?? ''} onChange={f('medicalConditions')} placeholder="e.g. Diabetes, Asthma" className={textCls} /></Field>
        <Field label="Medications"><textarea rows={3} value={data.medications ?? ''} onChange={f('medications')} placeholder="e.g. Insulin, Aspirin" className={textCls} /></Field>
        <Field label="Other Allergies"><textarea rows={2} value={data.otherAllergies ?? ''} onChange={f('otherAllergies')} placeholder="e.g. Pollen, Pet, Medication" className={textCls} /></Field>
        <Field label="Motion Sickness"><YesNo value={data.motionSickness ?? ''} onChange={v => onChange('motionSickness', v)} /></Field>
        <Field label="Physical Limitations"><textarea rows={2} value={data.physicalLimitations ?? ''} onChange={f('physicalLimitations')} placeholder="e.g. Mobility issues, Back pain" className={textCls} /></Field>
        <Field label="Special Assistance Required"><YesNo value={data.specialAssistance ?? ''} onChange={v => onChange('specialAssistance', v)} /></Field>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Emergency Contact *</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name *"><input value={data.emergencyContactName ?? ''} onChange={f('emergencyContactName')} placeholder="Full name" className={inputCls} /></Field>
          <Field label="Relationship *"><input value={data.emergencyContactRelationship ?? ''} onChange={f('emergencyContactRelationship')} placeholder="e.g. Spouse, Parent" className={inputCls} /></Field>
          <Field label="Phone *"><input type="tel" value={data.emergencyContactPhone ?? ''} onChange={f('emergencyContactPhone')} placeholder="Phone number" className={inputCls} /></Field>
          <Field label="Email *"><input type="email" value={data.emergencyContactEmail ?? ''} onChange={f('emergencyContactEmail')} placeholder="Email address" className={inputCls} /></Field>
        </div>
      </div>
    </div>
  )
}

function FoodSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  const yn = (k: string) => <YesNo value={data[k] ?? ''} onChange={v => onChange(k, v)} />
  const restrictions = [
    ['Halal', 'halal'], ['Vegetarian', 'vegetarian'], ['Vegan', 'vegan'],
    ['Pescatarian', 'pescatarian'], ['Gluten Free', 'glutenFree'],
    ['Lactose Intolerant', 'lactoseIntolerant'], ['Kosher', 'kosher'],
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Dietary Type"><input value={data.dietaryType ?? ''} onChange={f('dietaryType')} placeholder="e.g. Ivan: Vegan, Anna: Vegetarian" className={inputCls} /></Field>
        <Field label="Any Allergies in the Group? *">{yn('allergy')}</Field>
        <Field label="Allergy Details" full><textarea rows={2} value={data.allergyDetails ?? ''} onChange={f('allergyDetails')} placeholder="List who has what — e.g. Ivan: Nuts, Anna: Shellfish" className={textCls} /></Field>
        <Field label="Dislikes"><textarea rows={2} value={data.dislikes ?? ''} onChange={f('dislikes')} placeholder="e.g. Ivan: no cilantro" className={textCls} /></Field>
        <Field label="Favorite Foods"><textarea rows={2} value={data.favoriteFoods ?? ''} onChange={f('favoriteFoods')} placeholder="e.g. Anna: loves seafood" className={textCls} /></Field>
        <Field label="Breakfast Preference"><input value={data.breakfastPreference ?? ''} onChange={f('breakfastPreference')} placeholder="e.g. Continental, Full English" className={inputCls} /></Field>
        <Field label="Snack Preference"><input value={data.snackPreference ?? ''} onChange={f('snackPreference')} placeholder="e.g. Fruit, Nuts, Cookies" className={inputCls} /></Field>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dietary Restrictions *</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {restrictions.map(([lbl, k]) => (
            <Field key={k} label={lbl}>{yn(k)}</Field>
          ))}
        </div>
      </div>
    </div>
  )
}

function DrinksSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Drinks Alcohol *"><YesNo value={data.drinksAlcohol ?? ''} onChange={v => onChange('drinksAlcohol', v)} /></Field>
      <Field label="Wine Preference"><input value={data.winePreference ?? ''} onChange={f('winePreference')} placeholder="e.g. Red, White, Rosé" className={inputCls} /></Field>
      <Field label="Spirits Preference"><input value={data.spiritsPreference ?? ''} onChange={f('spiritsPreference')} placeholder="e.g. Vodka, Whiskey, Rum" className={inputCls} /></Field>
      <Field label="Cocktail Preference"><input value={data.cocktailPreference ?? ''} onChange={f('cocktailPreference')} placeholder="e.g. Mojito, Margarita" className={inputCls} /></Field>
      <Field label="Beer Preference"><input value={data.beerPreference ?? ''} onChange={f('beerPreference')} placeholder="e.g. Lager, Stout, IPA" className={inputCls} /></Field>
      <Field label="Coffee Preference"><input value={data.coffeePreference ?? ''} onChange={f('coffeePreference')} placeholder="e.g. Espresso, Cappuccino" className={inputCls} /></Field>
      <Field label="Tea Preference"><input value={data.teaPreference ?? ''} onChange={f('teaPreference')} placeholder="e.g. Black, Green, Herbal" className={inputCls} /></Field>
      <Field label="Soft Drink Preference"><input value={data.softDrinkPreference ?? ''} onChange={f('softDrinkPreference')} placeholder="e.g. Cola, Juice, Lemonade" className={inputCls} /></Field>
      <Field label="Water Preference"><input value={data.waterPreference ?? ''} onChange={f('waterPreference')} placeholder="e.g. Still, Sparkling, Mineral" className={inputCls} /></Field>
      <Field label="Drink Notes" full><textarea rows={3} value={data.drinkNotes ?? ''} onChange={f('drinkNotes')} placeholder="Any other drink preferences or notes…" className={textCls} /></Field>
    </div>
  )
}

function TravelSection({ data, onChange }: { data: TravelData; onChange: (k: keyof TravelData, v: string) => void }) {
  const f = (k: keyof TravelData) => (e: React.ChangeEvent<HTMLInputElement>) => onChange(k, e.target.value)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: TEAL }}>Arrival</p>
          <Field label="Pick-up Date & Time *"><input type="datetime-local" value={data.arrivalPickupTime} onChange={f('arrivalPickupTime')} className={inputCls} /></Field>
          <Field label="Hotel / Airport *"><input value={data.arrivalHotel} onChange={f('arrivalHotel')} placeholder="Hotel or airport name" className={inputCls} /></Field>
        </div>
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: TEAL }}>Departure</p>
          <Field label="Pick-up Date & Time *"><input type="datetime-local" value={data.departurePickupTime} onChange={f('departurePickupTime')} className={inputCls} /></Field>
          <Field label="Hotel / Airport *"><input value={data.departureHotel} onChange={f('departureHotel')} placeholder="Hotel or airport name" className={inputCls} /></Field>
        </div>
      </div>
      <div className="pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Field label="Arrival Flight Number"><input value={data.arrivalFlight} onChange={f('arrivalFlight')} placeholder="e.g. GA123" className={inputCls} /></Field>
        <Field label="Departure Flight Number"><input value={data.departureFlight} onChange={f('departureFlight')} placeholder="e.g. GA456" className={inputCls} /></Field>
      </div>
    </div>
  )
}

function validateTravel(data: TravelData): string | null {
  if (!data.arrivalPickupTime?.trim())   return 'Please fill in Arrival pick-up time'
  if (!data.arrivalHotel?.trim())        return 'Please fill in Arrival hotel/airport'
  if (!data.departurePickupTime?.trim()) return 'Please fill in Departure pick-up time'
  if (!data.departureHotel?.trim())      return 'Please fill in Departure hotel/airport'
  return null
}

const EMPTY_TRAVEL: TravelData = {
  arrivalPickupTime: '', arrivalHotel: '', arrivalFlight: '',
  departurePickupTime: '', departureHotel: '', departureFlight: '',
}

const ALL_STEPS: { id: Section; title: string; subtitle: string }[] = [
  { id: 'profile', title: 'Personal Details',   subtitle: 'Identity & contact info for every guest' },
  { id: 'medical', title: 'Medical & Health',   subtitle: 'One shared answer for the whole booking' },
  { id: 'food',    title: 'Food Preferences',   subtitle: 'One shared answer for the whole booking' },
  { id: 'drinks',  title: 'Drink Preferences',  subtitle: 'One shared answer for the whole booking' },
  { id: 'diving',  title: 'Diving Information', subtitle: 'Certification & equipment sizing per guest' },
  { id: 'travel',  title: 'Travel Arrangements', subtitle: 'Arrival & departure pick-up details for the group' },
]

function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function guestLabel(g: GuestRecord, i: number) {
  return [g.firstName, g.lastName].filter(Boolean).join(' ') || g.name || `Guest ${i + 1}`
}

/** A guest just added via "Add Guest" that hasn't been persisted yet — only becomes a real,
 *  official booking guest once their Personal Details are validated and saved. */
function isDraftGuest(g: GuestRecord) {
  return g.id.startsWith('draft-')
}

function initProfile(g: GuestRecord) {
  return {
    firstName:      g.firstName      ?? '',
    lastName:       g.lastName       ?? '',
    gender:         g.gender         ?? '',
    email:          g.email          ?? '',
    phone:          g.phone          ?? '',
    passport:       g.passport       ?? '',
    dateOfBirth:    g.dateOfBirth    ? g.dateOfBirth.split('T')[0]    : '',
    address:        g.address        ?? '',
    nationality:    g.nationality    ?? '',
    passportExpiry: g.passportExpiry ? g.passportExpiry.split('T')[0] : '',
    passportImage:  g.passportImage  ?? '',
  }
}

/* ── Per-guest state — profile & diving genuinely differ per person, so these stay per guest ── */
interface GuestState {
  profile: any; diving: any
  saved: Set<GuestScopedSection>
}

function initGuestState(g: GuestRecord): GuestState {
  return {
    profile: initProfile(g),
    diving:  g.divingData ?? {},
    saved:   new Set(),
  }
}

/* ── Validation ── */
function validateSection(section: Section, data: any): string | null {
  const req = (v: any) => v !== undefined && v !== null && String(v).trim() !== ''
  const hasFiles = (v: any) => Array.isArray(v) && v.length > 0

  if (section === 'profile') {
    const fields: [string, string][] = [
      ['firstName', 'First Name'], ['lastName', 'Last Name'], ['gender', 'Gender'],
      ['dateOfBirth', 'Date of Birth'], ['nationality', 'Nationality'], ['email', 'Email'],
      ['phone', 'Phone'], ['address', 'Address'], ['passport', 'Passport / ID Number'], ['passportExpiry', 'Passport Expiry'],
    ]
    for (const [k, label] of fields) if (!req(data[k])) return `${label} is required`
    if (!req(data.passportImage)) return 'Passport / ID photo is required'
    return null
  }
  if (section === 'medical') {
    const fields: [string, string][] = [
      ['emergencyContactName', 'Emergency Contact Name'], ['emergencyContactRelationship', 'Emergency Contact Relationship'],
      ['emergencyContactPhone', 'Emergency Contact Phone'], ['emergencyContactEmail', 'Emergency Contact Email'],
    ]
    for (const [k, label] of fields) if (!req(data[k])) return `${label} is required`
    return null
  }
  if (section === 'food') {
    if (!req(data.allergy)) return 'Please answer "Any Allergies in the Group?"'
    if (data.allergy === 'yes' && !req(data.allergyDetails)) return 'Please list who has what allergy in Allergy Details'
    const restrictions = ['halal', 'vegetarian', 'vegan', 'pescatarian', 'glutenFree', 'lactoseIntolerant', 'kosher']
    if (restrictions.some(k => !req(data[k]))) return 'All Dietary Restriction questions must be answered'
    return null
  }
  if (section === 'drinks') {
    if (!req(data.drinksAlcohol)) return 'Drinks Alcohol is required'
    return null
  }
  if (section === 'diving') {
    if (!req(data.isDiver)) return 'Is Diver is required'
    if (data.isDiver === 'yes') {
      if (!req(data.diveLevel)) return 'Dive Level is required'
      if (!req(data.certAgency)) return 'Certification Agency is required'
      if (!req(data.diveCount)) return 'Number of Dives is required'
      if (!req(data.lastDiveDate)) return 'Last Dive Date is required'
      if (!req(data.nitroxRequest)) return 'Nitrox Request is required'
      if (data.nitroxRequest === 'yes' && !hasFiles(data.nitroxCertImages)) return 'Nitrox Certificate is required'
      if (!req(data.strongCurrentExperience)) return 'Strong Current Experience is required'
      if (!hasFiles(data.divingInsuranceImages)) return 'Diving Insurance is required'
      if (!req(data.diveMedicalConditions)) return 'Medical Condition We Must Know is required (write "None" if not applicable)'
      if (!req(data.diveRentalRequired)) return 'Additional Equipment Required is required'
      if (data.diveRentalRequired === 'yes' && !(Array.isArray(data.equipmentList) && data.equipmentList.some((r: any) => r.item?.trim())))
        return 'At least one equipment item is required'
      if (!hasFiles(data.certImages)) return 'Diving Certificate / License is required'
    }
    return null
  }
  return null
}

/* ── Table column definitions (Personal Details & Diving only — genuinely per-guest data) ── */
type ColType = 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'combobox' | 'yesno' | 'textarea' | 'photo' | 'files' | 'equipment'

interface ColumnDef {
  key: string
  label: string
  type: ColType
  placeholder?: string
  options?: string[]
  width?: number
  enabledIf?: (data: any) => boolean
}

const PROFILE_COLS: ColumnDef[] = [
  { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'First name', width: 105 },
  { key: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Last name', width: 105 },
  { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], width: 90 },
  { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', width: 125 },
  { key: 'nationality', label: 'Nationality', type: 'combobox', options: NATIONALITIES, placeholder: 'Search…', width: 130 },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'email@example.com', width: 150 },
  { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+62 812...', width: 115 },
  { key: 'address', label: 'Address', type: 'text', placeholder: 'City, Country', width: 130 },
  { key: 'passport', label: 'Passport / ID No.', type: 'text', placeholder: 'A1234567', width: 115 },
  { key: 'passportExpiry', label: 'Passport Expiry', type: 'date', width: 125 },
  { key: 'passportImage', label: 'Passport Photo', type: 'photo', width: 100 },
]

const isDiverYes = (d: any) => d.isDiver === 'yes'
const DIVING_COLS: ColumnDef[] = [
  { key: 'isDiver', label: 'Is Diver', type: 'yesno', width: 90 },
  { key: 'diveLevel', label: 'Dive Level', type: 'select', options: ['beginner', 'open_water', 'advanced', 'rescue', 'divemaster', 'instructor'], width: 115, enabledIf: isDiverYes },
  { key: 'certAgency', label: 'Cert. Agency', type: 'text', placeholder: 'e.g. PADI', width: 110, enabledIf: isDiverYes },
  { key: 'diveCount', label: '# Dives', type: 'number', width: 85, enabledIf: isDiverYes },
  { key: 'lastDiveDate', label: 'Last Dive Date', type: 'date', width: 125, enabledIf: isDiverYes },
  { key: 'nitroxRequest', label: 'Nitrox Request', type: 'yesno', width: 105, enabledIf: isDiverYes },
  { key: 'nitroxCertImages', label: 'Nitrox Cert.', type: 'files', width: 100, enabledIf: (d: any) => isDiverYes(d) && d.nitroxRequest === 'yes' },
  { key: 'strongCurrentExperience', label: 'Strong Current Exp.', type: 'yesno', width: 115, enabledIf: isDiverYes },
  { key: 'divingInsuranceImages', label: 'Diving Insurance', type: 'files', width: 110, enabledIf: isDiverYes },
  { key: 'diveMedicalConditions', label: 'Dive Medical Notes', type: 'textarea', width: 140, enabledIf: isDiverYes },
  { key: 'diveRentalRequired', label: 'Equipment Required', type: 'yesno', width: 115, enabledIf: isDiverYes },
  { key: 'equipmentList', label: 'Equipment List', type: 'equipment', width: 100, enabledIf: (d: any) => isDiverYes(d) && d.diveRentalRequired === 'yes' },
  { key: 'divingNotes', label: 'Diving Notes', type: 'textarea', width: 130, enabledIf: isDiverYes },
  { key: 'certImages', label: 'Dive Certificate', type: 'files', width: 110, enabledIf: isDiverYes },
]

const SECTION_COLS: Record<GuestScopedSection, ColumnDef[]> = {
  profile: PROFILE_COLS, diving: DIVING_COLS,
}

/* ── Cell modal for photo / files / equipment fields ── */
interface CellModalState { guestId: string; guestName: string; col: ColumnDef }

function CellModal({ state, value, onChange, onClose }: { state: CellModalState; value: any; onChange: (v: any) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-800">{state.col.label}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 text-gray-400"><XIcon className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{state.guestName}</p>
        {state.col.type === 'photo' && <ImageUpload value={value ?? ''} onChange={onChange} />}
        {state.col.type === 'files' && <FileUpload values={value ?? []} onChange={onChange} />}
        {state.col.type === 'equipment' && <EquipmentTable items={value ?? []} onChange={onChange} />}
        <button onClick={onClose} className="w-full mt-4 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0d3d47 100%)` }}>
          Done
        </button>
      </div>
    </div>
  )
}

function summarizeCol(col: ColumnDef, value: any) {
  if (col.type === 'photo') return value ? { done: true, label: 'Uploaded' } : { done: false, label: 'Upload' }
  if (col.type === 'files') return Array.isArray(value) && value.length > 0 ? { done: true, label: `${value.length} file${value.length > 1 ? 's' : ''}` } : { done: false, label: 'Add files' }
  if (col.type === 'equipment') return Array.isArray(value) && value.some((r: any) => r.item?.trim()) ? { done: true, label: `${value.filter((r: any) => r.item?.trim()).length} item(s)` } : { done: false, label: 'Add items' }
  return { done: false, label: '' }
}

/* ── Renders the correct input widget for a single field, shared by the desktop table and mobile cards ── */
function FieldInput({ col, value, onChange, disabled, onOpenModal }: {
  col: ColumnDef
  value: any
  onChange: (v: any) => void
  disabled?: boolean
  onOpenModal: () => void
}) {
  if (col.type === 'text' || col.type === 'email' || col.type === 'tel' || col.type === 'number') {
    return <input type={col.type} value={value ?? ''} placeholder={col.placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} className={`${inputCls} ${disabled ? 'opacity-40' : ''}`} />
  }
  if (col.type === 'date') {
    return <input type="date" value={value ?? ''} disabled={disabled}
      onChange={e => onChange(e.target.value)} className={`${inputCls} ${disabled ? 'opacity-40' : ''}`} />
  }
  if (col.type === 'select') {
    return (
      <select value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value)} className={`${selectCls} ${disabled ? 'opacity-40' : ''}`}>
        <option value="">Select</option>
        {col.options!.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (col.type === 'combobox') {
    return <Combobox value={value ?? ''} onChange={onChange} options={col.options!} placeholder={col.placeholder} disabled={disabled} />
  }
  if (col.type === 'yesno') {
    return <YesNo value={value ?? ''} onChange={onChange} disabled={disabled} />
  }
  if (col.type === 'textarea') {
    return <textarea rows={1} value={value ?? ''} placeholder={col.placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} className={`${textCls} ${disabled ? 'opacity-40' : ''}`} />
  }
  const s = summarizeCol(col, value)
  return (
    <button type="button" disabled={disabled} onClick={onOpenModal}
      className={`w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-all ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
      style={{ borderColor: s.done ? '#bbf7d0' : '#e5e7eb', background: s.done ? '#f0fdf4' : 'white', color: s.done ? '#16a34a' : '#6b7280' }}>
      {col.type === 'photo' ? <Camera className="w-3.5 h-3.5" /> : col.type === 'files' ? <FileText className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
      {s.label}
    </button>
  )
}

/* ── One block per guest with their fields wrapping into a grid (no wide-scrolling table).
 *  dense=true (desktop, lg+): every guest always expanded, fields wrap into a dense multi-column
 *  grid that naturally breaks into ~2 rows. dense=false (mobile/tablet): accordion — only one
 *  guest expanded at a time so the rest stay visible as a compact list, no page navigation. ── */
function GuestFieldGrid({
  section, cols, guests, guestStates, setData, rowErrors, onDeleteGuest, deletingGuestId, dense,
}: {
  section: GuestScopedSection
  cols: ColumnDef[]
  guests: GuestRecord[]
  guestStates: Record<string, GuestState>
  setData: (guestId: string, section: GuestScopedSection, k: string, v: any) => void
  rowErrors: Record<string, string>
  onDeleteGuest: (guest: GuestRecord) => void
  deletingGuestId: string | null
  dense?: boolean
}) {
  const [modal, setModal] = useState<CellModalState | null>(null)
  const [openId, setOpenId] = useState<string | null>(guests[0]?.id ?? null)
  const prevCount = useRef(guests.length)
  useEffect(() => {
    if (guests.length > prevCount.current) setOpenId(guests[guests.length - 1].id)
    prevCount.current = guests.length
  }, [guests])

  return (
    <div className="space-y-3">
      {guests.map((g, i) => {
        const gs = guestStates[g.id]
        if (!gs) return null
        const data = gs[section]
        const done = gs.saved.has(section)
        const error = rowErrors[g.id]
        const isOpen = dense || openId === g.id
        const headerInner = (
          <>
            <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: done ? '#22c55e' : error ? '#ef4444' : '#d1d5db' }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-700 leading-tight">
                {guestLabel(g, i)}{g.isLead ? <span className="ml-1 text-[10px] font-medium" style={{ color: GOLD }}>· Lead</span> : null}
              </p>
              {error && <p className="text-xs text-red-500 mt-0.5 leading-tight">{error}</p>}
            </div>
            {!g.isLead && (
              <span
                role="button"
                onClick={e => { e.stopPropagation(); onDeleteGuest(g) }}
                title="Remove guest"
                className="shrink-0 p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                {deletingGuestId === g.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </span>
            )}
            {!dense && <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
          </>
        )
        return (
          <div key={g.id} className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">
            {dense ? (
              <div className="w-full flex items-start gap-2 px-4 py-3 text-left">{headerInner}</div>
            ) : (
              <button type="button" onClick={() => setOpenId(isOpen ? null : g.id)}
                className="w-full flex items-start gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60 text-left">
                {headerInner}
              </button>
            )}
            {isOpen && (
              <div
                className={dense ? 'grid gap-3 p-4 border-t border-gray-100' : 'grid grid-cols-1 sm:grid-cols-2 gap-3 p-4'}
                style={dense ? { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } : undefined}
              >
                {cols.map(col => {
                  const disabled = col.enabledIf ? !col.enabledIf(data) : false
                  const v = data?.[col.key]
                  const onChange = (val: any) => setData(g.id, section, col.key, val)
                  const wide = col.type === 'textarea' || col.type === 'equipment'
                  return (
                    <Field key={col.key} label={col.label} full={!dense && wide} style={dense && wide ? { gridColumn: 'span 2' } : undefined}>
                      <FieldInput col={col} value={v} onChange={onChange} disabled={disabled}
                        onOpenModal={() => setModal({ guestId: g.id, guestName: guestLabel(g, i), col })} />
                    </Field>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {modal && (
        <CellModal
          state={modal}
          value={guestStates[modal.guestId]?.[section]?.[modal.col.key]}
          onChange={v => setData(modal.guestId, section, modal.col.key, v)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

/* ── Main Page ── */
function BookingFormInner() {
  const { token } = useParams<{ token: string }>()

  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [formData, setFormData] = useState<BookingFormData | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [allDone,  setAllDone]  = useState(false)

  // Global step (shared across all guests)
  const [stepIdx, setStepIdx] = useState(0)
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  // Per-guest state (Personal Details & Diving only), keyed by customerId
  const [guestStates, setGuestStates] = useState<Record<string, GuestState>>({})

  // Booking-level shared answers — filled once for the whole group
  const [travelData,  setTravelData]  = useState<TravelData>(EMPTY_TRAVEL)
  const [medicalData, setMedicalData] = useState<any>({})
  const [foodData,    setFoodData]    = useState<any>({})
  const [drinksData,  setDrinksData]  = useState<any>({})
  const [sharedSaved, setSharedSaved] = useState<Set<Section>>(new Set())

  // Self-service "add guest" — private charters (whole vessel) and open trips (cabin capacity)
  const [showAddGuestForm, setShowAddGuestForm] = useState(false)
  const [newGuestName, setNewGuestName] = useState('')
  const [deletingGuestId, setDeletingGuestId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/booking-form/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setFormData(data)

        const states: Record<string, GuestState> = {}
        data.guests.forEach((g: GuestRecord) => { states[g.id] = initGuestState(g) })
        setGuestStates(states)

        if (data.travel)  setTravelData(data.travel)
        if (data.medical) setMedicalData(data.medical)
        if (data.food)    setFoodData(data.food)
        if (data.drinks)  setDrinksData(data.drinks)

        const shared = new Set<Section>()
        if (data.travel && (data.travel.arrivalPickupTime || data.travel.departurePickupTime)) shared.add('travel')
        if (data.medical && Object.keys(data.medical).length > 0) shared.add('medical')
        if (data.food    && Object.keys(data.food).length > 0)    shared.add('food')
        if (data.drinks  && Object.keys(data.drinks).length > 0)  shared.add('drinks')
        setSharedSaved(shared)
      })
      .catch(() => setError('Failed to load form'))
      .finally(() => setLoading(false))
  }, [token])

  const guests = formData?.guests ?? []
  const trip = formData?.tripInfo

  const STEPS = ALL_STEPS.filter(s => s.id !== 'diving' || formData?.hasDiving)
  const currentStep = STEPS[stepIdx]
  const currentIsShared = currentStep ? SHARED_SECTIONS.includes(currentStep.id) : false

  const setData = (guestId: string, section: GuestScopedSection, k: string, v: any) => {
    setGuestStates(prev => ({
      ...prev,
      [guestId]: { ...prev[guestId], [section]: { ...prev[guestId][section], [k]: v } },
    }))
  }

  const guestScopedSteps = STEPS.filter(s => GUEST_SCOPED.includes(s.id as GuestScopedSection))
  const sharedSteps = STEPS.filter(s => SHARED_SECTIONS.includes(s.id))

  const guestSectionsDone = (guestId: string) => {
    const s = guestStates[guestId]
    return s ? guestScopedSteps.filter(step => s.saved.has(step.id as GuestScopedSection)).length : 0
  }
  const sharedSectionsDone = sharedSteps.filter(step => sharedSaved.has(step.id)).length

  const overallDone  = guests.reduce((acc, g) => acc + guestSectionsDone(g.id), 0) + sharedSectionsDone
  const overallTotal = guests.length * guestScopedSteps.length + sharedSteps.length

  // Only offered from Personal Details — a new guest must complete that step (and become a real,
  // persisted record) before they can appear in any other step, like Diving.
  const canAddGuest = currentStep?.id === 'profile' &&
    (trip?.tripType === 'PRIVATE_CHARTER' || trip?.tripType === 'OPEN_TRIP') && (trip.capacity == null || guests.length < trip.capacity)

  /** Adds a local-only draft row — nothing is written to the booking yet. It only becomes a real
   *  guest once its Personal Details are filled in and saved (see handleSaveStep). */
  const handleAddGuest = () => {
    const name = newGuestName.trim()
    if (!name) { toast.error('Please enter the guest’s name'); return }
    if (trip?.capacity != null && guests.length >= trip.capacity) { toast.error('This booking is already at full capacity'); return }

    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [first, ...rest] = name.split(' ')
    const draftGuest: GuestRecord = {
      bookingGuestId: draftId,
      isLead: false,
      id: draftId,
      name,
      firstName: first ?? '', lastName: rest.join(' '), gender: '', email: '', phone: '', passport: '',
      dateOfBirth: '', address: '', nationality: '', passportExpiry: '', passportImage: '',
      divingData: {},
    }
    setFormData(prev => prev ? { ...prev, guests: [...prev.guests, draftGuest] } : prev)
    setGuestStates(prev => ({ ...prev, [draftGuest.id]: initGuestState(draftGuest) }))
    setShowAddGuestForm(false)
    setNewGuestName('')
    toast.success('Guest added — fill in their Personal Details below to save')
  }

  const handleDeleteGuest = async (guest: GuestRecord) => {
    if (!window.confirm(`Remove ${guestLabel(guest, 0)}?`)) return

    // Drafts were never persisted — just drop them locally, no API call needed.
    if (isDraftGuest(guest)) {
      setFormData(prev => prev ? { ...prev, guests: prev.guests.filter(g => g.id !== guest.id) } : prev)
      setGuestStates(prev => { const next = { ...prev }; delete next[guest.id]; return next })
      toast.success('Guest removed')
      return
    }

    setDeletingGuestId(guest.id)
    try {
      const res = await fetch(`/api/booking-form/${token}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingGuestId: guest.bookingGuestId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to remove guest')
      setFormData(prev => prev ? { ...prev, guests: prev.guests.filter(g => g.id !== guest.id) } : prev)
      setGuestStates(prev => { const next = { ...prev }; delete next[guest.id]; return next })
      toast.success('Guest removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove guest')
    } finally {
      setDeletingGuestId(null)
    }
  }

  const goToNextOrFinish = () => {
    if (stepIdx === STEPS.length - 1) {
      const allSharedDone = sharedSteps.every(s => sharedSaved.has(s.id))
      const allGuestsDone = guests.every(g => guestScopedSteps.every(s => guestStates[g.id]?.saved.has(s.id as GuestScopedSection)))
      if (allSharedDone && allGuestsDone) setAllDone(true)
    } else {
      const next = stepIdx + 1
      setStepIdx(next)
      setMaxUnlockedStep(m => Math.max(m, next))
      setRowErrors({})
    }
  }

  /** Saves the current step. Shared steps (medical/food/drinks/travel) are answered once for the
   *  whole booking. Personal Details & Diving stay per guest — every row is validated and the
   *  valid ones saved even if others still have errors, so progress isn't lost mid-group-fill. */
  const handleSaveStep = async (andContinue: boolean) => {
    if (!currentStep) return
    setSaving(true)

    try {
      if (currentIsShared) {
        const sharedValue =
          currentStep.id === 'travel' ? travelData :
          currentStep.id === 'medical' ? medicalData :
          currentStep.id === 'food' ? foodData : drinksData

        const err = currentStep.id === 'travel' ? validateTravel(travelData) : validateSection(currentStep.id, sharedValue)
        if (err) { toast.error(err); setSaving(false); return }

        const res = await fetch(`/api/booking-form/${token}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: currentStep.id, data: sharedValue }),
        })
        if (!res.ok) throw new Error()

        setSharedSaved(prev => new Set([...prev, currentStep.id]))
        toast.success('Saved!')
        if (andContinue) {
          if (stepIdx === STEPS.length - 1) {
            const allSharedDone = sharedSteps.every(s => s.id === currentStep.id || sharedSaved.has(s.id))
            const allGuestsDone = guests.every(g => guestScopedSteps.every(s => guestStates[g.id]?.saved.has(s.id as GuestScopedSection)))
            if (allSharedDone && allGuestsDone) setAllDone(true)
          } else {
            goToNextOrFinish()
          }
        }
        setSaving(false)
        return
      }

      const section = currentStep.id as GuestScopedSection
      const errors: Record<string, string> = {}
      const toSave: { guest: GuestRecord; data: any }[] = []
      for (const g of guests) {
        const data = guestStates[g.id]?.[section]
        const err = validateSection(section, data)
        if (err) errors[g.id] = err
        else toSave.push({ guest: g, data })
      }
      setRowErrors(errors)

      if (toSave.length > 0) {
        // Sequential, not parallel — a draft becoming "real" here must see accurate capacity
        // counts from any drafts saved just before it in the same batch.
        const results: { oldId: string; created: GuestRecord | null }[] = []
        for (const { guest, data } of toSave) {
          if (section === 'profile' && isDraftGuest(guest)) {
            const res = await fetch(`/api/booking-form/${token}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: guest.name, ...data }),
            })
            const created = await res.json()
            if (!res.ok) throw new Error(created.error || `Failed to save ${guestLabel(guest, 0)}`)
            results.push({ oldId: guest.id, created })
          } else {
            const res = await fetch(`/api/booking-form/${token}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customerId: guest.id, section, data }),
            })
            if (!res.ok) throw new Error(`Failed to save ${guestLabel(guest, 0)}`)
            results.push({ oldId: guest.id, created: null })
          }
        }

        setFormData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            guests: prev.guests.map(g => {
              const r = results.find(res => res.oldId === g.id)
              return r?.created ? r.created : g
            }),
          }
        })
        setGuestStates(prev => {
          const next = { ...prev }
          for (const { oldId, created } of results) {
            const key = created ? created.id : oldId
            next[key] = { ...next[oldId], saved: new Set([...next[oldId].saved, section]) }
            if (created) delete next[oldId]
          }
          return next
        })
      }

      const hasErrors = Object.keys(errors).length > 0
      if (hasErrors) {
        toast.error(`${Object.keys(errors).length} guest(s) still need info in this section`)
        setSaving(false)
        return
      }

      toast.success('Saved!')
      if (andContinue) goToNextOrFinish()
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  /* Loading */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5]">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <img src={LOGO} alt="Samara" className="w-14 h-14 opacity-60 animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading your form…</p>
      </div>
    </div>
  )

  /* Error */
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5] px-4">
      <div className="text-center max-w-sm">
        <img src={LOGO} alt="Samara" className="w-16 h-16 mx-auto mb-4 opacity-70" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">Link Not Valid</h1>
        <p className="text-gray-500 text-sm">{error === 'This link has expired' ? 'This guest form link has expired. Please contact us for a new link.' : error}</p>
      </div>
    </div>
  )

  /* All Done */
  if (allDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5] px-4">
        <div className="text-center max-w-sm">
          <img src={LOGO} alt="Samara" className="w-20 h-20 mx-auto mb-5" />
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-9 h-9 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">All Done!</h1>
          <p className="text-gray-500 text-sm">Thank you for completing all guest profiles. We look forward to welcoming your group on board Samara Liveaboard.</p>
          {trip && (
            <div className="mt-5 bg-white rounded-2xl border border-gray-100 px-5 py-4 text-sm text-gray-600 text-left">
              <p className="font-semibold text-gray-800 mb-1">{trip.yachtName ?? 'Samara'}</p>
              <p className="text-xs text-gray-400">{fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}</p>
              {trip.destination && <p className="text-xs text-gray-400 mt-0.5">{trip.destination}</p>}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!currentStep) return null

  return (
    <>
      <div className="min-h-screen bg-[#f0f4f5]">

        {/* ── Brand header ── */}
        <div style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0d3d47 100%)` }}>
          <div className="max-w-[1600px] mx-auto px-2 sm:px-4 pt-5 pb-4 sm:pt-8 sm:pb-6">

            <div className="flex items-center gap-3 mb-6">
              <img src={LOGO} alt="Samara" className="w-10 h-10 rounded-lg" />
              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-widest">Samara Yachting</p>
                <p className="text-white font-bold text-sm leading-tight">Group Guest Form</p>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-white/60 text-[10px] uppercase tracking-widest mb-0.5">Group Booking</p>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white/60" />
                <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">{guests.length} Guests</h1>
              </div>
              <p className="text-white/50 text-xs sm:text-sm mt-1">Personal Details & Diving are filled per guest — Medical, Food, Drinks & Travel are answered once for everyone.</p>
              {/* Overall progress */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${overallTotal > 0 ? (overallDone / overallTotal) * 100 : 0}%` }} />
                </div>
                <span className="text-white/60 text-xs shrink-0">{overallDone}/{overallTotal} sections</span>
              </div>
            </div>

            {/* Trip info */}
            {trip && (
              <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-white/80 text-xs min-w-0">
                  <Ship className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                  <span className="font-semibold text-white truncate">{trip.yachtName ?? 'Samara'}</span>
                  {trip.tripTitle && <span className="text-white/50 truncate">— {trip.tripTitle}</span>}
                </div>
                <div className="hidden sm:block w-px h-4 bg-white/20" />
                <div className="flex items-center gap-2 text-white/70 text-xs">
                  <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                  <span>{fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}</span>
                </div>
                {trip.destination && (
                  <>
                    <div className="hidden sm:block w-px h-4 bg-white/20" />
                    <div className="flex items-center gap-2 text-white/70 text-xs">
                      <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                      <span className="truncate">{trip.destination}</span>
                    </div>
                  </>
                )}
                {trip.bookingCode && (
                  <>
                    <div className="hidden sm:block w-px h-4 bg-white/20" />
                    <div className="flex items-center gap-2 text-white/70 text-xs">
                      <Anchor className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                      <span className="font-mono">{trip.bookingCode}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Add guest modal ── */}
        {showAddGuestForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={() => setShowAddGuestForm(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Add a Guest</h3>
              <p className="text-xs text-gray-400 mb-4">They&apos;ll appear as a new row below — fill in their Personal Details and save to officially add them to the booking.</p>
              <Field label="Guest Full Name *">
                <input
                  autoFocus
                  value={newGuestName}
                  onChange={e => setNewGuestName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGuest()}
                  placeholder="e.g. Jane Doe"
                  className={inputCls}
                />
              </Field>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => { setShowAddGuestForm(false); setNewGuestName('') }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddGuest}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0d3d47 100%)` }}
                >
                  Add Guest
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step tabs ── */}
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-[1600px] mx-auto px-2 sm:px-4 py-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {STEPS.map((step, i) => {
                const isShared = SHARED_SECTIONS.includes(step.id)
                const unlocked = i <= maxUnlockedStep
                const active = i === stepIdx
                const stepDoneCount = isShared ? 0 : guests.filter(g => guestStates[g.id]?.saved.has(step.id as GuestScopedSection)).length
                const stepFullyDone = isShared ? sharedSaved.has(step.id) : (guests.length > 0 && stepDoneCount === guests.length)
                return (
                  <button
                    key={step.id}
                    disabled={!unlocked}
                    onClick={() => { setStepIdx(i); setRowErrors({}) }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all shrink-0 text-left disabled:cursor-not-allowed"
                    style={{
                      background: active ? TEAL : stepFullyDone ? '#f0fdf4' : 'white',
                      borderColor: active ? TEAL : stepFullyDone ? '#bbf7d0' : '#e5e7eb',
                      color: active ? 'white' : stepFullyDone ? '#16a34a' : unlocked ? '#374151' : '#c4c9d0',
                      opacity: unlocked ? 1 : 0.6,
                    }}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: active ? 'rgba(255,255,255,0.2)' : stepFullyDone ? '#dcfce7' : '#f3f4f6' }}>
                      {stepFullyDone
                        ? <CheckCircle className="w-3.5 h-3.5" style={{ color: active ? 'white' : '#16a34a' }} />
                        : unlocked ? <span className="text-[11px] font-bold">{i + 1}</span> : <Lock className="w-3 h-3" style={{ color: active ? 'white' : '#c4c9d0' }} />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-tight whitespace-nowrap">{step.title}</p>
                      <p className="text-[10px] leading-tight mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.6)' : '#9ca3af' }}>
                        {isShared ? 'Shared for group' : `${stepDoneCount}/${guests.length} guests`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Form body ── */}
        <div className="max-w-[1600px] mx-auto px-2 sm:px-4 py-4 sm:py-6">

          <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: TEAL }}>Step {stepIdx + 1} of {STEPS.length}</span>
              <h2 className="text-xl font-extrabold text-gray-800 mt-0.5">{currentStep.title}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{currentStep.subtitle}</p>
            </div>
            {canAddGuest && (
              <button onClick={() => setShowAddGuestForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed text-xs font-semibold transition-all hover:bg-gray-50"
                style={{ borderColor: TEAL, color: TEAL }}>
                <Plus className="w-3.5 h-3.5" /> Add Guest
              </button>
            )}
          </div>

          {currentIsShared ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-7">
              {currentStep.id === 'travel' && <TravelSection data={travelData} onChange={(k, v) => setTravelData(prev => ({ ...prev, [k]: v }))} />}
              {currentStep.id === 'medical' && <MedicalSection data={medicalData} onChange={(k, v) => setMedicalData((prev: any) => ({ ...prev, [k]: v }))} />}
              {currentStep.id === 'food' && <FoodSection data={foodData} onChange={(k, v) => setFoodData((prev: any) => ({ ...prev, [k]: v }))} />}
              {currentStep.id === 'drinks' && <DrinksSection data={drinksData} onChange={(k, v) => setDrinksData((prev: any) => ({ ...prev, [k]: v }))} />}
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <GuestFieldGrid
                  dense
                  section={currentStep.id as GuestScopedSection}
                  cols={SECTION_COLS[currentStep.id as GuestScopedSection]}
                  guests={guests}
                  guestStates={guestStates}
                  setData={setData}
                  rowErrors={rowErrors}
                  onDeleteGuest={handleDeleteGuest}
                  deletingGuestId={deletingGuestId}
                />
              </div>
              <div className="lg:hidden">
                <GuestFieldGrid
                  section={currentStep.id as GuestScopedSection}
                  cols={SECTION_COLS[currentStep.id as GuestScopedSection]}
                  guests={guests}
                  guestStates={guestStates}
                  setData={setData}
                  rowErrors={rowErrors}
                  onDeleteGuest={handleDeleteGuest}
                  deletingGuestId={deletingGuestId}
                />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={() => { setStepIdx(i => Math.max(0, i - 1)); setRowErrors({}) }}
              disabled={stepIdx === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveStep(false)}
                disabled={saving}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-60 transition-all"
                style={{ borderColor: '#d1d5db' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Progress
              </button>
              <button
                onClick={() => handleSaveStep(true)}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all shadow-sm"
                style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0d3d47 100%)` }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {stepIdx === STEPS.length - 1 ? 'Finish' : 'Save & Continue'}
                {stepIdx !== STEPS.length - 1 && !saving && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-300 mt-3">
            {overallDone} of {overallTotal} total sections completed · All data is stored securely
          </p>
        </div>
      </div>
    </>
  )
}

export default function BookingFormPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5]">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <img src={LOGO} alt="Samara" className="w-14 h-14 opacity-60 animate-pulse" />
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    }>
      <BookingFormInner />
    </Suspense>
  )
}
