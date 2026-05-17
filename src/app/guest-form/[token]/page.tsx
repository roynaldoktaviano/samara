'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, Loader2, User, Heart, UtensilsCrossed, Wine, Bed, Star, Waves, Save } from 'lucide-react'
import { toast, Toaster } from 'sonner'

/* ── Types ── */
type Section = 'profile' | 'medical' | 'food' | 'drinks' | 'housekeeping' | 'service' | 'diving' | 'surfing'

interface GuestData {
  id: string; name: string; firstName: string; lastName: string
  gender: string; email: string; phone: string; passport: string
  dateOfBirth: string; address: string; nationality: string; passportExpiry: string
  emergencyContact: string
  medicalData: any; foodData: any; drinksData: any
  housekeepingData: any; serviceData: any; divingData: any; surfingData: any
  guestFormExpiresAt: string
}

const TABS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',      label: 'Profile',  icon: <User className="h-4 w-4" /> },
  { id: 'medical',      label: 'Medical',  icon: <Heart className="h-4 w-4" /> },
  { id: 'food',         label: 'Food',     icon: <UtensilsCrossed className="h-4 w-4" /> },
  { id: 'drinks',       label: 'Drinks',   icon: <Wine className="h-4 w-4" /> },
  { id: 'housekeeping', label: 'Room',     icon: <Bed className="h-4 w-4" /> },
  { id: 'service',      label: 'Service',  icon: <Star className="h-4 w-4" /> },
  { id: 'diving',       label: 'Diving',   icon: <Waves className="h-4 w-4" /> },
  { id: 'surfing',      label: 'Surfing',  icon: <Waves className="h-4 w-4" /> },
]

/* ── Field components ── */
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5f6e]/30 focus:border-[#1a5f6e] bg-white placeholder:text-gray-400 transition-colors"
const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5f6e]/30 focus:border-[#1a5f6e] bg-white text-gray-700 transition-colors"
const textareaCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5f6e]/30 focus:border-[#1a5f6e] bg-white placeholder:text-gray-400 transition-colors resize-none"

function YesNoSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      <option value="">Select</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )
}

/* ── Sections ── */
function ProfileSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => onChange(k, e.target.value)
  return (
    <div className="grid grid-cols-2 gap-4">
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
    <div className="grid grid-cols-2 gap-4">
      <Field label="Medical Conditions"><textarea rows={3} value={data.medicalConditions ?? ''} onChange={f('medicalConditions')} placeholder="e.g., Diabetes, Asthma" className={textareaCls} /></Field>
      <Field label="Medications"><textarea rows={3} value={data.medications ?? ''} onChange={f('medications')} placeholder="e.g., Insulin, Aspirin" className={textareaCls} /></Field>
      <Field label="Food Allergy">
        <YesNoSelect value={data.foodAllergy ?? ''} onChange={v => onChange('foodAllergy', v)} />
      </Field>
      <Field label="Food Allergy Details"><textarea rows={3} value={data.foodAllergyDetails ?? ''} onChange={f('foodAllergyDetails')} placeholder="Describe food allergies in detail" className={textareaCls} /></Field>
      <Field label="Other Allergies"><textarea rows={2} value={data.otherAllergies ?? ''} onChange={f('otherAllergies')} placeholder="e.g., Pollen, Pet, Medication" className={textareaCls} /></Field>
      <Field label="Motion Sickness">
        <YesNoSelect value={data.motionSickness ?? ''} onChange={v => onChange('motionSickness', v)} />
      </Field>
      <Field label="Physical Limitations"><textarea rows={2} value={data.physicalLimitations ?? ''} onChange={f('physicalLimitations')} placeholder="e.g., Mobility issues, Back pain" className={textareaCls} /></Field>
      <Field label="Mobility Notes"><textarea rows={2} value={data.mobilityNotes ?? ''} onChange={f('mobilityNotes')} placeholder="e.g., Wheelchair access needed" className={textareaCls} /></Field>
      <Field label="Special Assistance Required">
        <YesNoSelect value={data.specialAssistance ?? ''} onChange={v => onChange('specialAssistance', v)} />
      </Field>
      <Field label="Emergency Contact Name"><input value={data.emergencyContactName ?? ''} onChange={f('emergencyContactName')} placeholder="Full name" className={inputCls} /></Field>
      <Field label="Emergency Contact Relationship"><input value={data.emergencyContactRelationship ?? ''} onChange={f('emergencyContactRelationship')} placeholder="e.g., Spouse, Parent, Sibling" className={inputCls} /></Field>
      <Field label="Emergency Contact Phone"><input type="tel" value={data.emergencyContactPhone ?? ''} onChange={f('emergencyContactPhone')} placeholder="Phone number" className={inputCls} /></Field>
      <Field label="Emergency Contact Email" full><input type="email" value={data.emergencyContactEmail ?? ''} onChange={f('emergencyContactEmail')} placeholder="Email address" className={inputCls} /></Field>
    </div>
  )
}

function FoodSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  const yn = (k: string) => <YesNoSelect value={data[k] ?? ''} onChange={v => onChange(k, v)} />
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Dietary Type"><input value={data.dietaryType ?? ''} onChange={f('dietaryType')} placeholder="e.g., Vegan, Vegetarian" className={inputCls} /></Field>
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
      <Field label="Allergy Details"><textarea rows={3} value={data.allergyDetails ?? ''} onChange={f('allergyDetails')} placeholder="Describe allergies in detail" className={textareaCls} /></Field>
      <Field label="Dislikes"><textarea rows={3} value={data.dislikes ?? ''} onChange={f('dislikes')} placeholder="Foods the guest dislikes" className={textareaCls} /></Field>
      <Field label="Favorite Foods"><textarea rows={3} value={data.favoriteFoods ?? ''} onChange={f('favoriteFoods')} placeholder="Foods the guest enjoys" className={textareaCls} /></Field>
      <Field label="Breakfast Preference"><input value={data.breakfastPreference ?? ''} onChange={f('breakfastPreference')} placeholder="e.g., Continental, Full English" className={inputCls} /></Field>
      <Field label="Lactose Intolerant">{yn('lactoseIntolerant')}</Field>
      <Field label="Gluten Free">{yn('glutenFree')}</Field>
      <Field label="Halal">{yn('halal')}</Field>
      <Field label="Vegetarian">{yn('vegetarian')}</Field>
      <Field label="Vegan">{yn('vegan')}</Field>
      <Field label="Pescatarian">{yn('pescatarian')}</Field>
      <Field label="Kosher">{yn('kosher')}</Field>
      <Field label="Snack Preference"><input value={data.snackPreference ?? ''} onChange={f('snackPreference')} placeholder="e.g., Fruit, Nuts, Cookies" className={inputCls} /></Field>
    </div>
  )
}

function DrinksSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Drinks Alcohol">
        <YesNoSelect value={data.drinksAlcohol ?? ''} onChange={v => onChange('drinksAlcohol', v)} />
      </Field>
      <Field label="Wine Preference"><input value={data.winePreference ?? ''} onChange={f('winePreference')} placeholder="e.g., Red, White, Rosé" className={inputCls} /></Field>
      <Field label="Spirits Preference"><input value={data.spiritsPreference ?? ''} onChange={f('spiritsPreference')} placeholder="e.g., Vodka, Whiskey, Rum" className={inputCls} /></Field>
      <Field label="Cocktail Preference"><input value={data.cocktailPreference ?? ''} onChange={f('cocktailPreference')} placeholder="e.g., Mojito, Margarita" className={inputCls} /></Field>
      <Field label="Beer Preference"><input value={data.beerPreference ?? ''} onChange={f('beerPreference')} placeholder="e.g., Lager, Stout, IPA" className={inputCls} /></Field>
      <Field label="Coffee Preference"><input value={data.coffeePreference ?? ''} onChange={f('coffeePreference')} placeholder="e.g., Espresso, Cappuccino, Black" className={inputCls} /></Field>
      <Field label="Tea Preference"><input value={data.teaPreference ?? ''} onChange={f('teaPreference')} placeholder="e.g., Black, Green, Herbal" className={inputCls} /></Field>
      <Field label="Soft Drink Preference"><input value={data.softDrinkPreference ?? ''} onChange={f('softDrinkPreference')} placeholder="e.g., Cola, Juice, Lemonade" className={inputCls} /></Field>
      <Field label="Water Preference"><input value={data.waterPreference ?? ''} onChange={f('waterPreference')} placeholder="e.g., Still, Sparkling, Mineral" className={inputCls} /></Field>
      <Field label="Drink Notes"><textarea rows={3} value={data.drinkNotes ?? ''} onChange={f('drinkNotes')} placeholder="Add any additional drink preferences or notes" className={textareaCls} /></Field>
    </div>
  )
}

function HousekeepingSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  const yn = (k: string) => <YesNoSelect value={data[k] ?? ''} onChange={v => onChange(k, v)} />
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Bed Setup Preference">
        <select value={data.bedSetup ?? ''} onChange={e => onChange('bedSetup', e.target.value)} className={selectCls}>
          <option value="">Select</option>
          <option value="twin">Twin beds</option>
          <option value="double">Double / Queen</option>
          <option value="king">King</option>
          <option value="no_preference">No preference</option>
        </select>
      </Field>
      <Field label="Pillow Preference"><input value={data.pillowPreference ?? ''} onChange={f('pillowPreference')} placeholder="e.g., Soft, Firm, Extra pillows" className={inputCls} /></Field>
      <Field label="Towel Change Preference"><input value={data.towelChange ?? ''} onChange={f('towelChange')} placeholder="e.g., Daily, Every other day" className={inputCls} /></Field>
      <Field label="Bathroom Notes"><textarea rows={2} value={data.bathroomNotes ?? ''} onChange={f('bathroomNotes')} placeholder="e.g., Ensuite bathroom preferred" className={textareaCls} /></Field>
      <Field label="Cleaning Notes"><textarea rows={2} value={data.cleaningNotes ?? ''} onChange={f('cleaningNotes')} placeholder="e.g., No scented cleaners, Extra cleaning needed" className={textareaCls} /></Field>
      <Field label="Baby Cot Required">{yn('babyCotRequired')}</Field>
      <Field label="Umbrella Required">{yn('umbrellaRequired')}</Field>
      <Field label="Beach Setup Required">{yn('beachSetupRequired')}</Field>
      <Field label="Room Comfort Notes" full><textarea rows={3} value={data.roomComfortNotes ?? ''} onChange={f('roomComfortNotes')} placeholder="e.g., Temperature preference, Noise concerns" className={textareaCls} /></Field>
    </div>
  )
}

function ServiceSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="VIP Level"><input value={data.vipLevel ?? ''} onChange={f('vipLevel')} placeholder="e.g., Gold, Silver, Platinum" className={inputCls} /></Field>
      <Field label="Celebration Type"><input value={data.celebrationType ?? ''} onChange={f('celebrationType')} placeholder="e.g., Honeymoon, Birthday, Anniversary" className={inputCls} /></Field>
      <Field label="Celebration Notes"><textarea rows={3} value={data.celebrationNotes ?? ''} onChange={f('celebrationNotes')} placeholder="Special requests for the celebration" className={textareaCls} /></Field>
      <Field label="Beach Dining Requested">
        <YesNoSelect value={data.beachDiningRequested ?? ''} onChange={v => onChange('beachDiningRequested', v)} />
      </Field>
      <Field label="Excursion Requests"><textarea rows={3} value={data.excursionRequests ?? ''} onChange={f('excursionRequests')} placeholder="e.g., Snorkeling, Island tours, Water sports" className={textareaCls} /></Field>
      <Field label="Activity Preferences"><textarea rows={3} value={data.activityPreferences ?? ''} onChange={f('activityPreferences')} placeholder="e.g., Yoga, Spa, Cultural activities" className={textareaCls} /></Field>
      <Field label="Guest Handling Notes"><textarea rows={3} value={data.guestHandlingNotes ?? ''} onChange={f('guestHandlingNotes')} placeholder="e.g., Prefers privacy, Extra attentive service" className={textareaCls} /></Field>
      <Field label="Special Requests"><textarea rows={3} value={data.specialRequests ?? ''} onChange={f('specialRequests')} placeholder="Any other special requests" className={textareaCls} /></Field>
    </div>
  )
}

function DivingSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  const yn = (k: string) => <YesNoSelect value={data[k] ?? ''} onChange={v => onChange(k, v)} />
  return (
    <div className="grid grid-cols-2 gap-4">
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
      <Field label="Certification Agency"><input value={data.certAgency ?? ''} onChange={f('certAgency')} placeholder="e.g., PADI, SSI, NAUI" className={inputCls} /></Field>
      <Field label="Number of Dives"><input type="number" value={data.diveCount ?? ''} onChange={f('diveCount')} placeholder="Total logged dives" className={inputCls} /></Field>
      <Field label="Last Dive Date"><input type="date" value={data.lastDiveDate ?? ''} onChange={f('lastDiveDate')} className={inputCls} /></Field>
      <Field label="Equipment Rental Required">{yn('diveRentalRequired')}</Field>
      <Field label="Wetsuit Size"><input value={data.wetsuitSize ?? ''} onChange={f('wetsuitSize')} placeholder="e.g., S, M, L, XL" className={inputCls} /></Field>
      <Field label="BCD Size"><input value={data.bcdSize ?? ''} onChange={f('bcdSize')} placeholder="e.g., S, M, L, XL" className={inputCls} /></Field>
      <Field label="Fins Size"><input value={data.finsSize ?? ''} onChange={f('finsSize')} placeholder="e.g., 40-41, 42-43" className={inputCls} /></Field>
      <Field label="Mask Size"><input value={data.maskSize ?? ''} onChange={f('maskSize')} placeholder="e.g., Small, Medium, Large" className={inputCls} /></Field>
      <Field label="Diving Notes" full><textarea rows={3} value={data.divingNotes ?? ''} onChange={f('divingNotes')} placeholder="Preferred dive conditions, interests..." className={textareaCls} /></Field>
    </div>
  )
}

function SurfingSection({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(k, e.target.value)
  const yn = (k: string) => <YesNoSelect value={data[k] ?? ''} onChange={v => onChange(k, v)} />
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Is Surfer">{yn('isSurfer')}</Field>
      <Field label="Surf Level">
        <select value={data.surfLevel ?? ''} onChange={e => onChange('surfLevel', e.target.value)} className={selectCls}>
          <option value="">Select</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </Field>
      <Field label="Bringing Own Board">{yn('bringingOwnBoard')}</Field>
      <Field label="Board Count"><input type="number" value={data.boardCount ?? ''} onChange={f('boardCount')} placeholder="Number of boards" className={inputCls} /></Field>
      <Field label="Board Type"><input value={data.boardType ?? ''} onChange={f('boardType')} placeholder="e.g., Shortboard, Longboard, Funboard" className={inputCls} /></Field>
      <Field label="Board Length"><input value={data.boardLength ?? ''} onChange={f('boardLength')} placeholder="e.g., 5'8" className={inputCls} /></Field>
      <Field label="Board Width"><input value={data.boardWidth ?? ''} onChange={f('boardWidth')} placeholder='e.g., 19"' className={inputCls} /></Field>
      <Field label="Board Volume"><input value={data.boardVolume ?? ''} onChange={f('boardVolume')} placeholder="e.g., 28L, 30L" className={inputCls} /></Field>
      <Field label="Rental Required">{yn('surfRentalRequired')}</Field>
      <Field label="Coaching Required">{yn('coachingRequired')}</Field>
      <Field label="Photo / Video Interest">{yn('photoVideoInterest')}</Field>
      <Field label="Surfing Notes" full><textarea rows={3} value={data.surfingNotes ?? ''} onChange={f('surfingNotes')} placeholder="e.g., Preferred break, conditions preference" className={textareaCls} /></Field>
    </div>
  )
}

/* ── Main Page ── */
export default function GuestFormPage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [guest, setGuest]       = useState<GuestData | null>(null)
  const [activeTab, setActiveTab] = useState<Section>('profile')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState<Set<Section>>(new Set())

  /* Per-section form state */
  const [profileData,      setProfileData]      = useState<any>({})
  const [medicalData,      setMedicalData]      = useState<any>({})
  const [foodData,         setFoodData]         = useState<any>({})
  const [drinksData,       setDrinksData]       = useState<any>({})
  const [housekeepingData, setHousekeepingData] = useState<any>({})
  const [serviceData,      setServiceData]      = useState<any>({})
  const [divingData,       setDivingData]       = useState<any>({})
  const [surfingData,      setSurfingData]      = useState<any>({})

  const dataMap: Record<Section, any> = {
    profile:      profileData,
    medical:      medicalData,
    food:         foodData,
    drinks:       drinksData,
    housekeeping: housekeepingData,
    service:      serviceData,
    diving:       divingData,
    surfing:      surfingData,
  }

  const setterMap: Record<Section, (k: string, v: string) => void> = {
    profile:      (k, v) => setProfileData((p: any) => ({ ...p, [k]: v })),
    medical:      (k, v) => setMedicalData((p: any) => ({ ...p, [k]: v })),
    food:         (k, v) => setFoodData((p: any) => ({ ...p, [k]: v })),
    drinks:       (k, v) => setDrinksData((p: any) => ({ ...p, [k]: v })),
    housekeeping: (k, v) => setHousekeepingData((p: any) => ({ ...p, [k]: v })),
    service:      (k, v) => setServiceData((p: any) => ({ ...p, [k]: v })),
    diving:       (k, v) => setDivingData((p: any) => ({ ...p, [k]: v })),
    surfing:      (k, v) => setSurfingData((p: any) => ({ ...p, [k]: v })),
  }

  useEffect(() => {
    fetch(`/api/guest-form/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setGuest(data)
        setProfileData({
          firstName: data.firstName ?? '',
          lastName:  data.lastName  ?? '',
          gender:    data.gender    ?? '',
          email:     data.email     ?? '',
          phone:     data.phone     ?? '',
          passport:  data.passport  ?? '',
          dateOfBirth:    data.dateOfBirth    ? data.dateOfBirth.split('T')[0]    : '',
          address:        data.address        ?? '',
          nationality:    data.nationality    ?? '',
          passportExpiry: data.passportExpiry ? data.passportExpiry.split('T')[0] : '',
        })
        setMedicalData(data.medicalData      ?? {})
        setFoodData(data.foodData            ?? {})
        setDrinksData(data.drinksData        ?? {})
        setHousekeepingData(data.housekeepingData ?? {})
        setServiceData(data.serviceData      ?? {})
        setDivingData(data.divingData        ?? {})
        setSurfingData(data.surfingData      ?? {})
      })
      .catch(() => setError('Failed to load form'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      const section = activeTab
      const res = await fetch(`/api/guest-form/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data: dataMap[section] }),
      })
      if (!res.ok) throw new Error()
      setSaved(prev => new Set([...prev, section]))
      toast.success('Saved successfully!')
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading your form…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link Not Valid</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(' ') || guest?.name || 'Guest'
  const initials  = guestName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const renderSection = () => {
    const d = dataMap[activeTab]
    const onChange = setterMap[activeTab]
    switch (activeTab) {
      case 'profile':      return <ProfileSection data={d} onChange={onChange} />
      case 'medical':      return <MedicalSection data={d} onChange={onChange} />
      case 'food':         return <FoodSection data={d} onChange={onChange} />
      case 'drinks':       return <DrinksSection data={d} onChange={onChange} />
      case 'housekeeping': return <HousekeepingSection data={d} onChange={onChange} />
      case 'service':      return <ServiceSection data={d} onChange={onChange} />
      case 'diving':       return <DivingSection data={d} onChange={onChange} />
      case 'surfing':      return <SurfingSection data={d} onChange={onChange} />
      default:             return null
    }
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-[#1a5f6e] text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center text-white font-bold text-lg shrink-0">
                {initials || <User className="h-6 w-6" />}
              </div>
              <div>
                <p className="text-xs text-white/60 uppercase tracking-widest font-semibold mb-0.5">Guest Profile Form</p>
                <h1 className="text-xl sm:text-2xl font-bold">{guestName}</h1>
                <p className="text-xs text-white/50 mt-0.5">Please fill in your details so we can prepare for your trip</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-4 sm:grid-cols-8">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1 py-2.5 text-[10px] sm:text-xs font-medium transition-colors border-b-2 relative',
                    activeTab === tab.id
                      ? 'border-[#1a5f6e] text-[#1a5f6e] bg-teal-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {tab.icon}
                  <span className="leading-none">{tab.label}</span>
                  {saved.has(tab.id) && (
                    <CheckCircle className="h-2.5 w-2.5 text-emerald-500 absolute top-1 right-1" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="bg-white rounded-2xl border shadow-sm p-5 sm:p-8">
            <h2 className="text-base font-bold text-gray-800 mb-5 capitalize">
              {TABS.find(t => t.id === activeTab)?.label} Information
            </h2>

            {renderSection()}

            {/* Save button */}
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-gray-400">All information is stored securely.</p>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#1a5f6e' }}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><Save className="h-4 w-4" /> Save {TABS.find(t => t.id === activeTab)?.label}</>
                }
              </button>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400">
              {saved.size} of {TABS.length} sections completed
              {saved.size === TABS.length && ' · All done! Thank you.'}
            </p>
          </div>
        </div>

      </div>
    </>
  )
}
