import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PrintButton } from '../../PrintButton'

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

const LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png'
const GOLD = '#bdac7e'
const DARK = '#1a252f'

/* ─── Shared pieces ────────────────────────────────────────────────────────── */
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

function Footer() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: `2px solid ${GOLD}`, paddingTop: 10, margin: '12px 32px 16px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="Samara" style={{ width: 22, height: 22 }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '4px', color: DARK }}>SAMARA</span>
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
    <div style={{ marginBottom: last ? 0 : 10 }}>
      <div style={{ background: accent ? GOLD : DARK, color: 'white', padding: '5px 10px', fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', borderRadius: '3px 3px 0 0' }}>
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

  if (!trip) notFound()

  /* Flatten guests */
  type GuestRow = {
    no: number; name: string; phone: string; email: string; cabin: string
    isLead: boolean; bookingCode: string; salesperson: string
    nationality: string; passport: string; passportExpiry: string; dateOfBirth: string
    arrivalPickupTime: string; arrivalHotel: string; arrivalFlight: string
    departurePickupTime: string; departureHotel: string; departureFlight: string
    emergencyContact: string; dietaryRequirements: string; allergies: string; drinkPreferences: string
  }
  const fmtDate = (d: Date | null | undefined) => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const makeRow = (c: any, bg: any, cabin: string, isLead: boolean, bookingCode: string, salesperson: string): GuestRow => ({
    no: 0, name: c.name, phone: c.phone ?? '', email: c.email ?? '', cabin, isLead, bookingCode, salesperson,
    nationality: c.nationality ?? '', passport: c.passport ?? '',
    passportExpiry: fmtDate(c.passportExpiry), dateOfBirth: fmtDate(c.dateOfBirth),
    arrivalPickupTime: bg?.arrivalPickupTime ?? '', arrivalHotel: bg?.arrivalHotel ?? '', arrivalFlight: bg?.arrivalFlight ?? '',
    departurePickupTime: bg?.departurePickupTime ?? '', departureHotel: bg?.departureHotel ?? '', departureFlight: bg?.departureFlight ?? '',
    emergencyContact: c.emergencyContact ?? '', dietaryRequirements: c.dietaryRequirements ?? '',
    allergies: c.allergies ?? '', drinkPreferences: c.drinkPreferences ?? '',
  })
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

  const totalDays   = Math.ceil((trip.endDate.getTime() - trip.startDate.getTime()) / 86400000)
  const totalNights = Math.max(totalDays - 1, 0)
  const dateRange   = fmtRange(trip.startDate, trip.endDate)
  const sub         = `${dateRange}  ·  Open Trip ${totalDays}D${totalNights}N  ·  ${trip.yacht.name}`
  const salesName   = trip.bookings[0]?.agent?.name ?? 'Direct'
  const BLANK       = Math.max(0, 12 - guests.length)

  /* shared table cell styles */
  const th: React.CSSProperties = { padding: '8px 7px', textAlign: 'left', fontWeight: 700, fontSize: 10, letterSpacing: '0.4px', borderRight: '1px solid #444' }
  const td: React.CSSProperties = { padding: '8px 7px', fontSize: 11, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }

  /* page wrapper — NO minHeight; page-break-before handles pagination */
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
        @page { size: A4 portrait; margin: 1cm; }
        * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        p { margin: 0; }
        ul { margin: 0; }
        .samara-page {
          display: flex;
          flex-direction: column;
          min-height: 277mm;
        }
        .samara-page-body {
          flex: 1;
        }
        @media screen {
          .samara-page { border-bottom: 2px dashed #d0c89a; margin-bottom: 32px; padding-bottom: 24px; min-height: unset; }
          .samara-page:last-child { border-bottom: none; margin-bottom: 0; }
        }
      `}</style>

      <PrintButton label="Save as PDF / Print" />

      {/* ═══════════════════════════════════ PAGE 1 — Instructions */}
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
          <Footer />
        </div>,
        true
      )}

      {/* ═══════════════════════════════════ PAGE 2 — DO's & DON'Ts */}
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
          <Footer />
        </div>
      )}

      {/* ═══════════════════════════════════ PAGE 3 — Guest Overview */}
      {page(
        <div className="samara-page">
          <Banner sub={sub} />
          <div className="samara-page-body" style={{ padding: '16px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>Cruise / Boat / Details:</p>
              <p style={{ fontSize: 12, marginBottom: 1 }}>{dateRange}</p>
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Open Trip {totalDays}D{totalNights}N {trip.yacht.name.toUpperCase()}</p>
              <p style={{ fontSize: 11, marginBottom: 1 }}>Number of Guests: <strong>{guests.length} Pax</strong></p>
              <p style={{ fontSize: 11 }}>Sales: <strong>{salesName}</strong></p>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ backgroundColor: DARK, color: 'white' }}>
                  {['NO', 'GUEST NAME', 'CITIZENSHIP', 'ID NUMBER', 'EXP DATE', 'DOB', 'FOOD ALLERGIES', 'SALES'].map((h, i) => (
                    <th key={h} style={{ ...th, borderRight: i === 7 ? 'none' : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guests.map((g, i) => (
                  <tr key={g.no} style={{ background: i % 2 ? '#f9f9f9' : 'white' }}>
                    <td style={{ ...td, textAlign: 'center', color: '#888', width: 28 }}>{g.no}</td>
                    <td style={{ ...td, fontWeight: g.isLead ? 700 : 400 }}>
                      {g.name}{g.isLead && <span style={{ fontSize: 8, color: GOLD, marginLeft: 3 }}>★</span>}
                    </td>
                    <td style={td}>{g.nationality || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.passport || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.passportExpiry || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.dateOfBirth || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={td}>{g.allergies || <span style={{ color: '#ccc' }}>&nbsp;</span>}</td>
                    <td style={{ ...td, borderRight: 'none', fontSize: 10, color: '#555' }}>{g.salesperson}</td>
                  </tr>
                ))}
                {Array.from({ length: BLANK }).map((_, i) => (
                  <tr key={`b${i}`}>
                    <td style={{ ...td, textAlign: 'center', color: '#ccc', width: 28 }}>{guests.length + i + 1}</td>
                    {[...Array(5)].map((_, j) => <td key={j} style={td}>&nbsp;</td>)}
                    <td style={{ ...td, borderRight: 'none' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footer />
        </div>
      )}

      {/* ═══════════════════════════════════ PAGES 4+ — One per guest */}
      {guests.map((g) => page(
        <div className="samara-page">
          <Banner sub={sub} />
          <div className="samara-page-body" style={{ padding: '14px 32px' }}>


            {/* Identity strip */}
            <div style={{ background: `${GOLD}18`, border: `1.5px solid ${GOLD}`, borderRadius: 5, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#999', marginBottom: 3 }}>
                  Guest {g.no} of {guests.length}{g.cabin ? `  ·  ${g.cabin}` : ''}{g.isLead ? '  ·  Group Leader' : ''}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 16px' }}>
                <Field label="Citizenship / Nationality" value={g.nationality || undefined} />
                <Field label="Passport / ID Number" value={g.passport || undefined} />
                <Field label="Passport Expiry Date" value={g.passportExpiry || undefined} />
                <Field label="Date of Birth (DOB)" value={g.dateOfBirth || undefined} />
              </div>
            </Sec>

            {/* Travel + Contact — 3 col */}
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

            {/* Food + Drink — 2 col */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Sec title="Food Preferences" last>
                {g.dietaryRequirements
                  ? <div style={{ fontSize: 12, color: DARK, minHeight: 54, lineHeight: 1.6 }}>{g.dietaryRequirements}</div>
                  : <Box height={54} />}
              </Sec>
              <Sec title="Drink Preferences" last>
                {g.drinkPreferences
                  ? <div style={{ fontSize: 12, color: DARK, minHeight: 54, lineHeight: 1.6 }}>{g.drinkPreferences}</div>
                  : <Box height={54} />}
              </Sec>
            </div>

            {/* Allergies */}
            <Sec title="Food Allergies">
              {g.allergies
                ? <div style={{ fontSize: 12, color: DARK, minHeight: 46, lineHeight: 1.6 }}>{g.allergies}</div>
                : <Box height={46} />}
            </Sec>

            {/* Extra Services */}
            <Sec title="Extra Services / Special Requests" last>
              <Box height={50} />
            </Sec>

          </div>
          <Footer />
        </div>,
        false,
        g.no
      ))}
    </div>
  )
}
