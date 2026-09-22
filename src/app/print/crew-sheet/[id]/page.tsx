import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PrintButton } from '../../PrintButton'
import { AttachmentPages } from '../../AttachmentPages'
import { getPrintContext } from '@/lib/print-helpers'

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmtRange(start: Date, end: Date) {
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const s  = start.getDate().toString().padStart(2, '0')
    const e  = end.getDate().toString().padStart(2, '0')
    return `${s}–${e} ${end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
  }
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// Filename-safe segment: strips spaces/punctuation so it works unquoted in a downloaded filename.
function slug(s: string) {
  return s.replace(/[^a-zA-Z0-9]+/g, '') || 'Trip'
}

// Shared across generateMetadata and the page component so the trip is only fetched once per request.
const getTrip = cache(async (id: string) => {
  const { db, company } = await getPrintContext()
  const trip = await db.openTrip.findUnique({
    where: { id },
    include: {
      yacht: { include: { crew: { orderBy: { position: 'asc' } } } },
      bookings: {
        where: { status: { not: 'cancelled' } },
        include: {
          customer: true, agent: true,
          guests: {
            include: { customer: true, cabin: true },
            orderBy: [{ isLead: 'desc' }, { id: 'asc' }],
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  return { company, trip }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { trip } = await getTrip(id)
  if (!trip) return {}
  const dateSlug = fmtRange(new Date(trip.startDate), new Date(trip.endDate)).replace(/–/g, '-').replace(/\s+/g, '')
  return { title: `CrewGuestSheet_${slug(trip.yacht?.name ?? '')}_${dateSlug}_AllGuests` }
}

const GOLD = '#bdac7e'
const DARK = '#1a252f'

/* ─── Shared pieces ────────────────────────────────────────────────────────── */
function Banner({ sub, name, logo }: { sub?: string; name: string; logo: string }) {
  return (
    <div style={{ background: `linear-gradient(135deg,${DARK} 0%,#0d1b2a 100%)`, borderBottom: `3px solid ${GOLD}`, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ color: GOLD, fontSize: 9, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 4px' }}>{name}</p>
        <h1 style={{ color: 'white', fontSize: 17, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>— Cruise Departure Guest Sheet —</h1>
        {sub && <p style={{ color: GOLD, fontSize: 11, margin: '4px 0 0' }}>{sub}</p>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={name} style={{ width: 44, height: 44, minWidth: 44, flexShrink: 0, objectFit: 'contain', opacity: 0.9 }} />
    </div>
  )
}


/* Underline field — pre-filled or blank */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#999', fontWeight: 700, margin: '0 0 2px' }}>{label}</p>
      <div style={{ borderBottom: `1.5px solid ${value ? DARK : '#ccc'}`, paddingBottom: 3, fontSize: 12, fontWeight: value ? 600 : 400, color: value ? DARK : '#ddd', minHeight: 20 }}>
        {value ?? ' '}
      </div>
    </div>
  )
}

/* Bordered fillable box */
function Box({ height = 52 }: { height?: number }) {
  return <div style={{ border: '1px solid #ddd', borderRadius: 3, minHeight: height }} />
}

/* Section with dark/gold title bar */
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

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default async function CrewSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { company, trip } = await getTrip(id)

  if (!trip) notFound()

  /* Flatten guests */
  type GuestRow = {
    no: number; bgId: string; name: string; phone: string; email: string; cabin: string
    isLead: boolean; isChild: boolean; isInfant: boolean; bookingCode: string; salesperson: string
    nationality: string; passport: string; passportExpiry: string; dateOfBirth: string
    gender: string; address: string
    arrivalPickupTime: string; arrivalHotel: string; arrivalFlight: string
    departurePickupTime: string; departureHotel: string; departureFlight: string
    emergencyContact: string; dietaryRequirements: string; allergies: string; drinkPreferences: string
    operationalNotes: string
    medicalData: any; foodData: any; drinksData: any; divingData: any
    passportImage: string
  }
  const fmtDate = (d: Date | null | undefined) => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const v = (obj: any, key: string) => obj?.[key] ? String(obj[key]) : undefined
  const getAgeYears = (dob: Date | null | undefined): number | null => {
    if (!dob) return null
    return new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970
  }
  const makeRow = (c: any, bg: any, cabin: string, isLead: boolean, bookingCode: string, salesperson: string): GuestRow => {
    const age = getAgeYears(c.dateOfBirth)
    const isInfant = age !== null ? age < 4 : false
    const isChild = isInfant ? false : (c.isChild === true || (age !== null && age < 12))
    return {
      no: 0, bgId: bg?.id ?? '', name: c.name, phone: c.phone ?? '', email: c.email ?? '', cabin, isLead, isChild, isInfant, bookingCode, salesperson,
      nationality: c.nationality ?? '', passport: c.passport ?? '',
      passportExpiry: fmtDate(c.passportExpiry), dateOfBirth: fmtDate(c.dateOfBirth),
      gender: c.gender ?? '', address: c.address ?? '',
      arrivalPickupTime: bg?.arrivalPickupTime ?? '', arrivalHotel: bg?.arrivalHotel ?? '', arrivalFlight: bg?.arrivalFlight ?? '',
      departurePickupTime: bg?.departurePickupTime ?? '', departureHotel: bg?.departureHotel ?? '', departureFlight: bg?.departureFlight ?? '',
      emergencyContact: c.emergencyContact ?? '', dietaryRequirements: c.dietaryRequirements ?? '',
      allergies: c.allergies ?? '', drinkPreferences: c.drinkPreferences ?? '',
      operationalNotes: c.operationalNotes ?? '',
      medicalData: c.medicalData ?? {}, foodData: c.foodData ?? {}, drinksData: c.drinksData ?? {},
      divingData: c.divingData ?? {},
      passportImage: c.passportImage ?? '',
    }
  }
  const guests: GuestRow[] = []
  let gNo = 1
  trip.bookings.forEach(b => {
    const sales = b.salesperson || b.agent?.name || 'Direct'
    if (b.guests.length > 0) {
      b.guests.forEach(g => { const r = makeRow(g.customer, g, g.cabin?.name ?? '', g.isLead, b.bookingCode, sales); r.no = gNo++; guests.push(r) })
    } else {
      const r = makeRow(b.customer, null, '', true, b.bookingCode, sales); r.no = gNo++; guests.push(r)
    }
  })

  const totalNights = Math.max(Math.round((trip.endDate.getTime() - trip.startDate.getTime()) / 86400000), 0)
  const totalDays   = totalNights + 1
  const dateRange   = fmtRange(trip.startDate, trip.endDate)
  const sub         = `${dateRange}  ·  Open Trip ${totalDays}D${totalNights}N  ·  ${trip.yacht.name}`
  const salesName   = trip.bookings[0]?.agent?.name ?? 'Direct'
  const BLANK       = Math.max(0, 12 - guests.length)
  const hasCabins   = guests.some(g => g.cabin)

  const infantCount = guests.filter(g => g.isInfant).length
  const childCount  = guests.filter(g => g.isChild).length
  const adultCount  = guests.length - infantCount - childCount
  const paxBreakdown = [
    `${adultCount} Adult${adultCount !== 1 ? 's' : ''}`,
    childCount  > 0 ? `${childCount} Child${childCount > 1 ? 'ren' : ''}` : null,
    infantCount > 0 ? `${infantCount} Infant${infantCount > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(', ')

  /* shared table cell styles */
  const th: React.CSSProperties = { padding: '8px 7px', textAlign: 'left', fontWeight: 700, fontSize: 10, letterSpacing: '0.4px', borderRight: '1px solid #444' }
  const td: React.CSSProperties = { padding: '8px 7px', fontSize: 11, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }

  /* page wrapper — page-break-before handles pagination; no break-inside to avoid blank pages */
  const page = (content: React.ReactNode, first = false, key?: string | number) => (
    <div key={key} style={{ pageBreakBefore: first ? 'avoid' : 'always', breakBefore: first ? 'avoid' : 'page' }}>
      {content}
    </div>
  )

  // Open Trip guests never fill in diving (see guest-form's showDiving = hasDiving && !isOpenTrip),
  // so the only document to attach here is the passport photo.
  const guestAttachments = (g: GuestRow): { label: string; value: string }[] =>
    g.passportImage ? [{ label: 'Passport / ID', value: g.passportImage }] : []

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
        .samara-page {
          display: flex;
          flex-direction: column;
        }
        .samara-page-body {
          flex: 1;
        }
        @media screen {
          .samara-page { border-bottom: 2px dashed #d0c89a; margin-bottom: 32px; padding-bottom: 24px; }
          .samara-page:last-child { border-bottom: none; margin-bottom: 0; }
        }
      `}</style>

      <PrintButton label="Save as PDF / Print" />

      {/* ═══════════════════════════════════ PAGE 1 — Instructions */}
      {page(
        <div className="samara-page">
          <Banner name={company.name} logo={company.logoUrl} />
          <div className="samara-page-body" style={{ padding: '16px 32px' }}>
            <p style={{ fontSize: 11, color: '#555', lineHeight: 1.8, marginBottom: 6 }}>
              Thank you for choosing Samara Yachting.
            </p>
            <p style={{ fontSize: 11, color: '#555', lineHeight: 1.8, marginBottom: 18 }}>
              Every journey is personal, and we look forward to making yours truly your own. The details you share with us will help our team understand your preferences, interests, and expectations, allowing us to thoughtfully prepare for your time onboard and create an experience tailored to you.
            </p>
            <p style={{ fontWeight: 700, fontSize: 12, color: GOLD, marginBottom: 8 }}>*Before your Journey</p>
            {[
              ['Arrival & Departure Transfers', 'We are pleased to arrange your transfer from your hotel or the airport to the harbour for your arrival. At the end of your journey, we can also arrange your transfer from the harbour to your hotel or the airport.'],
              ['Sailing Itineraries', 'Our itineraries are thoughtfully planned to make the most of each destination. As every journey at sea is guided by nature, the itinerary may be adjusted according to sea, weather, and local conditions, without prior notice.'],
              ['Wifi Onboard', 'While your journey takes you to remote islands and secluded waters, staying connected is still within reach. Wi-Fi is available onboard through Starlink.'],
              ['A Few Essentials', 'To help you settle in comfortably, we recommend bringing sun protection, light clothing, swimwear, and a camera to capture the moments along the way. Toiletries, drinking water, and snorkeling equipment are provided onboard, while diving equipment is available for diving trips. You are also welcome to bring your preferred personal items and snorkeling gear.'],
            ].map(([t, b]) => (
              <div key={t} style={{ marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>*{t}</p>
                <p style={{ color: '#444', lineHeight: 1.7, fontSize: 11 }}>{b}</p>
              </div>
            ))}
          </div>
        </div>,
        true
      )}

      {/* ═══════════════════════════════════ PAGE 3 — Guest Overview */}
      {page(
        <div className="samara-page">
          <Banner sub={sub} name={company.name} logo={company.logoUrl} />
          <div className="samara-page-body" style={{ padding: '16px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>Cruise / Boat / Details:</p>
              <p style={{ fontSize: 12, marginBottom: 1 }}>{dateRange}</p>
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Open Trip {totalDays}D{totalNights}N {trip.yacht.name.toUpperCase()}</p>
              <p style={{ fontSize: 11, marginBottom: 1 }}>Number of Guests: <strong>{guests.length} Pax</strong>{(childCount > 0 || infantCount > 0) && <span style={{ color: '#555', fontWeight: 400 }}> ({paxBreakdown})</span>}</p>
              <p style={{ fontSize: 11 }}>Sales: <strong>{salesName}</strong></p>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ backgroundColor: DARK, color: 'white' }}>
                  {['NO', 'GUEST NAME', 'CITIZENSHIP', 'ID NUMBER', 'EXP DATE', 'DOB', ...(hasCabins ? ['CABIN'] : []), 'ALLERGIES', 'SALES'].map((h, i, arr) => (
                    <th key={i} style={{ ...th, borderRight: i === arr.length - 1 ? 'none' : undefined, ...(h === 'ALLERGIES' ? { width: 62, textAlign: 'center' } : {}), ...(h === 'CABIN' ? { width: 72 } : {}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guests.map((g, i) => (
                  <tr key={g.no} style={{ background: i % 2 ? '#f9f9f9' : 'white' }}>
                    <td style={{ ...td, textAlign: 'center', color: '#888', width: 28 }}>{g.no}</td>
                    <td style={{ ...td, fontWeight: g.isLead ? 700 : 400 }}>
                      {g.name}{g.isLead && <span style={{ fontSize: 8, color: GOLD, marginLeft: 3 }}>★</span>}
                      {g.isInfant && <span style={{ display: 'inline-block', marginLeft: 4, fontSize: 8, fontWeight: 700, color: '#d97706', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3, padding: '0 4px' }}>INFANT</span>}
                      {g.isChild  && !g.isInfant && <span style={{ display: 'inline-block', marginLeft: 4, fontSize: 8, fontWeight: 700, color: '#2563eb', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 3, padding: '0 4px' }}>CHILD</span>}
                    </td>
                    <td style={td}>{g.nationality || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.passport || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.passportExpiry || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.dateOfBirth || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    {hasCabins && (
                      <td style={{ ...td, fontSize: 10, color: '#555' }}>{g.cabin || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    )}
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 10, color: g.allergies ? '#c0392b' : '#27ae60' }}>
                      {g.allergies ? 'YES' : 'NO'}
                    </td>
                    <td style={{ ...td, borderRight: 'none', fontSize: 10, color: '#555' }}>{g.salesperson}</td>
                  </tr>
                ))}
                {Array.from({ length: BLANK }).map((_, i) => (
                  <tr key={`b${i}`}>
                    <td style={{ ...td, textAlign: 'center', color: '#ccc', width: 28 }}>{guests.length + i + 1}</td>
                    {[...Array(hasCabins ? 7 : 6)].map((_, j) => <td key={j} style={td}>&nbsp;</td>)}
                    <td style={{ ...td, borderRight: 'none' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Allergy details */}
            {guests.some(g => g.allergies) && (
              <div style={{ marginTop: 12, padding: '8px 12px', border: `1px solid #f5c6c6`, borderRadius: 4, background: '#fff8f8' }}>
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

      {/* ═══════════════════════════════════ PAGES 4+ — One per guest, followed immediately by that guest's own attachments */}
      {guests.flatMap((g) => [
        page(
        <div className="samara-page">
          <Banner sub={sub} name={company.name} logo={company.logoUrl} />
          <div className="samara-page-body" style={{ padding: '14px 32px' }}>


            {/* Identity strip */}
            <div style={{ background: `${GOLD}18`, border: `1.5px solid ${GOLD}`, borderRadius: 5, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#999', marginBottom: 3 }}>
                  Guest {g.no} of {guests.length}{g.cabin ? `  ·  ${g.cabin}` : ''}{g.isLead ? '  ·  Group Leader' : ''}{g.isInfant ? '  ·  Infant' : g.isChild ? '  ·  Child' : ''}
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

            {/* Personal Details — 4 col */}
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

            {/* Operational Notes — crew/ops only, shown prominently so it isn't missed */}
            {g.operationalNotes && (
              <div style={{ background: '#fff8e6', border: '1.5px solid #e8b93f', borderRadius: 5, padding: '8px 12px', marginBottom: 10, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px', color: '#a1720b', fontWeight: 700, margin: '0 0 4px' }}>Notes — Crew &amp; Operations Only</p>
                <p style={{ fontSize: 12, color: DARK, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{g.operationalNotes}</p>
              </div>
            )}

            {/* Travel + Contact — 3 col */}
            {/* When Notes pushes this row past the remaining page space, Chrome's print
               engine moves the whole row to the next page anyway (can't split a grid row
               mid-break) — force the break here deliberately so it starts flush at the top
               of the next page instead of leaving a stray gap under Notes. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10, ...(g.operationalNotes ? { pageBreakBefore: 'always' as const, breakBefore: 'page' as const } : {}) }}>
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
                <Field label="Medical Conditions"   value={v(g.medicalData,'medicalConditions')} />
                <Field label="Medications"          value={v(g.medicalData,'medications')} />
                <Field label="Motion Sickness"      value={v(g.medicalData,'motionSickness')} />
                <Field label="Special Assistance"   value={v(g.medicalData,'specialAssistance')} />
                <Field label="Food Allergy"         value={v(g.medicalData,'foodAllergy')} />
                <Field label="Food Allergy Details" value={v(g.medicalData,'foodAllergyDetails')} />
                <Field label="Other Allergies"      value={v(g.medicalData,'otherAllergies')} />
                <Field label="Physical Limitations" value={v(g.medicalData,'physicalLimitations')} />
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #eee' }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#999', fontWeight: 700, margin: '0 0 4px' }}>Emergency Contact</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <Field label="Name"         value={v(g.medicalData,'emergencyContactName')} />
                  <Field label="Relationship" value={v(g.medicalData,'emergencyContactRelationship')} />
                  <Field label="Phone"        value={v(g.medicalData,'emergencyContactPhone')} />
                  <Field label="Email"        value={v(g.medicalData,'emergencyContactEmail')} />
                </div>
              </div>
            </Sec>

            {/* Food */}
            <Sec title="Food Preferences">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Dietary Type"      value={v(g.foodData,'dietaryType')} />
                <Field label="Allergy"           value={v(g.foodData,'allergy')} />
                <Field label="Allergy Details"   value={v(g.foodData,'allergyDetails')} />
                <Field label="Dislikes"          value={v(g.foodData,'dislikes')} />
                <Field label="Favorite Foods"    value={v(g.foodData,'favoriteFoods')} />
                <Field label="Breakfast"         value={v(g.foodData,'breakfastPreference')} />
                <Field label="Snack Preference"  value={v(g.foodData,'snackPreference')} />
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
            <Sec title="Drink Preferences" last>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Drinks Alcohol" value={v(g.drinksData,'drinksAlcohol')} />
                <Field label="Wine"           value={v(g.drinksData,'winePreference')} />
                <Field label="Spirits"        value={v(g.drinksData,'spiritsPreference')} />
                <Field label="Cocktail"       value={v(g.drinksData,'cocktailPreference')} />
                <Field label="Beer"           value={v(g.drinksData,'beerPreference')} />
                <Field label="Coffee"         value={v(g.drinksData,'coffeePreference')} />
                <Field label="Tea"            value={v(g.drinksData,'teaPreference')} />
                <Field label="Soft Drink"     value={v(g.drinksData,'softDrinkPreference')} />
                <Field label="Water"          value={v(g.drinksData,'waterPreference')} />
                <Field label="Drink Notes"    value={v(g.drinksData,'drinkNotes')} />
              </div>
            </Sec>

          </div>
        </div>,
        false,
        g.no
        ),
        ...guestAttachments(g).map((a, i) => (
          <AttachmentPages key={`${g.no}-att-${i}`} label={a.label} value={a.value} sub={g.name} />
        )),
      ])}
    </div>
  )
}
