import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PrintButton } from '../../PrintButton'

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'
const GOLD = '#bdac7e'
const DARK = '#1a252f'

function Banner({ sub }: { sub?: string }) {
  return (
    <div style={{ background: `linear-gradient(135deg,${DARK} 0%,#0d1b2a 100%)`, borderBottom: `3px solid ${GOLD}`, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ color: GOLD, fontSize: 9, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 4px' }}>Samara Liveaboard</p>
        <h1 style={{ color: 'white', fontSize: 17, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>— Guest Information Sheet —</h1>
        {sub && <p style={{ color: GOLD, fontSize: 11, margin: '4px 0 0' }}>{sub}</p>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="Samara" style={{ width: 44, height: 44, opacity: 0.9 }} />
    </div>
  )
}


function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#999', fontWeight: 700, margin: '0 0 2px' }}>{label}</p>
      <div style={{ borderBottom: `1.5px solid ${value ? DARK : '#ccc'}`, paddingBottom: 3, fontSize: 12, fontWeight: value ? 600 : 400, color: value ? DARK : '#ddd', minHeight: 20 }}>
        {value ?? ' '}
      </div>
    </div>
  )
}

function Box({ height = 52 }: { height?: number }) {
  return <div style={{ border: '1px solid #ddd', borderRadius: 3, minHeight: height }} />
}

function Sec({ title, children, accent, last }: { title: string; children: React.ReactNode; accent?: boolean; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 10, pageBreakAfter: last ? 'avoid' : 'auto', breakAfter: last ? 'avoid' : 'auto' }}>
      <div style={{ background: accent ? GOLD : DARK, color: 'white', padding: '5px 10px', fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', borderRadius: '3px 3px 0 0', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
        {title}
      </div>
      <div style={{ border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 3px 3px', padding: '10px 12px' }}>
        {children}
      </div>
    </div>
  )
}

function fmtDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

function fmtPickupTime(raw: string | null | undefined) {
  if (!raw) return ''
  // datetime-local format: "2025-07-12T09:00"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  return raw // legacy free-text
}

function fmtRange(start: Date, end: Date) {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate().toString().padStart(2, '0')}–${end.getDate().toString().padStart(2, '0')} ${end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

export default async function GuestSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const bg = await db.bookingGuest.findUnique({
    where: { id },
    include: {
      customer: true,
      cabin: true,
      booking: {
        include: {
          openTrip: { include: { yacht: true } },
          yacht: true,
          agent: true,
        },
      },
    },
  })

  if (!bg) notFound()

  const c  = bg.customer
  const b  = bg.booking
  const ot = b.openTrip

  const startDate = ot ? ot.startDate : b.startDate
  const endDate   = ot ? ot.endDate   : b.endDate
  const yachtName = ot ? ot.yacht?.name : b.yacht?.name
  const tripTitle = ot
    ? (() => {
        const days   = Math.ceil((ot.endDate.getTime() - ot.startDate.getTime()) / 86400000)
        const nights = Math.max(days - 1, 0)
        return `Open Trip ${days}D${nights}N — ${ot.title}`
      })()
    : `Private Charter — ${b.destination ?? ''}`

  const dateRange = fmtRange(new Date(startDate), new Date(endDate))
  const sub       = `${dateRange}  ·  ${tripTitle}${yachtName ? `  ·  ${yachtName}` : ''}`
  const salesperson = b.salesperson || b.agent?.name || 'Direct'

  const med  = (c as any).medicalData  as Record<string,string> | null
  const food = (c as any).foodData     as Record<string,string> | null
  const drk  = (c as any).drinksData   as Record<string,string> | null
  const div  = (c as any).divingData   as Record<string,string> | null
  const showDiving = (b as any).hasDiving && b.tripType === 'PRIVATE_CHARTER'
  const v = (obj: Record<string,string> | null | undefined, key: string) => obj?.[key] ? String(obj[key]) : undefined

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, color: DARK, background: 'white' }}>
      <style>{`
        @media print {
          body { background: white !important; margin: 0 !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 1cm; }
        * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        p { margin: 0; }
      `}</style>

      <PrintButton label="Save as PDF / Print" />

      <Banner sub={sub} />

      <div style={{ padding: '14px 32px' }}>

        {/* Identity strip */}
        <div style={{ background: `${GOLD}18`, border: `1.5px solid ${GOLD}`, borderRadius: 5, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#999', marginBottom: 3 }}>
              {bg.cabin ? `Cabin: ${bg.cabin.name}  ·  ` : ''}{bg.isLead ? 'Group Leader' : 'Guest'}
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color: DARK, margin: 0 }}>{c.name}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 9, color: '#bbb', marginBottom: 2 }}>Booking Ref.</p>
            <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: DARK }}>{b.bookingCode}</p>
            <p style={{ fontSize: 9, color: '#bbb', marginTop: 6, marginBottom: 2 }}>Sales</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: GOLD }}>{salesperson}</p>
          </div>
        </div>

        {/* Personal Details */}
        <Sec title="Personal Details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Citizenship / Nationality" value={c.nationality ?? undefined} />
            <Field label="Date of Birth (DOB)" value={fmtDate(c.dateOfBirth)} />
            <Field label="Gender" value={c.gender ?? undefined} />
            <Field label="Address" value={c.address ?? undefined} />
            <Field label="Passport / ID Number" value={c.passport ?? undefined} />
            <Field label="Passport Expiry Date" value={fmtDate(c.passportExpiry)} />
          </div>
        </Sec>

        {/* Travel + Contact */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Sec title="Arrival Details" last>
            <Field label="Pick-up Date & Time" value={fmtPickupTime(bg.arrivalPickupTime)} />
            <Field label="Hotel / Airport" value={bg.arrivalHotel ?? undefined} />
            <Field label="Flight Number" value={bg.arrivalFlight ?? undefined} />
          </Sec>
          <Sec title="Departure Details" last>
            <Field label="Pick-up Date & Time" value={fmtPickupTime(bg.departurePickupTime)} />
            <Field label="Hotel / Airport" value={bg.departureHotel ?? undefined} />
            <Field label="Flight Number" value={bg.departureFlight ?? undefined} />
          </Sec>
          <Sec title="Contact Person" accent last>
            <Field label="Name" value={c.name} />
            <Field label="Phone Number" value={c.phone ?? undefined} />
            <Field label="Email Address" value={c.email ?? undefined} />
            <Field label="Emergency Contact" value={c.emergencyContact ?? undefined} />
          </Sec>
        </div>

        {/* Medical & Health */}
        <Sec title="Medical & Health">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Medical Conditions"    value={v(med,'medicalConditions')} />
            <Field label="Medications"           value={v(med,'medications')} />
            <Field label="Motion Sickness"       value={v(med,'motionSickness')} />
            <Field label="Special Assistance"    value={v(med,'specialAssistance')} />
            <Field label="Food Allergy"          value={v(med,'foodAllergy')} />
            <Field label="Food Allergy Details"  value={v(med,'foodAllergyDetails')} />
            <Field label="Other Allergies"       value={v(med,'otherAllergies')} />
            <Field label="Physical Limitations"  value={v(med,'physicalLimitations')} />
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #eee' }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#999', fontWeight: 700, margin: '0 0 4px' }}>Emergency Contact</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Name"           value={v(med,'emergencyContactName')} />
              <Field label="Relationship"   value={v(med,'emergencyContactRelationship')} />
              <Field label="Phone"          value={v(med,'emergencyContactPhone')} />
              <Field label="Email"          value={v(med,'emergencyContactEmail')} />
            </div>
          </div>
        </Sec>

        {/* Food Preferences */}
        <Sec title="Food Preferences">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Dietary Type"        value={v(food,'dietaryType')} />
            <Field label="Allergy"             value={v(food,'allergy')} />
            <Field label="Allergy Details"     value={v(food,'allergyDetails')} />
            <Field label="Dislikes"            value={v(food,'dislikes')} />
            <Field label="Favorite Foods"      value={v(food,'favoriteFoods')} />
            <Field label="Breakfast"           value={v(food,'breakfastPreference')} />
            <Field label="Snack Preference"    value={v(food,'snackPreference')} />
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #eee', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {[['Halal','halal'],['Vegetarian','vegetarian'],['Vegan','vegan'],['Pescatarian','pescatarian'],['Gluten Free','glutenFree'],['Lactose Intolerant','lactoseIntolerant'],['Kosher','kosher']].map(([lbl,k]) => (
              <span key={k} style={{ fontSize: 10, color: food?.[k] === 'yes' ? '#16a34a' : food?.[k] === 'no' ? '#aaa' : '#ccc', fontWeight: 600 }}>
                {food?.[k] === 'yes' ? '✓' : '○'} {lbl}
              </span>
            ))}
          </div>
        </Sec>

        {/* Drink Preferences */}
        <Sec title="Drink Preferences" last={!showDiving}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Drinks Alcohol"      value={v(drk,'drinksAlcohol')} />
            <Field label="Wine"                value={v(drk,'winePreference')} />
            <Field label="Spirits"             value={v(drk,'spiritsPreference')} />
            <Field label="Cocktail"            value={v(drk,'cocktailPreference')} />
            <Field label="Beer"                value={v(drk,'beerPreference')} />
            <Field label="Coffee"              value={v(drk,'coffeePreference')} />
            <Field label="Tea"                 value={v(drk,'teaPreference')} />
            <Field label="Soft Drink"          value={v(drk,'softDrinkPreference')} />
            <Field label="Water"               value={v(drk,'waterPreference')} />
            <Field label="Drink Notes"         value={v(drk,'drinkNotes')} />
          </div>
        </Sec>

        {/* Diving — only for Private Charter with hasDiving */}
        {showDiving && (
          <Sec title="Diving" last>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Is Diver"            value={v(div,'isDiver')} />
              <Field label="Dive Level"          value={v(div,'diveLevel')} />
              <Field label="Cert. Agency"        value={v(div,'certAgency')} />
              <Field label="No. of Dives"        value={v(div,'diveCount')} />
              <Field label="Last Dive Date"      value={v(div,'lastDiveDate')} />
              <Field label="Equipment Rental"    value={v(div,'diveRentalRequired')} />
              <Field label="Wetsuit Size"        value={v(div,'wetsuitSize')} />
              <Field label="BCD Size"            value={v(div,'bcdSize')} />
              <Field label="Fins Size"           value={v(div,'finsSize')} />
              <Field label="Mask Size"           value={v(div,'maskSize')} />
              <Field label="Diving Notes"        value={v(div,'divingNotes')} />
            </div>
          </Sec>
        )}

      </div>

    </div>
  )
}
