'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

interface CompanyInfo {
  name: string
  logoUrl: string
  address: string
  phone: string
  website: string
  email: string
}

interface BookingDetail {
  bookingCode: string
  tripType: string
  startDate: string
  endDate: string
  destination: string | null
  salesperson: string | null
  customer: { name: string }
  yacht?: { name: string } | null
  openTrip?: { title: string; destination?: string | null; yacht?: { name: string } | null } | null
  agent?: { name: string } | null
  salespersonUser?: { name: string } | null
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

const ACCENT = '#bdac7e'
const NAVY = '#1a3050'

export default function BookingConfirmationLetterPage() {
  const { id } = useParams<{ id: string }>()
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [bookingData, companyData] = await Promise.all([
        fetch(`/api/bookings/${id}`).then(r => r.json()),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setBooking(bookingData)
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && booking && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, booking])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading letter…
    </div>
  )
  if (!booking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Booking not found.
    </div>
  )

  const co = company ?? {
    name:    'Samara Yachting',
    logoUrl: 'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png',
    address: 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234',
    phone:   '+62 859-5495-1085',
    website: 'samaraliveaboard.com',
    email:   'info@samaraliveaboard.com',
  }

  const isOpenTrip  = booking.tripType === 'OPEN_TRIP'
  const vesselName  = isOpenTrip ? (booking.openTrip?.yacht?.name ?? booking.yacht?.name ?? '—') : (booking.yacht?.name ?? '—')
  const destination = booking.destination ?? booking.openTrip?.destination ?? '—'
  const nights      = Math.max(1, Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000))
  const days        = nights + 1
  const agentName   = booking.agent?.name ?? null

  const detailRows: [string, string][] = [
    ['Guest Name', booking.customer.name],
    ...(booking.agent?.name ? [['Booking Agent', booking.agent.name] as [string, string]] : []),
    ['Vessel', vesselName],
    ['Destination', destination],
    ['Travel Dates', `${fmtDate(booking.startDate)} – ${fmtDate(booking.endDate)}`],
    ['Duration', `${days} Days / ${nights} Nights`],
  ]

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f3f4f6; }
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { background: white; }
          .stmt-pg { box-shadow: none !important; }
        }
        @media screen {
          body { padding: 24px 0 40px; }
        }
        .stmt-pg {
          width: 210mm;
          min-height: 297mm;
          background: white;
          margin: 0 auto;
          box-shadow: 0 2px 18px rgba(0,0,0,.15);
          padding: 20mm 22mm;
          font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
          font-size: 11pt;
          color: #1f2937;
          display: flex;
          flex-direction: column;
        }
      `}</style>

      <div className="stmt-pg">
        {/* Letterhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${ACCENT}`, paddingBottom: 16, marginBottom: 30 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={co.logoUrl} alt={co.name} style={{ height: 34, objectFit: 'contain' }} />
          <div style={{ textAlign: 'right', fontSize: 9, color: '#6b7280', lineHeight: 1.6 }}>
            {/* <div style={{ fontWeight: 700, color: '#111827', fontSize: 10 }}>{co.name}</div> */}
              {/* <div>{co.address}</div>
              <div>{co.email}</div> */}
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#111827' }}>
            Booking Confirmation Letter
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: '#374151', marginBottom: 18 }}>
          Date: Bali, {fmtDate(new Date().toISOString())}
        </div>

        <div style={{ fontSize: 11, marginBottom: 14 }}>To Whom It May Concern,</div>

        <p style={{ fontSize: 11, lineHeight: 1.7, textAlign: 'justify', marginBottom: 18 }}>
          This letter confirms that <strong>{co.name}</strong> has received and confirmed the booking
          {agentName ? <> made through Agent <strong>{agentName}</strong></> : null}, for the following guest:
        </p>

        {/* Details block */}
        <div style={{ marginBottom: 22, borderRadius: 6, overflow: 'hidden', border: `1px solid ${NAVY}` }}>
          <div style={{ background: NAVY, color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', padding: '8px 16px' }}>
            Booking Details
          </div>
          <div>
            {detailRows.map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', background: i % 2 === 1 ? '#f4f6fb' : '#fff' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: NAVY, flexShrink: 0 }} />
                <span style={{ color: NAVY, width: 120, flexShrink: 0, fontWeight: 700, fontSize: 10.5 }}>{k}</span>
                <span style={{ color: '#111827', fontSize: 10.5 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, lineHeight: 1.7, textAlign: 'justify', marginBottom: 14 }}>
          The above reservation has been confirmed with <strong>{co.name}</strong>, and the guest is scheduled to join the {vesselName} voyage on the dates stated above.
        </p>

        <p style={{ fontSize: 11, lineHeight: 1.7, textAlign: 'justify', marginBottom: 14 }}>
          This letter is issued upon the guest&apos;s request for confirmation of the booking.
        </p>

        <p style={{ fontSize: 11, lineHeight: 1.7, textAlign: 'justify', marginBottom: 40 }}>
          Should you require any further information, please feel free to contact us.
        </p>

        <div style={{ fontSize: 11 }}>Warm regards,</div>

        <div style={{ marginTop: 10, fontSize: 11 }}>
          <div style={{ fontWeight: 700 }}>Marc Christoffel</div>
          <div style={{ color: '#6b7280', fontSize: 10, marginTop: 1 }}>General Manager</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/signature-marc.png" alt="Signature" style={{ height: 60, objectFit: 'contain', display: 'block', marginTop: 2, marginBottom: 2 }} />
          <div style={{ color: '#6b7280', fontSize: 10 }}>marc@samarayachting.com</div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 20, fontSize: 8, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
          <div>
             <span>{co.address}</span><br/>
              <span>{co.email}</span><br/>
            <span>{co.website}</span>
          </div>
          <span>Booking No. {booking.bookingCode}</span>
        </div>
      </div>
    </>
  )
}
