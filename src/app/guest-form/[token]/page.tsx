'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CheckCircle, Loader2, ChevronRight, ChevronLeft, Save, Calendar, MapPin, Ship, Anchor, Lock } from 'lucide-react'
import { toast, Toaster } from 'sonner'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'
const TEAL = '#1a5f6e'
const GOLD = '#bdac7e'

type Section = 'profile' | 'medical' | 'food' | 'drinks' | 'diving'

interface TripInfo {
  bookingCode: string
  startDate: string
  endDate: string
  destination: string
  yachtName: string
  tripTitle: string | null
  tripType: string
}

interface GuestData {
  id: string; name: string; firstName: string; lastName: string
  gender: string; email: string; phone: string; passport: string
  dateOfBirth: string; address: string; nationality: string; passportExpiry: string
  emergencyContact: string
  medicalData: any; foodData: any; drinksData: any; divingData: any
  hasDiving: boolean; isOpenTrip: boolean
  tripInfo: TripInfo | null
  guestFormExpiresAt: string
}

/* ── Field components ── */
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls  = `w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[${TEAL}]/30 focus:border-[${TEAL}] bg-white placeholder:text-gray-300 transition-all`
const selectCls = `w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[${TEAL}]/30 focus:border-[${TEAL}] bg-white text-gray-700 transition-all`
const textCls   = `w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[${TEAL}]/30 focus:border-[${TEAL}] bg-white placeholder:text-gray-300 transition-all resize-none`

function YesNo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      <option value="">Select</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )
}

/* ── Section forms ── */
function ProfileSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => onChange(k, e.target.value)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="First Name *"><input value={data.firstName ?? ''} onChange={f('firstName')} placeholder="First name" className={inputCls} /></Field>
      <Field label="Last Name"><input value={data.lastName ?? ''} onChange={f('lastName')} placeholder="Last name" className={inputCls} /></Field>
      <Field label="Gender">
        <select value={data.gender ?? ''} onChange={e => onChange('gender', e.target.value)} className={selectCls}>
          <option value="">Select</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
      </Field>
      <Field label="Date of Birth"><input type="date" value={data.dateOfBirth ?? ''} onChange={f('dateOfBirth')} className={inputCls} /></Field>
      <Field label="Nationality"><input value={data.nationality ?? ''} onChange={f('nationality')} placeholder="e.g. Indonesian, Australian" className={inputCls} /></Field>
      <Field label="Email"><input type="email" value={data.email ?? ''} onChange={f('email')} placeholder="email@example.com" className={inputCls} /></Field>
      <Field label="Phone"><input type="tel" value={data.phone ?? ''} onChange={f('phone')} placeholder="+62 812 3456 7890" className={inputCls} /></Field>
      <Field label="Address"><input value={data.address ?? ''} onChange={f('address')} placeholder="City, Country" className={inputCls} /></Field>
      <Field label="Passport / ID Number"><input value={data.passport ?? ''} onChange={f('passport')} placeholder="A1234567" className={inputCls} /></Field>
      <Field label="Passport Expiry"><input type="date" value={data.passportExpiry ?? ''} onChange={f('passportExpiry')} className={inputCls} /></Field>
    </div>
  )
}

function MedicalSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Medical Conditions"><textarea rows={3} value={data.medicalConditions ?? ''} onChange={f('medicalConditions')} placeholder="e.g. Diabetes, Asthma" className={textCls} /></Field>
        <Field label="Medications"><textarea rows={3} value={data.medications ?? ''} onChange={f('medications')} placeholder="e.g. Insulin, Aspirin" className={textCls} /></Field>
        <Field label="Food Allergy"><YesNo value={data.foodAllergy ?? ''} onChange={v => onChange('foodAllergy', v)} /></Field>
        <Field label="Food Allergy Details"><textarea rows={2} value={data.foodAllergyDetails ?? ''} onChange={f('foodAllergyDetails')} placeholder="Describe food allergies in detail" className={textCls} /></Field>
        <Field label="Other Allergies"><textarea rows={2} value={data.otherAllergies ?? ''} onChange={f('otherAllergies')} placeholder="e.g. Pollen, Pet, Medication" className={textCls} /></Field>
        <Field label="Motion Sickness"><YesNo value={data.motionSickness ?? ''} onChange={v => onChange('motionSickness', v)} /></Field>
        <Field label="Physical Limitations"><textarea rows={2} value={data.physicalLimitations ?? ''} onChange={f('physicalLimitations')} placeholder="e.g. Mobility issues, Back pain" className={textCls} /></Field>
        <Field label="Special Assistance Required"><YesNo value={data.specialAssistance ?? ''} onChange={v => onChange('specialAssistance', v)} /></Field>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Emergency Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name"><input value={data.emergencyContactName ?? ''} onChange={f('emergencyContactName')} placeholder="Full name" className={inputCls} /></Field>
          <Field label="Relationship"><input value={data.emergencyContactRelationship ?? ''} onChange={f('emergencyContactRelationship')} placeholder="e.g. Spouse, Parent" className={inputCls} /></Field>
          <Field label="Phone"><input type="tel" value={data.emergencyContactPhone ?? ''} onChange={f('emergencyContactPhone')} placeholder="Phone number" className={inputCls} /></Field>
          <Field label="Email"><input type="email" value={data.emergencyContactEmail ?? ''} onChange={f('emergencyContactEmail')} placeholder="Email address" className={inputCls} /></Field>
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
        <Field label="Dietary Type"><input value={data.dietaryType ?? ''} onChange={f('dietaryType')} placeholder="e.g. Vegan, Vegetarian" className={inputCls} /></Field>
        <Field label="Allergy">
          <select value={data.allergy ?? ''} onChange={e => onChange('allergy', e.target.value)} className={selectCls}>
            <option value="">Select</option>
            <option value="none">None</option>
            <option value="nuts">Nuts</option>
            <option value="shellfish">Shellfish</option>
            <option value="dairy">Dairy</option>
            <option value="gluten">Gluten</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Allergy Details"><textarea rows={2} value={data.allergyDetails ?? ''} onChange={f('allergyDetails')} placeholder="Describe allergies in detail" className={textCls} /></Field>
        <Field label="Dislikes"><textarea rows={2} value={data.dislikes ?? ''} onChange={f('dislikes')} placeholder="Foods the guest dislikes" className={textCls} /></Field>
        <Field label="Favorite Foods"><textarea rows={2} value={data.favoriteFoods ?? ''} onChange={f('favoriteFoods')} placeholder="Foods the guest enjoys" className={textCls} /></Field>
        <Field label="Breakfast Preference"><input value={data.breakfastPreference ?? ''} onChange={f('breakfastPreference')} placeholder="e.g. Continental, Full English" className={inputCls} /></Field>
        <Field label="Snack Preference"><input value={data.snackPreference ?? ''} onChange={f('snackPreference')} placeholder="e.g. Fruit, Nuts, Cookies" className={inputCls} /></Field>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dietary Restrictions</p>
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
      <Field label="Drinks Alcohol"><YesNo value={data.drinksAlcohol ?? ''} onChange={v => onChange('drinksAlcohol', v)} /></Field>
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

function DivingSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  const yn = (k: string) => <YesNo value={data[k] ?? ''} onChange={v => onChange(k, v)} />
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Is Diver">{yn('isDiver')}</Field>
      <Field label="Dive Level">
        <select value={data.diveLevel ?? ''} onChange={e => onChange('diveLevel', e.target.value)} className={selectCls}>
          <option value="">Select</option>
          <option value="beginner">Beginner</option>
          <option value="open_water">Open Water</option>
          <option value="advanced">Advanced</option>
          <option value="rescue">Rescue Diver</option>
          <option value="divemaster">Divemaster</option>
          <option value="instructor">Instructor</option>
        </select>
      </Field>
      <Field label="Certification Agency"><input value={data.certAgency ?? ''} onChange={f('certAgency')} placeholder="e.g. PADI, SSI, NAUI" className={inputCls} /></Field>
      <Field label="Number of Dives"><input type="number" value={data.diveCount ?? ''} onChange={f('diveCount')} placeholder="Total logged dives" className={inputCls} /></Field>
      <Field label="Last Dive Date"><input type="date" value={data.lastDiveDate ?? ''} onChange={f('lastDiveDate')} className={inputCls} /></Field>
      <Field label="Equipment Rental Required">{yn('diveRentalRequired')}</Field>
      <Field label="Wetsuit Size"><input value={data.wetsuitSize ?? ''} onChange={f('wetsuitSize')} placeholder="e.g. S, M, L, XL" className={inputCls} /></Field>
      <Field label="BCD Size"><input value={data.bcdSize ?? ''} onChange={f('bcdSize')} placeholder="e.g. S, M, L, XL" className={inputCls} /></Field>
      <Field label="Fins Size"><input value={data.finsSize ?? ''} onChange={f('finsSize')} placeholder="e.g. 40-41, 42-43" className={inputCls} /></Field>
      <Field label="Mask Size"><input value={data.maskSize ?? ''} onChange={f('maskSize')} placeholder="e.g. Small, Medium" className={inputCls} /></Field>
      <Field label="Diving Notes" full><textarea rows={3} value={data.divingNotes ?? ''} onChange={f('divingNotes')} placeholder="Preferred dive conditions, interests…" className={textCls} /></Field>
    </div>
  )
}

/* ── Step config ── */
const ALL_STEPS: { id: Section; title: string; subtitle: string }[] = [
  { id: 'profile', title: 'Personal Details',    subtitle: 'Your identity & contact info' },
  { id: 'medical', title: 'Medical & Health',    subtitle: 'Health info & emergency contact' },
  { id: 'food',    title: 'Food Preferences',    subtitle: 'Dietary needs & meal preferences' },
  { id: 'drinks',  title: 'Drink Preferences',   subtitle: 'Beverages you enjoy on board' },
  { id: 'diving',  title: 'Diving Information',  subtitle: 'Certification & equipment sizing' },
]

function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Main Page ── */
function GuestFormInner() {
  const params       = useParams<{ token: string }>()
  const token        = params.token
  const searchParams = useSearchParams()
  const bgId         = searchParams.get('bg')

  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [guest,      setGuest]      = useState<GuestData | null>(null)
  const [stepIdx,    setStepIdx]    = useState(0)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState<Set<Section>>(new Set())
  const [allDone,      setAllDone]      = useState(false)
  const [maxUnlocked,  setMaxUnlocked]  = useState(0) // highest step index the user can access

  const [profileData, setProfileData] = useState<any>({})
  const [medicalData, setMedicalData] = useState<any>({})
  const [foodData,    setFoodData]    = useState<any>({})
  const [drinksData,  setDrinksData]  = useState<any>({})
  const [divingData,  setDivingData]  = useState<any>({})

  const dataMap: Record<Section, any> = {
    profile: profileData, medical: medicalData, food: foodData,
    drinks: drinksData,  diving: divingData,
  }
  const setterMap: Record<Section, (k: string, v: string) => void> = {
    profile: (k, v) => setProfileData((p: any) => ({ ...p, [k]: v })),
    medical: (k, v) => setMedicalData((p: any) => ({ ...p, [k]: v })),
    food:    (k, v) => setFoodData((p: any) => ({ ...p, [k]: v })),
    drinks:  (k, v) => setDrinksData((p: any) => ({ ...p, [k]: v })),
    diving:  (k, v) => setDivingData((p: any) => ({ ...p, [k]: v })),
  }

  useEffect(() => {
    fetch(`/api/guest-form/${token}${bgId ? `?bg=${bgId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setGuest(data)
        setProfileData({
          firstName:      data.firstName      ?? '',
          lastName:       data.lastName       ?? '',
          gender:         data.gender         ?? '',
          email:          data.email          ?? '',
          phone:          data.phone          ?? '',
          passport:       data.passport       ?? '',
          dateOfBirth:    data.dateOfBirth    ? data.dateOfBirth.split('T')[0]    : '',
          address:        data.address        ?? '',
          nationality:    data.nationality    ?? '',
          passportExpiry: data.passportExpiry ? data.passportExpiry.split('T')[0] : '',
        })
        setMedicalData(data.medicalData ?? {})
        setFoodData(data.foodData       ?? {})
        setDrinksData(data.drinksData   ?? {})
        setDivingData(data.divingData   ?? {})
      })
      .catch(() => setError('Failed to load form'))
      .finally(() => setLoading(false))
  }, [token, bgId])

  const showDiving = guest?.hasDiving && !guest?.isOpenTrip
  const STEPS = ALL_STEPS.filter(s => s.id !== 'diving' || showDiving)
  const currentStep = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  const handleSave = async (andNext: boolean) => {
    setSaving(true)
    try {
      const section = currentStep.id
      const res = await fetch(`/api/guest-form/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data: dataMap[section] }),
      })
      if (!res.ok) throw new Error()
      setSaved(prev => new Set([...prev, section]))
      toast.success('Saved!')
      if (andNext) {
        if (isLast) {
          setAllDone(true)
        } else {
          const nextIdx = stepIdx + 1
          setMaxUnlocked(prev => Math.max(prev, nextIdx))
          setStepIdx(nextIdx)
        }
      }
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5]">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <img src={LOGO} alt="Samara" className="w-14 h-14 opacity-60 animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading your form…</p>
      </div>
    </div>
  )

  /* ── Error ── */
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5] px-4">
      <div className="text-center max-w-sm">
        <img src={LOGO} alt="Samara" className="w-16 h-16 mx-auto mb-4 opacity-70" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">Link Not Valid</h1>
        <p className="text-gray-500 text-sm">{error === 'This link has expired' ? 'This guest form link has expired. Please contact us for a new link.' : error}</p>
      </div>
    </div>
  )

  /* ── All Done ── */
  if (allDone) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5] px-4">
      <div className="text-center max-w-sm">
        <img src={LOGO} alt="Samara" className="w-20 h-20 mx-auto mb-5" />
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">All Done!</h1>
        <p className="text-gray-500 text-sm">Thank you for completing your guest profile. We look forward to welcoming you on board Samara Liveaboard.</p>
        {guest?.tripInfo && (
          <div className="mt-5 bg-white rounded-2xl border border-gray-100 px-5 py-4 text-sm text-gray-600 text-left">
            <p className="font-semibold text-gray-800 mb-1">{guest.tripInfo.yachtName ?? 'Samara'}</p>
            <p className="text-xs text-gray-400">{fmtDate(guest.tripInfo.startDate)} – {fmtDate(guest.tripInfo.endDate)}</p>
            {guest.tripInfo.destination && <p className="text-xs text-gray-400 mt-0.5">{guest.tripInfo.destination}</p>}
          </div>
        )}
      </div>
    </div>
  )

  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(' ') || guest?.name || 'Guest'
  const trip = guest?.tripInfo

  const renderSection = () => {
    const d = dataMap[currentStep.id]
    const onChange = setterMap[currentStep.id]
    switch (currentStep.id) {
      case 'profile': return <ProfileSection data={d} onChange={onChange} />
      case 'medical': return <MedicalSection data={d} onChange={onChange} />
      case 'food':    return <FoodSection data={d} onChange={onChange} />
      case 'drinks':  return <DrinksSection data={d} onChange={onChange} />
      case 'diving':  return <DivingSection data={d} onChange={onChange} />
    }
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <div className="min-h-screen bg-[#f0f4f5]">

        {/* ── Brand header ── */}
        <div style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0d3d47 100%)` }}>
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4 sm:pt-8 sm:pb-6">

            {/* Logo + brand */}
            <div className="flex items-center gap-3 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Samara" className="w-10 h-10 rounded-lg" />
              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-widest">Samara Liveaboard</p>
                <p className="text-white font-bold text-sm leading-tight">Guest Profile Form</p>
              </div>
            </div>

            {/* Guest greeting */}
            <div className="mb-5">
              <p className="text-white/60 text-[10px] uppercase tracking-widest mb-0.5">Welcome</p>
              <h1 className="text-xl sm:text-3xl font-extrabold text-white leading-tight">{guestName}</h1>
              <p className="text-white/50 text-xs sm:text-sm mt-1">Please complete all sections so we can prepare for your trip.</p>
            </div>

            {/* Trip info card */}
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

        {/* ── Step progress ── */}
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">

            {/* Mobile: thin progress bar + step label */}
            <div className="sm:hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: TEAL }}>
                  Step {stepIdx + 1} / {STEPS.length}
                </span>
                <span className="text-xs font-semibold text-gray-500">{currentStep.title}</span>
              </div>
              {/* Segmented bar */}
              <div className="flex gap-1">
                {STEPS.map((_, i) => {
                  const unlocked = i <= maxUnlocked
                  return (
                    <button
                      key={i}
                      onClick={() => unlocked && setStepIdx(i)}
                      disabled={!unlocked}
                      className="flex-1 h-1.5 rounded-full transition-all"
                      style={{
                        background: i < stepIdx ? '#10b981' : i === stepIdx ? TEAL : '#e5e7eb',
                        cursor: unlocked ? 'pointer' : 'not-allowed',
                        opacity: unlocked ? 1 : 0.4,
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Desktop: circles + labels, always fits */}
            <div className="hidden sm:flex items-center w-full">
              {STEPS.map((step, i) => {
                const done     = saved.has(step.id)
                const active   = i === stepIdx
                const unlocked = i <= maxUnlocked
                const locked   = !unlocked
                return (
                  <div key={step.id} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? '1' : 'none' }}>
                    <button
                      onClick={() => unlocked && setStepIdx(i)}
                      disabled={locked}
                      className="flex flex-col items-center gap-1.5 shrink-0"
                      style={{ cursor: locked ? 'not-allowed' : 'pointer' }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                        style={{
                          background: active ? TEAL : done ? '#10b981' : locked ? '#f3f4f6' : '#e5e7eb',
                          color: active || done ? 'white' : '#c4c9d0',
                          boxShadow: active ? `0 0 0 3px ${TEAL}30` : 'none',
                          opacity: locked ? 0.5 : 1,
                        }}
                      >
                        {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
                      </div>
                      <span
                        className="text-[11px] font-semibold whitespace-nowrap transition-colors"
                        style={{ color: active ? TEAL : done ? '#10b981' : '#c4c9d0' }}
                      >
                        {step.title}
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div
                        className="flex-1 h-px mx-2 mb-5 transition-all"
                        style={{ background: i < stepIdx ? '#10b981' : '#e5e7eb' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

          </div>
        </div>

        {/* ── Form body ── */}
        <div className="max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6">

          {/* Step header — only shown on desktop (mobile has it in the bar) */}
          <div className="mb-5">
            <span className="hidden sm:inline-block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: TEAL }}>
              Step {stepIdx + 1} of {STEPS.length}
            </span>
            <h2 className="text-xl font-extrabold text-gray-800">{currentStep.title}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{currentStep.subtitle}</p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-7">
            {renderSection()}
          </div>

          {/* Navigation */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={() => setStepIdx(i => i - 1)}
              disabled={stepIdx === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            <div className="flex items-center gap-2">
              {/* Save only (visible on desktop) */}
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-60 transition-all"
                style={{ borderColor: '#d1d5db' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              {/* Save & continue */}
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all shadow-sm"
                style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0d3d47 100%)` }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isLast ? 'Submit & Finish' : 'Save & Continue'}
                {!isLast && !saving && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Hint: must save to continue */}
          {!saved.has(currentStep.id) && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <Lock className="w-3 h-3" />
              <span>Save this section to unlock the next step</span>
            </div>
          )}

          {/* Progress text */}
          <p className="text-center text-xs text-gray-300 mt-3">
            {saved.size} of {STEPS.length} sections completed · All data is stored securely
          </p>

        </div>
      </div>
    </>
  )
}

export default function GuestFormPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#f0f4f5]">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Samara" className="w-14 h-14 opacity-60 animate-pulse" />
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    }>
      <GuestFormInner />
    </Suspense>
  )
}
