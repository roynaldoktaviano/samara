'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface CompanyInfo {
  name:    string
  logoUrl: string
  tagline: string
  address: string
  phone:   string
  website: string
  email:   string
  showTnc: boolean
}

interface BankDetail {
  name: string
  bankAddress: string | null
  swiftCode: string | null
  beneficiaryName: string | null
  idrAccount: string | null
  usdAccount: string | null
  address: string | null
}

interface PaymentDetail {
  id: string
  invoiceNumber: string
  paymentType: string
  paymentMethod?: string | null
  billToType?: string | null
  showNetAmount?: boolean
  showCommissionNote?: boolean
  previouslyPaid: number
  amount: number
  currency: string
  status: string
  notes?: string
  createdAt: string
  bank?: BankDetail | null
  paymentLink?: string | null
  booking: {
    bookingCode: string
    tripType: string
    startDate: string
    endDate: string
    destination?: string
    totalPrice: number
    depositPaid: number
    discount: number
    guestCount: number
    salesperson?: string
    currency?: string
    exchangeRate?: number
    depositDueDate?: string
    finalDueDate?: string
    customer: { name: string; email?: string; phone?: string; address?: string; gender?: string | null }
    yacht?: { name: string; model?: string }
    openTrip?: { title: string; destination?: string; yacht?: { name: string } }
    source?: string
    agent?: { name: string; commissionOpenTrip?: number; commissionPrivateCharter?: number }
    services: Array<{ name: string; price: number; quantity: number }>
    guests: Array<{
      isLead: boolean
      customer: { name: string } | null
      cabin: { name: string } | null
    }>
  }
}


const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const ACCENT = '#bdac7e'
const salutation = (gender?: string | null) => {
  const g = gender?.toLowerCase()
  return g === 'female' ? 'Mrs.' : g === 'male' ? 'Mr.' : ''
}
const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', IDR: 'Rp' }

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const currencyOverride = searchParams.get('currency')?.toUpperCase() ?? null
  const showNetParam = searchParams.get('showNet')
  const showNetOverride = showNetParam === null ? null : showNetParam === 'true'
  const showNoteParam = searchParams.get('showNote')
  const showNoteOverride = showNoteParam === null ? null : showNoteParam === 'true'
  const [payment,   setPayment]   = useState<PaymentDetail | null>(null)
  const [company,   setCompany]   = useState<CompanyInfo | null>(null)
  const [loading,   setLoading]   = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [paymentData, companyData] = await Promise.all([
        fetch(`/api/payments/${id}`).then(r => r.json()),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setPayment(paymentData)
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && payment && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, payment])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading invoice…
    </div>
  )
  if (!payment) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Invoice not found.
    </div>
  )

  const co = company ?? {
    name:    'Samara Liveaboard',
    logoUrl: 'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png',
    tagline: 'PREMIUM YACHT EXPERIENCES',
    address: 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234',
    phone:   '+62 859-5495-1085',
    website: 'samaraliveaboard.com',
    email:   'inquiry@samaraliveaboard.com',
    showTnc: true,
  }

  const b              = payment.booking
  const tripName       = b.tripType === 'OPEN_TRIP' ? (b.openTrip?.title ?? '—') : (b.yacht?.name ?? '—')
  const destination    = b.destination ?? b.openTrip?.destination ?? '—'
  const vesselName     = b.tripType === 'OPEN_TRIP' ? (b.openTrip?.yacht?.name ?? b.yacht?.name ?? '—') : (b.yacht?.name ?? '—')
  const isAgentBooking = b.source === 'AGENT' && !!b.agent
  const billToAgent    = isAgentBooking && (payment.billToType !== 'CUSTOMER')

  const nights         = Math.max(1, Math.round((new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86400000))
  const days           = nights + 1
  const packageLabel   = `${b.tripType === 'OPEN_TRIP' ? 'Shared Trip' : 'Private Charter'} – ${days} Days / ${nights} Nights ${vesselName}`

  const invoiceCurrency = currencyOverride ?? b.currency ?? 'USD'
  const rate            = (invoiceCurrency !== 'USD' && b.exchangeRate) ? b.exchangeRate : 1
  const currSymbol      = CURRENCY_SYMBOLS[invoiceCurrency] || '$'
  const isIDR           = invoiceCurrency === 'IDR'

  const toLocal = (usd: number) => usd * rate
  const fmtAmt  = (usd: number) => {
    const local = toLocal(usd)
    if (isIDR) return `Rp ${local.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
    return `${currSymbol} ${local.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const servicesTotal  = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
  const discountAmt    = b.discount
  const showNet        = showNetOverride ?? payment.showNetAmount
  const showCommissionNote = showNet && (showNoteOverride ?? payment.showCommissionNote ?? false)
  const commissionPct  = isAgentBooking && showNet
    ? (b.tripType === 'OPEN_TRIP' ? (b.agent!.commissionOpenTrip ?? 0) : (b.agent!.commissionPrivateCharter ?? 0))
    : 0
  const baseRaw        = b.totalPrice - servicesTotal
  const baseAfterDisc  = baseRaw - discountAmt
  const commissionAmt  = baseAfterDisc * commissionPct / 100
  const afterDiscount  = b.totalPrice - discountAmt - commissionAmt
  const remaining      = Math.max(0, afterDiscount - payment.previouslyPaid - payment.amount)
  const displayBase    = baseAfterDisc - commissionAmt

  const guestsWithCabin = b.guests.filter(g => g.cabin)
  const hasCabins = guestsWithCabin.length > 0

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f3f4f6; }
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { background: white; }
          .so  { display: none !important; }
          .il  { display: none !important; }
          .inv-bd { display: block !important; height: auto !important; min-height: calc(297mm - 3cm) !important; }
          .nc  { break-inside: avoid; page-break-inside: avoid; }
          .pb  { page-break-before: always; break-before: page; }
          .sp  { display: block !important; }
          .tnc-page { width: 210mm; height: 297mm; overflow: hidden; page-break-inside: avoid; }
          .tnc-page img { width: 100%; height: 100%; object-fit: contain; display: block; }
        }
        @media screen {
          table.inv { display: block; max-width: 660px; margin: 0 auto; background: white; }
          table.inv > thead, table.inv > tfoot { display: none; }
          table.inv > tbody, table.inv > tbody > tr, table.inv > tbody > tr > td { display: block; }
          body { padding: 24px 0 40px; }
          .sp  { display: none; }
        }
        .tnc-wrap { display:flex; flex-direction:column; align-items:center; gap:20px; padding:20px 0 40px; }
        .tnc-pg { width:210mm; height:297mm; background:#fff; box-shadow:0 2px 18px rgba(0,0,0,.22); overflow:hidden; display:flex; flex-direction:column; font-family:'Inter','Helvetica Neue',Arial,sans-serif; font-size:10pt; color:#1f2937; }
        @media print {
          .tnc-pg { page-break-before:always; break-before:page; box-shadow:none; }
          .tnc-wrap { padding:0; gap:0; }
        }
        .pg-header { background-color:#1a3050 !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; display:flex; justify-content:space-between; align-items:center; padding:10px 16mm 11px; flex-shrink:0; }
        .pg-body { flex:1; padding:9mm 16mm 18mm; overflow:hidden; }
        .pg-footer { background-color:#1a3050 !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; display:grid; grid-template-columns:1fr auto 1fr; gap:6mm; padding:8px 16mm; align-items:center; flex-shrink:0; }
        .ft-addr { font-size:5.5pt; color:rgba(255,255,255,.72) !important; line-height:1.65; }
        .ft-addr strong { color:rgba(255,255,255,.9) !important; font-size:6pt; display:block; }
        .ft-num { font-size:9pt; color:rgba(255,255,255,.9) !important; text-align:center; }
        .ft-contact { font-size:5.5pt; color:rgba(255,255,255,.72) !important; text-align:right; line-height:1.65; }
        .sec-h { font-weight:700; font-size:10pt; margin:11px 0 5px; }
        .body-p { font-size:10pt; line-height:1.62; text-align:justify; margin-bottom:8px; }
        .clauses { list-style:none; padding-left:8mm; }
        .clauses li { display:flex; margin-bottom:4px; font-size:10pt; line-height:1.6; text-align:justify; }
        .cn { min-width:26px; flex-shrink:0; }
        .ct { flex:1; }
        .sub-list { list-style:disc; padding-left:14mm; }
        .sub-list li { font-size:9.5pt; line-height:1.6; margin-bottom:3px; }
      `}</style>

      <table className="inv" style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: '#1f2937' }}>

        {/* ── Repeating print header ── */}
        <thead>
          <tr>
            <td style={{ background: 'white', padding: '11px 32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 8, letterSpacing: 2, color: '#b8a882', textTransform: 'uppercase', fontWeight: 600 }}>
                  {payment.invoiceNumber}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={co.logoUrl}
                  alt={co.name}
                  style={{ height: 22, objectFit: 'contain', display: 'block' }}
                />
              </div>
            </td>
          </tr>
        </thead>

        {/* ── Repeating print footer ── */}
        <tfoot>
          <tr>
            <td style={{ background: 'white', padding: '10px 32px 13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#374151', marginBottom: 3 }}>
                    {co.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.6 }}>{co.website}</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.6 }}>{co.address.split(',').pop()?.trim() ?? 'Bali, Indonesia'}</div>
                </div>
                <div style={{
                  fontFamily: 'Palatino Linotype, Palatino, Book Antiqua, Georgia, serif',
                  fontSize: 24,
                  color: ACCENT,
                  fontStyle: 'italic',
                  fontWeight: 400,
                  lineHeight: 1,
                  letterSpacing: 0.5,
                }}>
                  Thank you
                </div>
              </div>
            </td>
          </tr>
        </tfoot>

        {/* ── Content ── */}
        <tbody>
          <tr>
            <td>
              <div className="inv-bd" style={{
                maxWidth: 660,
                margin: '0 auto',
                background: 'white',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 'calc(297mm - 1.4cm)',
                position: 'relative',
              }}>

        {/* ── Page 1 wrapper ── */}
        <div>

        {/* ── Top accent bar (screen only — print uses fixed header) ── */}
        <div className="so" style={{ backgroundColor: ACCENT, height: 5, flexShrink: 0 }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div className="il" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '14px 22px', borderRight: '1px solid #e5e7eb', minWidth: 190 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={co.logoUrl}
              alt={co.name}
              style={{ width: 120, objectFit: 'contain' }}
            />
            {co.tagline && <div style={{ color: '#9ca3af', fontSize: 8, letterSpacing: 1.5, marginTop: 4 }}>{co.tagline}</div>}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: 1, marginBottom: 4 }}>INVOICE</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', fontWeight: 700 }}>{payment.invoiceNumber}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Issued: {fmtDate(payment.createdAt)}</div>
              {invoiceCurrency !== 'USD' && (
                <div style={{ fontSize: 9, color: ACCENT, marginTop: 3, fontWeight: 600 }}>
                  {invoiceCurrency} · 1 USD = {rate.toLocaleString('en-US', { maximumFractionDigits: isIDR ? 0 : 4 })} {invoiceCurrency}
                </div>
              )}
            </div>
            {payment.status === 'confirmed' && (
              <div style={{
                transform: 'rotate(-15deg)',
                border: '3px solid #16a34a',
                borderRadius: 6,
                color: '#16a34a',
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: 5,
                padding: '4px 14px',
                opacity: 0.85,
                userSelect: 'none',
                textTransform: 'uppercase',
                lineHeight: 1,
                boxShadow: 'inset 0 0 0 2px #16a34a18',
                flexShrink: 0,
              }}>
                PAID
              </div>
            )}
          </div>
        </div>

        {/* ── Bill To + Booking Details ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '14px 22px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ paddingRight: 20, borderRight: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Bill To</div>

            {billToAgent ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{b.agent!.name}</div>
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 8, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>{guestsWithCabin.length > 1 ? 'Guests' : 'Guest'}</div>
                  {guestsWithCabin.length > 0 ? (
                    guestsWithCabin.map((g, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#6b7280' }}>
                        {(g.customer?.name ?? '').toLowerCase().includes('tbd') ? `Guest ${i + 1} (TBD)` : (g.customer?.name ?? '—')}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{[salutation(b.customer.gender), b.customer.name].filter(Boolean).join(' ')}</div>
                  )}
                  {b.customer.phone && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{b.customer.phone}</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{[salutation(b.customer.gender), b.customer.name].filter(Boolean).join(' ')}</div>
                {b.customer.email   && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{b.customer.email}</div>}
                {b.customer.phone   && <div style={{ color: '#6b7280', fontSize: 11 }}>{b.customer.phone}</div>}
                {b.customer.address && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{b.customer.address}</div>}
              </>
            )}
          </div>
          <div style={{ paddingLeft: 20 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Booking Details</div>
            {([
              ['Booking No.',   b.bookingCode],
              ['Package',       packageLabel],
              ['Destination',   destination],
              ['Sailing Dates', `${fmtDateShort(b.startDate)} – ${fmtDateShort(b.endDate)}`],
              ...(b.depositDueDate ? [['Deposit Due', fmtDateShort(b.depositDueDate)]] : []),
              ...(b.finalDueDate   ? [['Balance Due', fmtDateShort(b.finalDueDate)]]   : []),
              ...(b.salesperson    ? [['Sales',        b.salesperson]]                  : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                <span style={{ color: '#9ca3af', fontSize: 10, width: 76, flexShrink: 0 }}>{k}</span>
                <span style={{ color: '#111827', fontSize: 10, fontWeight: k === 'Booking No.' ? 700 : 500, fontFamily: k === 'Booking No.' ? 'monospace' : undefined }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Line Items ── */}
        <div style={{ padding: '0 22px', flexShrink: 0 }}>
          {/* Table header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f9fafb', padding: '6px 10px', borderRadius: '5px 5px 0 0', borderBottom: `2px solid ${ACCENT}`, marginTop: 14 }}>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Description</span>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Amount</span>
          </div>

          {/* Main item */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 10px', borderBottom: showCommissionNote ? 'none' : '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: 11 }}>
                {b.tripType === 'OPEN_TRIP' ? 'Open Trip — Cabin Booking' : 'Private Charter'}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{tripName} · {destination}</div>
            </div>
            <div style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', marginLeft: 16, fontSize: 11 }}>
              {fmtAmt(showCommissionNote ? baseAfterDisc : displayBase)}
            </div>
          </div>

          {/* Commission breakdown — only when explicitly disclosed on the invoice */}
          {showCommissionNote && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px 9px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>Less: Agent Commission ({commissionPct}%)</span>
              <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: 16 }}>
                −{fmtAmt(commissionAmt)}
              </span>
            </div>
          )}

          {/* Cabin / Passenger breakdown */}
          {hasCabins && (
            <div style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ padding: '5px 10px 3px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' }}>Passengers &amp; Cabins</span>
              </div>
              {guestsWithCabin.map((g, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 10px 3px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#374151', fontSize: 10 }}>{(g.customer?.name ?? '').toLowerCase().includes('tbd') ? '' : (g.customer?.name ?? '—')}</span>
                  </div>
                  <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{g.cabin?.name}</span>
                </div>
              ))}
              <div style={{ height: 5 }} />
            </div>
          )}

          {/* Discount — only shown for non-agent bookings (agent bookings absorb it into base) */}
          {!isAgentBooking && b.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#059669', fontSize: 10 }}>Discount</span>
              <span style={{ color: '#059669', fontSize: 10 }}>−{fmtAmt(discountAmt)}</span>
            </div>
          )}

          {/* Additional services */}
          {b.services.length > 0 && (
            <div style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ padding: '5px 10px 3px' }}>
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' }}>Additional Services</span>
              </div>
              {b.services.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 10px 3px 18px' }}>
                  <span style={{ color: '#374151', fontSize: 10 }}>
                    {s.name}{(s.quantity ?? 1) > 1 ? ` ×${s.quantity}` : ''}
                  </span>
                  <span style={{ color: '#374151', fontSize: 10, fontWeight: 500 }}>{fmtAmt(s.price * (s.quantity ?? 1))}</span>
                </div>
              ))}
              <div style={{ height: 5 }} />
            </div>
          )}

          {/* Payment summary */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '0 0 5px 5px', padding: '10px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #e5e7eb', marginBottom: 6 }}>
              <span style={{ color: '#6b7280', fontSize: 10 }}>Package Total</span>
              <span style={{ color: '#111827', fontSize: 10, fontWeight: 600 }}>{fmtAmt(afterDiscount)}</span>
            </div>

            {payment.previouslyPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ color: '#6b7280', fontSize: 10 }}>Previously Paid</span>
                <span style={{ color: '#059669', fontSize: 10, fontWeight: 600 }}>−{fmtAmt(payment.previouslyPaid)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', border: `1.5px solid ${ACCENT}`, borderRadius: 5, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: ACCENT, textTransform: 'uppercase' }}>
                Amount Due — This Invoice
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{fmtAmt(payment.amount)}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: remaining > 0 ? '#d97706' : '#059669', fontSize: 10, fontWeight: 600 }}>
                {remaining > 0 ? 'Balance Due' : 'Remaining'}
              </span>
              <span style={{ color: remaining > 0 ? '#d97706' : '#059669', fontSize: 10, fontWeight: 700 }}>
                {fmtAmt(remaining)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        {payment.paymentMethod && (
          <div style={{ margin: '0 22px 12px', padding: '8px 12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#166534', textTransform: 'uppercase', marginBottom: 3 }}>Payment Method</div>
            <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>{payment.paymentMethod}</div>
            {payment.paymentMethod === 'Credit Card' && (
              <div style={{ marginTop: 6, padding: '5px 10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, fontSize: 9, color: '#1d4ed8' }}>
                Payment via Credit Card + 3% Additional Charge
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {payment.notes && (
          <div style={{ margin: '0 22px 12px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#92400e', textTransform: 'uppercase', marginBottom: 3 }}>Notes</div>
            <div style={{ fontSize: 10, color: '#78350f' }}>{payment.notes}</div>
          </div>
        )}

        {/* ── Payment Link ── */}
        {payment.paymentLink && (
          <div style={{ margin: '0 22px 12px', padding: '10px 14px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#1d4ed8', textTransform: 'uppercase', marginBottom: 5 }}>Pay Online</div>
            <div style={{ fontSize: 10, color: '#1e40af', marginBottom: 4 }}>Click the link below to complete your payment securely:</div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#1d4ed8', fontWeight: 600, wordBreak: 'break-all' as const }}>{payment.paymentLink}</div>
          </div>
        )}

        {/* ── Bank Details ── */}
        {!payment.paymentLink && payment.bank && (
          <div style={{ margin: '0 22px 12px', border: '1px solid #e5e7eb', borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ backgroundColor: '#f9fafb', padding: '5px 12px', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>Bank Details</span>
            </div>
            <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: '130px 1fr', rowGap: 3, columnGap: 8, fontSize: 10 }}>
              {([
                ['Bank Name',        payment.bank.name],
                ['Bank Address',     payment.bank.bankAddress],
                ['Swift Code',       payment.bank.swiftCode],
                ['Beneficiary Name', payment.bank.beneficiaryName],
                ['IDR Account',      payment.bank.idrAccount],
                ['USD Account',      payment.bank.usdAccount],
                ['Address',          payment.bank.address],
              ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                <React.Fragment key={k}>
                  <span style={{ color: '#6b7280' }}>{k}</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>: {v}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ── Spacer (screen only — pushes footer to bottom on screen) ── */}
        <div className="so" style={{ flex: 1 }} />

        {/* ── Footer (screen only — print uses fixed footer) ── */}
        <div className="so" style={{ flexShrink: 0 }}>
          <div style={{ margin: '0 22px', paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>Thank you for sailing with {co.name}.</div>
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{co.website}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#d1d5db' }}>Generated {fmtDate(new Date().toISOString())}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#d1d5db', marginTop: 1 }}>{payment.invoiceNumber}</div>
            </div>
          </div>
          <div style={{ backgroundColor: ACCENT, height: 5 }} />
        </div>

        </div>{/* ── end page 1 wrapper ── */}

              </div>
            </td>
          </tr>
        </tbody>

      </table>

      {/* ══ T&C PAGES ══ */}
      {co.showTnc && (() => {
        const TncHdr = () => (
          <div className="pg-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={co.logoUrl}
              alt={co.name}
              style={{ height: 22, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            />
          </div>
        )
        const TncFtr = ({ n }: { n: number }) => (
          <div className="pg-footer">
            <div className="ft-addr">
              <strong>Office Address</strong>
              {co.address}<br/><br/>
              Phone/WhatsApp<br/>
              {co.phone}
            </div>
            <div className="ft-num">{n}</div>
            <div className="ft-contact">
              {co.website}<br/>
              {co.email}
            </div>
          </div>
        )
        return (
        <div className="tnc-wrap">

        {/* ══ COVER PAGE ══ */}
        <div className="tnc-pg" style={{ background: '#1a3050', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '80px 0 60px' }}>
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={co.logoUrl}
                alt={co.name}
                style={{ height: 56, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: 7, color: 'white', textTransform: 'uppercase', marginBottom: 14 }}>TERMS &amp; CONDITIONS</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>{co.website}</div>
            </div>
          </div>
        </div>


        {/* ══ T&C PAGE 1 — Preamble · §1–4 ══ */}
        <div className="tnc-pg">
          <TncHdr />
          <div className="pg-body">
            <div className="body-p" style={{marginBottom:4}}>
              <div style={{fontWeight:700,marginBottom:6,textAlign:'center',letterSpacing:1,textTransform:'uppercase'}}>Preamble</div>
              These Terms and Conditions (&quot;T&amp;C&quot;) govern all bookings and services provided to or by <strong>{co.name}</strong> and all its subsidiaries or partners (the &quot;Principal&quot;) for yacht charters. These terms are binding for all clients who engage in these services, either directly or through an authorized Travel Agency (&quot;Agency&quot;). By confirming a booking and/or making payment, the Guest acknowledges and agrees to these T&amp;C.
            </div>

            <div className="sec-h">1. Roles and Responsibilities</div>
            <ul className="clauses">
              <li><span className="cn">1.1.</span><span className="ct"><strong>Principal and Operator:</strong> <strong>{co.name}</strong> acts as the commercial principal and/or chartering entity. The operational management of the vessel is carried out by the Operator.</span></li>
              <li><span className="cn">1.2.</span><span className="ct"><strong>Travel Agent:</strong> Where a booking is made through a Travel Agent, the Agency acts solely as an intermediary between the Guest and the Principal. The Travel Agent does not own, operate, manage, or control the vessel, crew, or maritime operations and shall not be considered a contractual carrier or service provider.</span></li>
            </ul>

            <div className="sec-h">2. Hierarchy of Documents</div>
            <p className="body-p">In the event of any inconsistency between:</p>
            <ul className="clauses">
              <li><span className="cn">a)</span><span className="ct">the signed Charter Contract,</span></li>
              <li><span className="cn">b)</span><span className="ct">these Terms &amp; Conditions, and</span></li>
              <li><span className="cn">c)</span><span className="ct">any marketing material, brochure, website content, or Agency communication,</span></li>
            </ul>
            <p className="body-p">the provisions of the signed Charter Contract shall prevail, followed by these Terms &amp; Conditions.</p>

            <div className="sec-h">3. Cruise Type</div>
            <p className="body-p">The Principal offers two charter models:</p>
            <ul className="clauses">
              <li><span className="cn">3.1.</span><span className="ct"><strong>Private Charter:</strong> The entire vessel is chartered exclusively by one group. Guests enjoy full use of all cabins, crew, and a custom itinerary. Activities include island hopping, snorkeling, and leisure cruising.</span></li>
              <li><span className="cn">3.2.</span><span className="ct"><strong>Open Trip (FIT):</strong> Guests book individual cabins for 2 guests (extra beds available) and share the vessel and program with other travelers on a fixed schedule. Open Trips will operate as scheduled once a minimum booking of three (3) cabins is reached. If the minimum booking is not reached, the booking may be moved to the next available schedule, and guests will be informed in advance.</span></li>
            </ul>

            <div className="sec-h">4. Check-In and Check-Out Times</div>
            <ul className="clauses">
              <li><span className="cn">4.1.</span><span className="ct"><strong>Check-In:</strong> Boarding begins at 10:00 AM on the first day of the trip. Guests are strongly encouraged to arrive at the destination one day in advance to avoid delays.</span></li>
              <li><span className="cn">4.2.</span><span className="ct"><strong>Check-Out:</strong> Disembarkation is scheduled around 2:00 PM on the final day of the cruise.</span></li>
              <li><span className="cn">4.3.</span><span className="ct">For Private Charters, check-in and check-out times may vary depending on the customized itinerary and flight schedules, as agreed upon in advance with the Principal.</span></li>
            </ul>
          </div>
          <TncFtr n={1} />
        </div>

        {/* ══ T&C PAGE 2 — §5–7 ══ */}
        <div className="tnc-pg">
          <TncHdr />
          <div className="pg-body">
            <div className="sec-h">5. Bookings and Payments</div>
            <p className="body-p" style={{fontWeight:600}}>Charters and FIT below USD 5,000.- per night:</p>
            <ul className="clauses">
              <li><span className="cn">5.1.</span><span className="ct"><strong>Deposit:</strong> A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation.</span></li>
              <li><span className="cn">5.2.</span><span className="ct"><strong>Balance Payment:</strong> The remaining 70% must be paid at least 30 days before the departure date.</span></li>
              <li><span className="cn">5.3.</span><span className="ct"><strong>Short-Notice Bookings:</strong> For bookings made within 30 days of departure, full payment is required at the time of booking.</span></li>
            </ul>
            <p className="body-p" style={{fontWeight:600, marginTop:6}}>Charters and FIT above USD 5,000.- per night:</p>
            <ul className="clauses">
              <li><span className="cn">5.4.</span><span className="ct"><strong>Deposit:</strong> A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation.</span></li>
              <li><span className="cn">5.5.</span><span className="ct"><strong>Balance Payment:</strong> The remaining 70% must be paid at least 90 days before the departure date.</span></li>
              <li><span className="cn">5.6.</span><span className="ct"><strong>Short-Notice Bookings:</strong> For bookings made within 90 days of departure, full payment is required at the time of booking.</span></li>
            </ul>
            <p className="body-p" style={{fontWeight:600, marginTop:6}}>General Payment Rules:</p>
            <ul className="clauses">
              <li><span className="cn">5.7.</span><span className="ct"><strong>Failure to Pay:</strong> If payment deadlines are not met, the booking may be canceled without refund of previous payments.</span></li>
              <li><span className="cn">5.8.</span><span className="ct"><strong>Payment Methods:</strong> Payment may be made by bank transfer or credit card. Credit card payments incur a 3% processing fee. All bank charges are the responsibility of the guest or agent.</span></li>
              <li><span className="cn">5.9.</span><span className="ct"><strong>Payment Instructions:</strong> All payments must be made to the official bank account in the currency specified in the invoice issued by the Principal.</span></li>
            </ul>

            <div className="sec-h">6. Cancellations and Refunds</div>
            <div style={{display:'flex', gap:14, marginBottom:6}}>
              <div style={{flex:1}}>
                <p className="body-p" style={{fontWeight:600}}>FIT</p>
                <ul className="clauses">
                  <li><span className="cn">6.1.</span><span className="ct"><strong>More than 30 days before departure:</strong> Payments are refundable minus the 30% deposit.</span></li>
                  <li><span className="cn">6.2.</span><span className="ct"><strong>30 days or less before departure:</strong> No refund.</span></li>
                </ul>
              </div>
              <div style={{flex:1}}>
                <p className="body-p" style={{fontWeight:600}}>Charters</p>
                <ul className="clauses">
                  <li><span className="cn">6.3.</span><span className="ct"><strong>More than 90 days before departure:</strong> Payments are refundable minus the 30% deposit.</span></li>
                  <li><span className="cn">6.4.</span><span className="ct"><strong>90 days or less before departure:</strong> No refund.</span></li>
                </ul>
              </div>
            </div>

            <div className="sec-h">7. General Policies</div>
            <ul className="clauses">
              <li><span className="cn">7.1.</span><span className="ct"><strong>General Refund Policy:</strong> Payments are generally non-refundable. However, the Principal may, acting reasonably and in good faith, assist with rescheduling or offering alternative solutions where possible. No obligation or precedent is created.</span></li>
              <li><span className="cn">7.2.</span><span className="ct"><strong>Force Majeure:</strong> In cases of force majeure, including but not limited to natural disasters, or similar uncontrollable events, adverse sea conditions, port closures, government restrictions, or safety-related decisions, the Principal may offer rescheduling or alternative arrangements at its discretion.</span></li>
              <li><span className="cn">7.3.</span><span className="ct">Weather conditions at sea are unpredictable. Rain, swell, or cloudiness may occur and are not grounds for refund or cancellation.</span></li>
            </ul>
          </div>
          <TncFtr n={2} />
        </div>

        {/* ══ T&C PAGE 3 — §8–11 ══ */}
        <div className="tnc-pg">
          <TncHdr />
          <div className="pg-body">
            <div className="sec-h">8. Rescheduling</div>
            <ul className="clauses">
              <li><span className="cn">8.1.</span><span className="ct"><strong>Discretionary Rescheduling:</strong> While our policies are firm to ensure fairness and operational consistency, the Principal may, at its sole discretion, choose to offer alternative solutions in extraordinary cases. Any exception granted is made without obligation and does not set a precedent.</span></li>
            </ul>

            <div className="sec-h">9. Illness Before or During the Trip</div>
            <ul className="clauses">
              <li><span className="cn">9.1.</span><span className="ct"><strong>Prior to Trip:</strong> The cancellation policy remains in effect. No refunds are granted unless covered by travel insurance.</span></li>
              <li><span className="cn">9.2.</span><span className="ct"><strong>During Trip:</strong> If a guest falls ill and cannot participate in activities, no refund will be granted. A formal letter may be issued to support a travel insurance claim.</span></li>
            </ul>

            <div className="sec-h">10. General Inclusions and Exclusions</div>
            <div style={{display:'flex', gap:14, marginBottom:6}}>
              <div style={{flex:1}}>
                <p className="body-p" style={{fontWeight:600}}>10.1. Included in the Cruise:</p>
                <ul className="sub-list">
                  <li>Transfers to/from local airport or local hotel</li>
                  <li>Accommodation onboard the Vessel</li>
                  <li>All meals, snacks, coffee/tea, and mineral water and local beers</li>
                  <li>Scuba Diving for certified divers and the use of water sports equipment (where available)</li>
                  <li>Guided excursions and scheduled activities</li>
                </ul>
              </div>
              <div style={{flex:1}}>
                <p className="body-p" style={{fontWeight:600}}>10.2. Not Included:</p>
                <ul className="sub-list">
                  <li>Alcoholic beverages</li>
                  <li>Domestic flights and hotel accommodations before or after the trip</li>
                  <li>Travel insurance</li>
                  <li>Crew gratuities (suggested at 10% of the trip value)</li>
                  <li>Optional activities not listed in the itinerary</li>
                </ul>
              </div>
            </div>
            <ul className="clauses">
              <li><span className="cn">10.3.</span><span className="ct">Specific inclusions vary depending on the vessel and/or trip type. Details might be defined in the Charter Contract in writing.</span></li>
            </ul>

            <div className="sec-h">11. Guest Responsibilities</div>
            <ul className="clauses">
              <li><span className="cn">11.1.</span><span className="ct">Guests must follow all safety instructions provided by the crew.</span></li>
              <li><span className="cn">11.2.</span><span className="ct">Respectful and cooperative behavior toward staff and fellow guests is expected at all times.</span></li>
              <li><span className="cn">11.3.</span><span className="ct">Guests are <strong>financially responsible</strong> for any damage to the vessel or its equipment caused by negligence or misconduct.</span></li>
              <li><span className="cn">11.4.</span><span className="ct">Failure to comply with safety or ecological rules may result in exclusion from activities without refund.</span></li>
            </ul>
          </div>
          <TncFtr n={3} />
        </div>

        {/* ══ T&C PAGE 4 — §12–14 ══ */}
        <div className="tnc-pg">
          <TncHdr />
          <div className="pg-body">
            <div className="sec-h">12. Onboard Payments</div>
            <ul className="clauses">
              <li><span className="cn">12.1.</span><span className="ct">Onboard purchases, such as alcoholic drinks or merchandise, can be paid in cash or by credit card (3% surcharge).</span></li>
            </ul>

            <div className="sec-h">13. Diving Activities (if offered)</div>
            <ul className="clauses">
              <li><span className="cn">13.1.</span><span className="ct">Guests must hold a valid dive certification (e.g., PADI Open Water).</span></li>
              <li><span className="cn">13.2.</span><span className="ct"><strong>Dive insurance is mandatory</strong> and must be presented before the first dive.</span></li>
              <li><span className="cn">13.3.</span><span className="ct">A signed liability waiver is required before participating.</span></li>
              <li><span className="cn">13.4.</span><span className="ct">Missed dives for personal or medical reasons are non-refundable.</span></li>
            </ul>

            <div className="sec-h">14. Liability and Indemnity</div>
            <ul className="clauses">
              <li><span className="cn">14.1.</span><span className="ct"><strong>Assumption of Risk:</strong> Guests participate in all onboard and offboard activities at their own risk. While the Principal takes reasonable precautions to ensure guest safety, the nature of sea travel and adventure activities involves inherent risks.</span></li>
              <li><span className="cn">14.2.</span><span className="ct"><strong>Limitation of Liability:</strong> To the maximum extent permitted by applicable law, neither the Principal, its subsidiaries, partners, Agents, employees, nor crew shall be liable for any injury, illness, death, loss, damage, delay, or expense arising from, including but not limited to, the following:
                <ul className="sub-list" style={{marginTop:4}}>
                  <li>Slips, trips, or falls onboard (including staircases, decks, or wet areas)</li>
                  <li>Participation in snorkeling, diving, swimming, trekking, or other activities</li>
                  <li>Shore excursions organised by the principal or any third-party service providers</li>
                  <li>Guest negligence, disregard of safety instructions, or inappropriate behavior</li>
                  <li>Loss, theft, or damage to personal belongings</li>
                  <li>Delays, missed flights, or travel disruptions</li>
                  <li>Incomplete or inaccurate travel documentation or insurance coverage</li>
                </ul>
              </span></li>
              <li><span className="cn">14.3.</span><span className="ct"><strong>Gross Negligence:</strong> The Principal shall only be liable where gross negligence or intentional misconduct can be clearly demonstrated. General sea conditions, weather-related movement, or vessel motion do not constitute grounds for liability.</span></li>
              <li><span className="cn">14.4.</span><span className="ct"><strong>Travel Insurance:</strong> Guests are strongly advised to obtain comprehensive travel and medical insurance, including coverage for accidents, evacuation, missed connections, and activity-related injuries.</span></li>
              <li><span className="cn">14.5.</span><span className="ct"><strong>Indemnification:</strong> By participating in the cruise, all Guests agree to fully indemnify, defend, and hold harmless the Principal, its subsidiaries, partners, Agents, employees, and crew from any claims, damages, losses, liabilities, or expenses arising from the Guest&apos;s actions or omissions during the trip.</span></li>
              <li><span className="cn">14.6.</span><span className="ct"><strong>Weather and Itinerary Changes:</strong> The Principal shall comply with all directives issued by port authorities or the Indonesian Coast Guard. The Captain may adjust the route, activities, or schedule at their discretion to ensure safety and optimize guest experience.</span></li>
            </ul>
          </div>
          <TncFtr n={4} />
        </div>

        {/* ══ T&C PAGE 5 — §15–19 ══ */}
        <div className="tnc-pg">
          <TncHdr />
          <div className="pg-body">
            <div className="sec-h">15. Changes and Price Adjustments</div>
            <ul className="clauses">
              <li><span className="cn">15.1.</span><span className="ct">The Principal reserves the right to update brochures, service descriptions, and pricing at any time before a booking is confirmed.</span></li>
              <li><span className="cn">15.2.</span><span className="ct">In very rare cases, price adjustments after booking may occur due to: significant increases in fuel or operational costs; new government fees, taxes, or port charges; or major exchange rate fluctuations. Guests will be informed of such changes and may choose to accept or cancel under applicable terms.</span></li>
            </ul>

            <div className="sec-h">16. Cancellation by the Principal for Guest Misconduct</div>
            <ul className="clauses">
              <li><span className="cn">16.1.</span><span className="ct">The Principal reserves the right to cancel a guest&apos;s participation <strong>without refund</strong> if the guest:</span></li>
            </ul>
            <ul className="sub-list" style={{marginTop:2}}>
              <li>Provides false personal information</li>
              <li>Fails to follow crew instructions or safety procedures</li>
              <li>Damages the vessel</li>
              <li>Endangers themselves, other guests, or marine life</li>
            </ul>

            <div className="sec-h">17. Governing Law</div>
            <ul className="clauses">
              <li><span className="cn">17.1.</span><span className="ct">These Terms &amp; Conditions are governed by the laws of the <strong>Republic of Indonesia</strong>. Any disputes shall be resolved through <strong>mediation or arbitration in Bali</strong>.</span></li>
            </ul>

            <div className="sec-h">18. Acknowledgment and Acceptance</div>
            <p className="body-p" style={{paddingLeft:14}}>
              By confirming a booking, the guest acknowledges that they have <strong>read, understood, and agreed</strong> to these Terms and Conditions.
            </p>

            <div className="sec-h">19. Contact</div>
            <p className="body-p" style={{paddingLeft:14}}>
              For assistance or inquiries, please contact:<br/>
              <strong>{co.name}</strong><br/>
              {co.email}&nbsp;&nbsp;·&nbsp;&nbsp;{co.website}
            </p>
          </div>
          <TncFtr n={5} />
        </div>

        </div>
        )
      })()}

    </>
  )
}
