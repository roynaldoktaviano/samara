import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PrintButton } from '../../../PrintButton'

function fmtRange(start: Date, end: Date) {
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const s = start.getDate().toString().padStart(2, '0')
    const e = end.getDate().toString().padStart(2, '0')
    return `${s}–${e} ${end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
  }
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'
const GOLD = '#bdac7e'
const DARK = '#1a252f'

function Banner({ sub }: { sub?: string }) {
  return (
    <div style={{ background: `linear-gradient(135deg,${DARK} 0%,#0d1b2a 100%)`, borderBottom: `3px solid ${GOLD}`, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ color: GOLD, fontSize: 9, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 4px' }}>Samara Liveaboard</p>
        <h1 style={{ color: 'white', fontSize: 17, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>— Cruise Departure Guest Sheet —</h1>
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
    <div style={{ marginBottom: last ? 0 : 10, pageBreakInside: 'avoid', breakInside: 'avoid', pageBreakAfter: last ? 'avoid' : 'auto', breakAfter: last ? 'avoid' : 'auto' }}>
      <div style={{ background: accent ? GOLD : DARK, color: 'white', padding: '5px 10px', fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', borderRadius: '3px 3px 0 0', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
        {title}
      </div>
      <div style={{ border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 3px 3px', padding: '10px 12px' }}>
        {children}
      </div>
    </div>
  )
}

export default async function CrewSheetBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      yacht: { include: { crew: { orderBy: { position: 'asc' } } } },
      agent: { select: { name: true } },
      guests: {
        include: { customer: true, cabin: true },
        orderBy: [{ isLead: 'desc' }, { id: 'asc' }],
      },
    },
  })

  if (!booking) notFound()

  const fmtDate = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  const fmtPickupTime = (raw: string | null | undefined) => {
    if (!raw) return ''
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
      const d = new Date(raw)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }
    return raw
  }

  type GuestRow = {
    no: number; bgId: string; name: string; phone: string; email: string; cabin: string
    isLead: boolean; isChild: boolean; bookingCode: string; salesperson: string
    nationality: string; passport: string; passportExpiry: string; dateOfBirth: string
    gender: string; address: string
    arrivalPickupTime: string; arrivalHotel: string; arrivalFlight: string
    departurePickupTime: string; departureHotel: string; departureFlight: string
    emergencyContact: string; dietaryRequirements: string; allergies: string; drinkPreferences: string
    medicalData: any; foodData: any; drinksData: any; divingData: any
  }

  const salesperson = booking.salesperson || booking.agent?.name || 'Direct'
  const guests: GuestRow[] = booking.guests.map((g, i) => ({
    no: i + 1,
    bgId: g.id,
    name: g.customer.name,
    phone: g.customer.phone ?? '',
    email: g.customer.email ?? '',
    cabin: g.cabin?.name ?? '',
    isLead: g.isLead,
    isChild: (g.customer as any).isChild ?? false,
    bookingCode: booking.bookingCode,
    salesperson,
    nationality: g.customer.nationality ?? '',
    passport: g.customer.passport ?? '',
    passportExpiry: fmtDate(g.customer.passportExpiry),
    dateOfBirth: fmtDate(g.customer.dateOfBirth),
    gender: (g.customer as any).gender ?? '',
    address: (g.customer as any).address ?? '',
    arrivalPickupTime: fmtPickupTime(g.arrivalPickupTime),
    arrivalHotel: g.arrivalHotel ?? '',
    arrivalFlight: g.arrivalFlight ?? '',
    departurePickupTime: fmtPickupTime(g.departurePickupTime),
    departureHotel: g.departureHotel ?? '',
    departureFlight: g.departureFlight ?? '',
    emergencyContact: g.customer.emergencyContact ?? '',
    dietaryRequirements: g.customer.dietaryRequirements ?? '',
    allergies: g.customer.allergies ?? '',
    drinkPreferences: g.customer.drinkPreferences ?? '',
    medicalData: (g.customer as any).medicalData ?? {},
    foodData:    (g.customer as any).foodData    ?? {},
    drinksData:  (g.customer as any).drinksData  ?? {},
    divingData:  (g.customer as any).divingData  ?? {},
  }))

  const totalDays   = Math.ceil((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000)
  const totalNights = Math.max(totalDays - 1, 0)
  const dateRange   = fmtRange(new Date(booking.startDate), new Date(booking.endDate))
  const yachtName   = booking.yacht?.name ?? ''
  const sub         = `${dateRange}  ·  Private Charter ${totalDays}D${totalNights}N  ·  ${yachtName}`
  const BLANK       = Math.max(0, 12 - guests.length)
  const showDiving  = (booking as any).hasDiving === true
  const adultCount  = guests.filter(g => !g.isChild).length
  const childCount  = guests.filter(g => g.isChild).length

  const th: React.CSSProperties = { padding: '8px 7px', textAlign: 'left', fontWeight: 700, fontSize: 10, letterSpacing: '0.4px', borderRight: '1px solid #444' }
  const td: React.CSSProperties = { padding: '8px 7px', fontSize: 11, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }

  const page = (content: React.ReactNode, first = false, key?: string | number) => (
    <div key={key} style={{ pageBreakBefore: first ? 'avoid' : 'always', breakBefore: first ? 'avoid' : 'page', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      {content}
    </div>
  )

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, color: DARK, background: 'white' }}>
      <style>{`
        @media print {
          body { background: white !important; margin: 0 !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 1cm 1cm 1.5cm; }
        @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #aaa; font-family: Arial, sans-serif; } }
        * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        p { margin: 0; }
        ul { margin: 0; }
        .samara-page { display: flex; flex-direction: column; min-height: 277mm; }
        .samara-page-body { flex: 1; }
        @media screen {
          .samara-page { border-bottom: 2px dashed #d0c89a; margin-bottom: 32px; padding-bottom: 24px; min-height: unset; }
          .samara-page:last-child { border-bottom: none; margin-bottom: 0; }
        }
      `}</style>

      <PrintButton label="Save as PDF / Print" />

      {/* PAGE 1 — Instructions */}
      {page(
        <div className="samara-page">
          <Banner />
          <div className="samara-page-body" style={{ padding: '16px 32px' }}>
            <p style={{ fontSize: 11, color: '#555', lineHeight: 1.8, marginBottom: 18 }}>
              Please fill in carefully the details in this sheet in order to prepare your departure the best possible way.
            </p>
            {[
              ['Harbor Clearance', "Please either fill in the clearance sheet with all data or send copies of all passengers' passport (for some ports, passport copies will be required)."],
              ['Sailing Itineraries', "Our itineraries are based on the best highlight spots and are always determined by factors such as weather and ocean conditions. Please re-confirm with the Boat's Manager onboard if a certain site or activity can be included."],
              ['Departure & Arrival Time', 'Departure and arrival times are flexible depending on your flight schedule — please check with us before booking flights and keep us updated about your flight details.'],
            ].map(([t, b]) => (
              <div key={t} style={{ marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>*{t}</p>
                <p style={{ color: '#444', lineHeight: 1.7, fontSize: 11 }}>{b}</p>
              </div>
            ))}
            <p style={{ fontWeight: 700, fontSize: 12, color: GOLD, marginBottom: 8 }}>*Things to bring</p>
            <ul style={{ paddingLeft: 16, color: '#444', lineHeight: 1.9, fontSize: 11 }}>
              {['Sun Protection (Hat / Sunglasses / Sunscreen)', 'Cash for National Park entrance fees', 'Pocket Cash — for snacks, crew tips, souvenirs, etc.', 'Camera', 'Light Clothing / Swimwear', 'Towels / basic toiletries are provided — you may bring your own if needed.', 'Snorkeling gear is provided onboard — personal gear always fits best.', 'Mineral water provided. Special beverage requests (Wines / Spirit) can be purchased onboard with advance notice.', 'Corkage fee IDR 150,000 / bottle for personal alcoholic beverages.']
              .map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </div>,
        true
      )}

      {/* PAGE 2 — DO's & DON'Ts */}
      {page(
        <div className="samara-page">
          <Banner />
          <div className="samara-page-body" style={{ padding: '16px 32px' }}>
            <p style={{ fontWeight: 700, marginBottom: 14, fontSize: 13 }}>
              <span style={{ color: '#27ae60' }}>*DO</span> and <span style={{ color: '#e74c3c' }}>DONT&apos;S</span> while sailing in Komodo National Park Area
            </p>
            <p style={{ marginBottom: 8, fontSize: 11 }}>You can enjoy visiting Komodo National Park if you <strong style={{ color: '#27ae60' }}>DO</strong> below:</p>
            <ul style={{ paddingLeft: 16, fontSize: 11, lineHeight: 1.9, marginBottom: 16, color: '#333' }}>
              {[['Stay hydrated.', ' The highest temperature in Komodo National Park is 55°C. Always bring water during activities (Trekking / beach time).'],
                ['Use Sunscreen, hat, light and comfortable clothes.', ''],
                ['Doing trekking only in Visiting Hour,', ' which must be booked in advance via online registration.'],
                ['Take nothing but pictures, Leave nothing but footprints.', ' Keep the islands clean and safe for all life-beings.'],
                ['Be in good condition to enjoy the trip at its fullest!', ' Personal medicine or vitamins should be brought along.'],
              ].map(([b, r], i) => <li key={i}><em><strong>{b}</strong></em>{r}</li>)}
            </ul>
            <p style={{ marginBottom: 8, fontSize: 11 }}>Things you <strong style={{ color: '#e74c3c' }}>should NOT do</strong>:</p>
            <ul style={{ paddingLeft: 16, fontSize: 11, lineHeight: 1.9, marginBottom: 20, color: '#333' }}>
              {[['Feeding wild Komodo Dragons are prohibited.', ' Do not feed or directly interact with any wildlife.'],
                ['Fireworks are not allowed inside Komodo National Park area.', ''],
                ['Fishing inside Komodo National Park area is prohibited.', ' Do not bring professional fishing gear.'],
                ['Do not litter.', ' Use rubbish bins on site or bring trash back to the boat.'],
                ['Do not step or touch the corals or any sea creatures', ' while snorkeling.'],
                ['Drones are NOT allowed above Komodo National Park area.', ' Advance permit + IDR 1,000,000 fee required.'],
              ].map(([b, r], i) => <li key={i}><em><strong>{b}</strong></em>{r}</li>)}
            </ul>
            <p style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>Samara Liveaboard Team</p>
          </div>
        </div>
      )}

      {/* PAGE 3 — Guest Overview */}
      {page(
        <div className="samara-page">
          <Banner sub={sub} />
          <div className="samara-page-body" style={{ padding: '16px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>Cruise / Boat / Details:</p>
              <p style={{ fontSize: 12, marginBottom: 1 }}>{dateRange}</p>
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Private Charter {totalDays}D{totalNights}N {yachtName.toUpperCase()}</p>
              <p style={{ fontSize: 11, marginBottom: 1 }}>
                Number of Guests: <strong>{guests.length} Pax</strong>
                {childCount > 0 && (
                  <span style={{ color: '#555', fontWeight: 400 }}>
                    {' '}(<strong>{adultCount}</strong> Adult{adultCount !== 1 ? 's' : ''}, <strong style={{ color: '#2563eb' }}>{childCount}</strong> Child{childCount !== 1 ? 'ren' : ''})
                  </span>
                )}
              </p>
              <p style={{ fontSize: 11 }}>Sales: <strong>{salesperson}</strong></p>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ backgroundColor: DARK, color: 'white' }}>
                  {['NO', 'GUEST NAME', 'CITIZENSHIP', 'ID NUMBER', 'EXP DATE', 'DOB', 'CABIN', 'ALLERGIES', 'SALES', ''].map((h, i) => (
                    <th key={i} style={{ ...th, borderRight: i === 9 ? 'none' : undefined, ...(h === 'ALLERGIES' ? { width: 62, textAlign: 'center' } : {}), ...(h === 'CABIN' ? { width: 72 } : {}), ...(h === '' ? { width: 32, textAlign: 'center' } : {}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guests.map((g, i) => (
                  <tr key={g.no} style={{ background: i % 2 ? '#f9f9f9' : 'white' }}>
                    <td style={{ ...td, textAlign: 'center', color: '#888', width: 28 }}>{g.no}</td>
                    <td style={{ ...td, fontWeight: g.isLead ? 700 : 400 }}>
                      {g.name}
                      {g.isLead && <span style={{ fontSize: 8, color: GOLD, marginLeft: 3 }}>★</span>}
                      {g.isChild && (
                        <span style={{ display: 'inline-block', marginLeft: 4, fontSize: 8, fontWeight: 700, color: '#2563eb', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 3, padding: '0 4px', lineHeight: '14px', verticalAlign: 'middle' }}>
                          CHILD
                        </span>
                      )}
                    </td>
                    <td style={td}>{g.nationality || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.passport || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.passportExpiry || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.dateOfBirth || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={{ ...td, fontSize: 10, color: '#555' }}>{g.cabin || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 10, color: g.allergies ? '#c0392b' : '#27ae60' }}>
                      {g.allergies ? 'YES' : 'NO'}
                    </td>
                    <td style={{ ...td, fontSize: 10, color: '#555' }}>{g.salesperson}</td>
                    <td style={{ ...td, borderRight: 'none', textAlign: 'center', padding: '4px' }}>
                      {g.bgId && (
                        <a
                          href={`/print/guest-sheet/${g.bgId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="no-print"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, background: `${GOLD}22`, border: `1px solid ${GOLD}`, color: DARK, textDecoration: 'none', fontSize: 11 }}
                          title={`Print sheet for ${g.name}`}
                        >
                          ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: BLANK }).map((_, i) => (
                  <tr key={`b${i}`}>
                    <td style={{ ...td, textAlign: 'center', color: '#ccc', width: 28 }}>{guests.length + i + 1}</td>
                    {[...Array(7)].map((_, j) => <td key={j} style={td}>&nbsp;</td>)}
                    <td style={{ ...td, borderRight: 'none' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {guests.some(g => g.allergies) && (
              <div style={{ marginTop: 12, padding: '8px 12px', border: '1px solid #f5c6c6', borderRadius: 4, background: '#fff8f8' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#c0392b', marginBottom: 6 }}>
                  Allergy Notes
                </p>
                {guests.filter(g => g.allergies).map(g => (
                  <p key={g.no} style={{ fontSize: 10, marginBottom: 3, color: DARK }}>
                    <span style={{ fontWeight: 700 }}>{g.no}. {g.name}</span>
                    <span style={{ color: '#555' }}> — {g.allergies}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAGES 4+ — One per guest */}
      {guests.map((g) => page(
        <div className="samara-page">
          <Banner sub={sub} />
          <div className="samara-page-body" style={{ padding: '14px 32px' }}>

            <div style={{ background: `${GOLD}18`, border: `1.5px solid ${GOLD}`, borderRadius: 5, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#999', marginBottom: 3 }}>
                  Guest {g.no} of {guests.length}{g.cabin ? `  ·  ${g.cabin}` : ''}{g.isLead ? '  ·  Group Leader' : ''}{g.isChild ? '  ·  Child' : ''}
                </p>
                <p style={{ fontSize: 19, fontWeight: 800, color: DARK, margin: 0 }}>{g.name}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: '#bbb', marginBottom: 2 }}>Booking Ref.</p>
                <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: DARK }}>{g.bookingCode}</p>
                <p style={{ fontSize: 9, color: '#bbb', marginTop: 6, marginBottom: 2 }}>Sales</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: GOLD }}>{g.salesperson}</p>
              </div>
            </div>

            <Sec title="Personal Details">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Citizenship / Nationality" value={g.nationality || undefined} />
                <Field label="Date of Birth (DOB)" value={g.dateOfBirth || undefined} />
                <Field label="Gender" value={g.gender || undefined} />
                <Field label="Address" value={g.address || undefined} />
                <Field label="Passport / ID Number" value={g.passport || undefined} />
                <Field label="Passport Expiry Date" value={g.passportExpiry || undefined} />
              </div>
            </Sec>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Sec title="Arrival Details" last>
                <Field label="Pick-up Date & Time" value={g.arrivalPickupTime || undefined} />
                <Field label="Hotel / Airport" value={g.arrivalHotel || undefined} />
                <Field label="Flight Number" value={g.arrivalFlight || undefined} />
              </Sec>
              <Sec title="Departure Details" last>
                <Field label="Pick-up Date & Time" value={g.departurePickupTime || undefined} />
                <Field label="Hotel / Airport" value={g.departureHotel || undefined} />
                <Field label="Flight Number" value={g.departureFlight || undefined} />
              </Sec>
              <Sec title="Contact Person" accent last>
                <Field label="Name" value={g.name} />
                <Field label="Phone Number" value={g.phone || undefined} />
                <Field label="Email Address" value={g.email || undefined} />
                <Field label="Emergency Contact" value={g.emergencyContact || undefined} />
              </Sec>
            </div>

            {/* Medical */}
            <Sec title="Medical & Health">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Medical Conditions"   value={g.medicalData?.medicalConditions || undefined} />
                <Field label="Medications"          value={g.medicalData?.medications || undefined} />
                <Field label="Motion Sickness"      value={g.medicalData?.motionSickness || undefined} />
                <Field label="Special Assistance"   value={g.medicalData?.specialAssistance || undefined} />
                <Field label="Food Allergy"         value={g.medicalData?.foodAllergy || undefined} />
                <Field label="Food Allergy Details" value={g.medicalData?.foodAllergyDetails || undefined} />
                <Field label="Other Allergies"      value={g.medicalData?.otherAllergies || undefined} />
                <Field label="Physical Limitations" value={g.medicalData?.physicalLimitations || undefined} />
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #eee' }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#999', fontWeight: 700, margin: '0 0 4px' }}>Emergency Contact</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <Field label="Name"         value={g.medicalData?.emergencyContactName || undefined} />
                  <Field label="Relationship" value={g.medicalData?.emergencyContactRelationship || undefined} />
                  <Field label="Phone"        value={g.medicalData?.emergencyContactPhone || undefined} />
                  <Field label="Email"        value={g.medicalData?.emergencyContactEmail || undefined} />
                </div>
              </div>
            </Sec>

            {/* Food */}
            <Sec title="Food Preferences">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Dietary Type"     value={g.foodData?.dietaryType || undefined} />
                <Field label="Allergy"          value={g.foodData?.allergy || undefined} />
                <Field label="Allergy Details"  value={g.foodData?.allergyDetails || undefined} />
                <Field label="Dislikes"         value={g.foodData?.dislikes || undefined} />
                <Field label="Favorite Foods"   value={g.foodData?.favoriteFoods || undefined} />
                <Field label="Breakfast"        value={g.foodData?.breakfastPreference || undefined} />
                <Field label="Snack Preference" value={g.foodData?.snackPreference || undefined} />
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #eee', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                {[['Halal','halal'],['Vegetarian','vegetarian'],['Vegan','vegan'],['Pescatarian','pescatarian'],['Gluten Free','glutenFree'],['Lactose Intolerant','lactoseIntolerant'],['Kosher','kosher']].map(([lbl,k]) => (
                  <span key={k} style={{ fontSize: 10, color: g.foodData?.[k] === 'yes' ? '#16a34a' : '#bbb', fontWeight: 600 }}>
                    {g.foodData?.[k] === 'yes' ? '✓' : '○'} {lbl}
                  </span>
                ))}
              </div>
            </Sec>

            {/* Drinks */}
            <Sec title="Drink Preferences" last={!showDiving}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Drinks Alcohol" value={g.drinksData?.drinksAlcohol || undefined} />
                <Field label="Wine"           value={g.drinksData?.winePreference || undefined} />
                <Field label="Spirits"        value={g.drinksData?.spiritsPreference || undefined} />
                <Field label="Cocktail"       value={g.drinksData?.cocktailPreference || undefined} />
                <Field label="Beer"           value={g.drinksData?.beerPreference || undefined} />
                <Field label="Coffee"         value={g.drinksData?.coffeePreference || undefined} />
                <Field label="Tea"            value={g.drinksData?.teaPreference || undefined} />
                <Field label="Soft Drink"     value={g.drinksData?.softDrinkPreference || undefined} />
                <Field label="Water"          value={g.drinksData?.waterPreference || undefined} />
                <Field label="Drink Notes"    value={g.drinksData?.drinkNotes || undefined} />
              </div>
            </Sec>

            {/* Diving — only for Private Charter with hasDiving */}
            {showDiving && (
              <Sec title="Diving" last>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <Field label="Is Diver"         value={g.divingData?.isDiver || undefined} />
                  <Field label="Dive Level"       value={g.divingData?.diveLevel || undefined} />
                  <Field label="Cert. Agency"     value={g.divingData?.certAgency || undefined} />
                  <Field label="No. of Dives"     value={g.divingData?.diveCount || undefined} />
                  <Field label="Last Dive Date"   value={g.divingData?.lastDiveDate || undefined} />
                  <Field label="Equipment Rental" value={g.divingData?.diveRentalRequired || undefined} />
                  <Field label="Wetsuit Size"     value={g.divingData?.wetsuitSize || undefined} />
                  <Field label="BCD Size"         value={g.divingData?.bcdSize || undefined} />
                  <Field label="Fins Size"        value={g.divingData?.finsSize || undefined} />
                  <Field label="Mask Size"        value={g.divingData?.maskSize || undefined} />
                  <Field label="Diving Notes"     value={g.divingData?.divingNotes || undefined} />
                </div>
              </Sec>
            )}

          </div>
        </div>,
        false,
        g.no
      ))}
    </div>
  )
}
