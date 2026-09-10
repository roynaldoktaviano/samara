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
  totalPrice: number
  depositPaid: number
  discount: number
  vatType: string | null
  vatValue: number
  currency: string
  exchangeRate: number | null
  depositDueDate: string | null
  finalDueDate: string | null
  depositDueDateInvoiceOverride: string | null
  finalDueDateInvoiceOverride: string | null
  services: { name: string; price: number; quantity: number }[]
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

const ACCENT = '#bdac7e'
const NAVY = '#1a3050'
const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', IDR: 'Rp', SGD: 'S$', AUD: 'A$', GBP: '£' }

// A bordered, dark-headed box of label/value rows — used for the Charter Price and Payment
// Summary sections. `total`, when given, renders as a highlighted closing row.
function PriceBox({ title, rows, total }: { title: string; rows: [string, string][]; total?: [string, string] }) {
  return (
    <div className="nb" style={{ flex: 1, borderRadius: 6, overflow: 'hidden', border: `1px solid ${NAVY}` }}>
      <div style={{ background: NAVY, color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', padding: '7px 16px' }}>
        {title}
      </div>
      <div>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5.5px 16px', background: i % 2 === 1 ? '#f4f6fb' : '#fff' }}>
            <span style={{ color: '#374151', fontSize: 10.5 }}>{k}</span>
            <span style={{ color: '#111827', fontSize: 10.5, fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        {total && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 16px', background: NAVY }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{total[0]}</span>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{total[1]}</span>
          </div>
        )}
      </div>
    </div>
  )
}

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

  const currency   = booking.currency || 'USD'
  const currSymbol = CURRENCY_SYMBOLS[currency] || currency
  const isIDR      = currency === 'IDR'
  const fmtAmt = (usd: number) => {
    const local = currency === 'USD' ? usd : usd * (booking.exchangeRate || 1)
    if (isIDR) return `Rp ${local.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
    return `${currSymbol} ${local.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // totalPrice is base + services − discount, then VAT-inclusive (see Bookings.tsx) — strip VAT
  // back out first (shown as its own line), then services, to reconstruct the raw per-night rate.
  const servicesTotal    = booking.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
  const vatType           = booking.vatType === 'PERCENT' ? 'PERCENT' : 'FIXED'
  const vatValue           = booking.vatValue ?? 0
  const subtotalBeforeVat = vatType === 'PERCENT' && vatValue ? booking.totalPrice / (1 + vatValue / 100) : booking.totalPrice - vatValue
  const vatAmt             = booking.totalPrice - subtotalBeforeVat
  const discountAmt        = booking.discount || 0
  const baseAfterDisc      = subtotalBeforeVat - servicesTotal
  const baseRaw            = baseAfterDisc + discountAmt
  const perNightRate       = baseRaw / nights
  const outstandingBalance = Math.max(0, booking.totalPrice - booking.depositPaid)
  // Payment/cancellation terms tier is set by the per-night rate (see the invoice T&C).
  const isHighTier         = perNightRate >= 5000

  const priceRows: [string, string][] = [
    [`${nights} ${nights === 1 ? 'Night' : 'Nights'} × ${fmtAmt(perNightRate)}`, fmtAmt(baseRaw)],
    ...(discountAmt > 0 ? [['Discount', `−${fmtAmt(discountAmt)}`] as [string, string]] : []),
    ...booking.services.map(s => [`${s.name}${(s.quantity ?? 1) > 1 ? ` ×${s.quantity}` : ''}`, fmtAmt(s.price * (s.quantity ?? 1))] as [string, string]),
    ['Subtotal', fmtAmt(subtotalBeforeVat)],
    ...(vatAmt > 0 ? [[vatType === 'PERCENT' ? `Indonesian Tax (${vatValue}%)` : 'Taxes & Fees', fmtAmt(vatAmt)] as [string, string]] : []),
  ]

  const paymentRows: [string, string][] = [
    ['Outstanding Balance', fmtAmt(outstandingBalance)],
    ...(booking.depositDueDate ? [['Deposit Due Date', fmtDate(booking.depositDueDateInvoiceOverride ?? booking.depositDueDate)] as [string, string]] : []),
    ...(booking.finalDueDate ? [['Balance Due Date', fmtDate(booking.finalDueDateInvoiceOverride ?? booking.finalDueDate)] as [string, string]] : []),
    ['Currency', currency !== 'USD' && booking.exchangeRate ? `${currency} (1 USD = ${booking.exchangeRate.toLocaleString('en-US', { maximumFractionDigits: isIDR ? 0 : 4 })} ${currency})` : currency],
  ]

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
        .nb { break-inside: avoid; page-break-inside: avoid; }
        .stmt-pg {
          width: 210mm;
          min-height: 297mm;
          background: white;
          margin: 0 auto;
          box-shadow: 0 2px 18px rgba(0,0,0,.15);
          padding: 15mm 22mm;
          font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
          font-size: 11pt;
          color: #1f2937;
          display: flex;
          flex-direction: column;
        }
      `}</style>

      <div className="stmt-pg">
        {/* Letterhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${ACCENT}`, paddingBottom: 12, marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={co.logoUrl} alt={co.name} style={{ height: 34, objectFit: 'contain' }} />
          <div style={{ fontSize: 10.5, color: '#374151' }}>
            Bali, {fmtDate(new Date().toISOString())}
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#111827' }}>
            Booking Confirmation Letter
          </div>
        </div>

        <div style={{ fontSize: 11, marginBottom: 8 }}>Dear {booking.customer.name},</div>

        <p style={{ fontSize: 11, lineHeight: 1.6, textAlign: 'justify', marginBottom: 10 }}>
          This letter confirms that <strong>{co.name}</strong> has received and confirmed the booking
          {agentName ? <> made through Agent <strong>{agentName}</strong></> : null}, for the following guest:
        </p>

        {/* Details block */}
        <div className="nb" style={{ marginBottom: 14, borderRadius: 6, overflow: 'hidden', border: `1px solid ${NAVY}` }}>
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

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
          <PriceBox title="Charter Price" rows={priceRows} total={['Total Charter Price', fmtAmt(booking.totalPrice)]} />
          <PriceBox title="Payment Summary" rows={paymentRows} />
        </div>

        <p style={{ fontSize: 11, lineHeight: 1.5, textAlign: 'justify', marginBottom: 8 }}>
          The above reservation has been confirmed with <strong>{co.name}</strong>, and the guest is scheduled to join the {vesselName} voyage on the dates stated above.
        </p>

        <div className="nb" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Cancellation Terms</div>
          <p style={{ fontSize: 9.5, lineHeight: 1.5, textAlign: 'justify', color: '#374151' }}>
            A non-refundable deposit of 30% is required to confirm this booking, with the balance settled no later than {isHighTier ? '90 days' : '30 days'} before departure (full payment is required for bookings made within {isHighTier ? '90 days' : '30 days'} of departure). Cancellations made more than {isHighTier ? '90 days' : '30 days'} before departure are refundable minus the deposit; cancellations made {isHighTier ? '90 days' : '30 days'} or less before departure are non-refundable. Full Terms &amp; Conditions are provided together with the invoice.
          </p>
        </div>

        <div className="nb" style={{ marginBottom: 10, display: 'flex', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Included</div>
            <ul style={{ paddingLeft: 15, fontSize: 9.5, lineHeight: 1.45, color: '#374151' }}>
              <li>Transfers to/from local airport or hotel</li>
              <li>Accommodation onboard the vessel</li>
              <li>All meals, snacks, coffee/tea, mineral water and local beers</li>
              <li>Scuba diving for certified divers and water sports equipment (where available)</li>
              <li>Guided excursions and scheduled activities</li>
            </ul>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Not Included</div>
            <ul style={{ paddingLeft: 15, fontSize: 9.5, lineHeight: 1.45, color: '#374151' }}>
              <li>Alcoholic beverages</li>
              <li>Domestic flights and hotel stays outside the trip</li>
              <li>Travel insurance</li>
              <li>Crew gratuities (suggested 10% of trip value)</li>
              <li>Optional activities not listed in the itinerary</li>
            </ul>
          </div>
        </div>

        <p style={{ fontSize: 11, lineHeight: 1.5, textAlign: 'justify', marginBottom: 14 }}>
          This letter is issued upon the guest&apos;s request for confirmation of the booking, and to serve as a summary of the charter price and payment terms agreed above. Should you require any further information, please feel free to contact us.
        </p>

        <div className="nb" style={{ fontSize: 11 }}>
          Warm regards,
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 700 }}>Marc Christoffel</div>
            <div style={{ color: '#6b7280', fontSize: 10, marginTop: 1 }}>General Manager</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/signature-marc.png" alt="Signature" style={{ height: 46, objectFit: 'contain', display: 'block', marginTop: 2, marginBottom: 2 }} />
            <div style={{ color: '#6b7280', fontSize: 10 }}>marc@samarayachting.com</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 14, fontSize: 8, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
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
