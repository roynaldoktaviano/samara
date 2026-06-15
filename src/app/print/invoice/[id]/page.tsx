'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

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
    customer: { name: string; email?: string; phone?: string; address?: string }
    yacht?: { name: string; model?: string }
    openTrip?: { title: string; destination?: string }
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
const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', IDR: 'Rp' }

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [payment,   setPayment]   = useState<PaymentDetail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [hasTncPdf, setHasTncPdf] = useState(false)
  const [tncPages,  setTncPages]  = useState<string[]>([])
  const printed = useRef(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/payments/${id}`).then(r => r.json()),
      fetch('/api/public/tnc-pages').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([paymentData, tncData]) => {
      setPayment(paymentData)
      if (tncData?.images?.length) {
        setHasTncPdf(true)
        setTncPages(tncData.images)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
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

  const b              = payment.booking
  const tripName       = b.tripType === 'OPEN_TRIP' ? (b.openTrip?.title ?? '—') : (b.yacht?.name ?? '—')
  const destination    = b.destination ?? b.openTrip?.destination ?? '—'
  const isAgentBooking = b.source === 'AGENT' && !!b.agent
  const billToAgent    = isAgentBooking && (payment.billToType !== 'CUSTOMER')

  const invoiceCurrency = b.currency || 'USD'
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
  const discountAmt    = b.discount  // stored as dollar amount
  const afterDiscount  = b.totalPrice - discountAmt
  const commissionPct  = isAgentBooking
    ? (b.tripType === 'OPEN_TRIP' ? (b.agent!.commissionOpenTrip ?? 0) : (b.agent!.commissionPrivateCharter ?? 0))
    : 0
  const commissionAmt  = afterDiscount * commissionPct / 100
  const netTotal       = afterDiscount - commissionAmt
  const remaining      = Math.max(0, netTotal - payment.previouslyPaid - payment.amount)

  // For agent bookings: show net base price (commission + discount already absorbed)
  const baseRaw        = b.totalPrice - servicesTotal
  const displayBase    = isAgentBooking
    ? baseRaw - discountAmt - commissionAmt
    : baseRaw

  const guestsWithCabin = b.guests.filter(g => g.cabin)
  const hasCabins = !isAgentBooking && guestsWithCabin.length > 0

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
                  src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png"
                  alt="Samara Liveaboard"
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
                    Samara Liveaboard
                  </div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.6 }}>samaraliveaboard.com</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.6 }}>Bali, Indonesia</div>
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
              src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png"
              alt="Samara Liveaboard"
              style={{ width: 120, objectFit: 'contain' }}
            />
            <div style={{ color: '#9ca3af', fontSize: 8, letterSpacing: 1.5, marginTop: 4 }}>PREMIUM YACHT EXPERIENCES</div>
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
                  <div style={{ fontSize: 8, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Guest</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{b.customer.name}</div>
                  {b.customer.phone && <div style={{ fontSize: 10, color: '#9ca3af' }}>{b.customer.phone}</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{b.customer.name}</div>
                {b.customer.email   && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{b.customer.email}</div>}
                {b.customer.phone   && <div style={{ color: '#6b7280', fontSize: 11 }}>{b.customer.phone}</div>}
                {b.customer.address && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{b.customer.address}</div>}
              </>
            )}
          </div>
          <div style={{ paddingLeft: 20 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Booking Details</div>
            {([
              ['Booking No.', b.bookingCode],
              ['Trip',        tripName],
              ['Destination', destination],
              ['Date',        `${fmtDateShort(b.startDate)} – ${fmtDateShort(b.endDate)}`],
              ['Guests',      `${b.guestCount} pax`],
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 10px', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: 11 }}>
                {b.tripType === 'OPEN_TRIP' ? 'Open Trip — Cabin Booking' : 'Private Charter'}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{tripName} · {destination}</div>
            </div>
            <div style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', marginLeft: 16, fontSize: 11 }}>
              {fmtAmt(displayBase)}
            </div>
          </div>

          {/* Cabin / Passenger breakdown */}
          {hasCabins && (
            <div style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ padding: '5px 10px 3px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' }}>Passengers &amp; Cabins</span>
              </div>
              {guestsWithCabin.map((g, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 10px 3px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#374151', fontSize: 10 }}>{g.customer?.name ?? '—'}</span>
                    {g.isLead && (
                      <span style={{ fontSize: 8, fontWeight: 600, color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 3, padding: '1px 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lead</span>
                    )}
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
              <span style={{ color: '#111827', fontSize: 10, fontWeight: 600 }}>{fmtAmt(netTotal)}</span>
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
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>Thank you for sailing with Samara.</div>
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>samaraliveaboard.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#d1d5db' }}>Generated {fmtDate(new Date().toISOString())}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#d1d5db', marginTop: 1 }}>{payment.invoiceNumber}</div>
            </div>
          </div>
          <div style={{ backgroundColor: ACCENT, height: 5 }} />
        </div>

        </div>{/* ── end page 1 wrapper ── */}

        {/* ══════════════════════════════════════════════════════════
            TNC — screen: download bar | print: embedded PDF pages
            ══════════════════════════════════════════════════════════ */}
        {hasTncPdf ? (
          /* Screen-only: info bar (TnC images are rendered outside <table> below) */
          <div className="so" style={{ maxWidth: 660, margin: '0 auto', padding: '12px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px' }}>
              <span style={{ fontSize: 18 }}>📎</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Terms &amp; Conditions included</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>T&amp;C pages will be appended when printing / saving as PDF</div>
              </div>
            </div>
          </div>
        ) : (
        <>

        {/* ══════════════════════════════════════════════════════════
            PAGE 2 — INCLUSIONS & EXCLUSIONS
            ══════════════════════════════════════════════════════════ */}
        <div className="pb" style={{ background: 'white', padding: '28px 36px 32px' }}>

          {/* ── INCLUSIONS & EXCLUSIONS NOTES header bar ── */}
          <div className="nc" style={{ backgroundColor: '#f3f4f6', padding: '9px 20px', textAlign: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#374151', textTransform: 'uppercase' }}>
              Inclusions &amp; Exclusions Notes
            </span>
          </div>

          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.8 }}>
              Alcoholic beverages, merchandise goods, and crew gratuities can be settled on board in USD / EUR / IDR.
            </div>
            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.8 }}>
              For daily exchange rates, please refer to www.xe.com.
            </div>
          </div>

          {/* ── INCLUDE header bar ── */}
          <div className="nc" style={{ backgroundColor: '#f3f4f6', padding: '9px 20px', textAlign: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#374151', textTransform: 'uppercase' }}>
              Samara&apos;s Services &amp; Fees Include
            </span>
          </div>

          <div style={{ marginBottom: 32 }}>
            {[
              'Transfers to / from the port or hotel at the respective embarkation point.',
              'Accommodation on board in private or shared cabin with air conditioning, hot water shower and toilet.',
              'All meals: breakfast, lunch, dinner, and snacks prepared fresh by our on-board chef.',
              'Non-alcoholic beverages throughout — water, juices, coffee, tea, and soft drinks.',
              'Standard snorkeling equipment for all guests: mask, fins, and snorkel.',
              'Guided snorkeling trips, island-hopping excursions, and onboard activities as per the program itinerary.',
              'Complementary beach BBQ dinner (subject to weather and itinerary).',
              'Professional English-speaking guide and experienced crew service.',
              'All government port taxes, harbour dues, and departure fees.',
              'Welcome drinks and safety briefing upon embarkation.',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ color: ACCENT, fontWeight: 700, fontSize: 14, lineHeight: 1.4, flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.65 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* ── EXCLUDE header bar ── */}
          <div className="nc" style={{ backgroundColor: '#f3f4f6', padding: '9px 20px', textAlign: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#374151', textTransform: 'uppercase' }}>
              Samara&apos;s Services &amp; Fees Exclude
            </span>
          </div>

          <div style={{ marginBottom: 32 }}>
            {[
              'National park and marine reserve entry fees (e.g., Komodo National Park).',
              'Spirits, alcoholic beverages, mocktails, and smoothies.',
              'Scuba diving activities, equipment rental, and lessons.',
              'Photo and video packages.',
              'Crew gratuities — entirely at guests\' discretion and greatly appreciated.',
              'Flights and any costs for overweight luggage (international and domestic).',
              'Travel insurance or any other personal insurance (strongly recommended).',
              'Purchase of merchandise, souvenirs, or personal items on board.',
              'Personal expenses: laundry, telecommunications, etc.',
              'Visa-on-arrival, immigration, or customs fees.',
              'Pre / post trip accommodation.',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#374151', fontWeight: 700, fontSize: 14, lineHeight: 1.4, flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.65 }}>{item}</span>
              </div>
            ))}
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════
            PAGE 3 — TERMS AND CONDITIONS
            ══════════════════════════════════════════════════════════ */}
        <div className="pb" style={{ background: 'white', padding: '28px 36px 32px' }}>

          <div className="nc" style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#111827', letterSpacing: 0.3, marginBottom: 8 }}>
              Samara Liveaboard Terms and Conditions
            </div>
            <div style={{ height: 3, width: 56, backgroundColor: ACCENT, borderRadius: 2 }} />
          </div>

          {([
            ['Cancellation Policy', `Should you need to cancel your booking, we ask you to notify us at your earliest convenience. All cancellations must be submitted in writing to reservations@samaraliveaboard.com.\n\nRefund or cancellation charges will depend on the date of cancellation, as specified below:\n\nA) Booking deposit: The initial deposit is non-refundable under any circumstances.\nB) 60 days or more before departure: 50% cancellation fee will be deducted from all payments made.\nC) No refund can be granted on cancellations made 59 days or less prior to departure.\n\nAny refunds outside of our terms will be subject to a claim on your travel insurance. Samara Liveaboard is not responsible for any charges arising from the transfer process in the event of a refund.`],
            ['Payments', `All bank transfer fees must be borne by the guest and accounted for in their transfer. Any shortfall greater than USD 100 must be settled prior to boarding Samara Liveaboard.\n\nAny shortfall of less than USD 100 can be settled on board by credit card or cash upon arrival.\n\nPayment deadlines missed by more than 4 weeks past the due date may result in the booked spaces being released. No refunds will be granted for any prior payments made.`],
            ['Personal Information', `Samara Liveaboard discloses guests' personal information only for the purpose of delivering liveaboard services and to comply with applicable privacy legislation.\n\nPrior to any trip, we require a completed guest information sheet including passport details and flight information. The deadline to submit these details is 4 weeks prior to trip departure. Failure to do so may result in extra charges or cancellation of your booking with no refund.`],
            ['Health and Safety', `Guests must disclose any medical conditions, allergies, dietary requirements, or physical limitations prior to boarding. Samara Liveaboard reserves the right to refuse boarding if a guest's condition poses a safety risk to themselves or others.\n\nGuests are responsible for their own health and safety during the charter and must adhere to all safety instructions provided by the crew at all times. Life jackets must be worn as directed.`],
            ['Illness', `If a guest is unable to participate in activities due to illness while on board, no refund will be given. If required, a supporting letter for travel insurance purposes can be provided by Samara Liveaboard. For illnesses prior to departure, please refer to the Cancellation Policy above.`],
            ['Weather', `For closed port situations or adverse weather, alternative products and / or destinations will be offered where possible. Rainy or cloudy weather alone is not a valid reason for cancellation, and we strictly follow harbour master recommendations. In the event of poor weather or sea conditions, the guest shall have no claim against Samara Liveaboard or its operators.`],
            ['Program Changes', `Samara Liveaboard and its operators reserve the right to rearrange the order of any itinerary, or to cancel or substitute elements of any schedule without notice when local conditions force such changes. In such cases, no refund will be provided for missed activities or sessions.`],
            ['Responsibility', `There is nothing more important to us than the safety of our guests, and all activities are carried out under strict supervision. It is your responsibility to ensure you have a suitable level of fitness to undertake the trip.\n\nSamara Liveaboard is not responsible for any losses, damage, death, medical expenses, injuries, or claims whatsoever arising from, connected with, or related to any activities engaged in by guests while on board or ashore. Guests engage in all activities at their own risk. Samara Liveaboard is not responsible for any interruptions caused by flight delays, loss of luggage, broken equipment, or any other travel arrangements made by external parties.`],
            ['Insurance', `All guests are strongly recommended to obtain comprehensive travel health insurance prior to departure to cover unforeseen circumstances including medical expenses, emergency evacuation, trip cancellation, and repatriation. Proof of insurance may be requested prior to embarkation.`],
            ['Onboard Rules', `Guests are expected to conduct themselves respectfully toward fellow guests, crew members, and the natural environment at all times. Any behaviour deemed disruptive or unsafe by the captain may result in removal from the vessel without refund.\n\nThe use or possession of illegal substances is strictly prohibited on board. Samara Liveaboard operates in environmentally sensitive marine areas — guests must not touch, collect, or damage any coral, marine life, or protected species.`],
            ['Force Majeure', `Samara Liveaboard is not liable for failure to perform its obligations if such failure is as a result of events beyond our reasonable control, including: acts of God (fire, flood, earthquake, storm, hurricane, volcanic eruption, or other natural disaster), war, invasion, act of foreign enemies, hostilities, civil war, rebellion, revolution, insurrection, terrorist activities, nationalization, government sanction, blockage, embargo, labour dispute, strike, or pandemic.`],
          ] as [string, string][]).map(([title, body]) => (
            <div className="nc" key={title} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid #f3f4f6' }}>
                {title}
              </div>
              {body.split('\n\n').map((para, pi) => (
                <div key={pi} style={{ marginBottom: pi < body.split('\n\n').length - 1 ? 9 : 0 }}>
                  {para.split('\n').map((line, li) => (
                    <div key={li} style={{ fontSize: 11, color: '#374151', lineHeight: 1.75 }}>{line}</div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {/* ── Closing message ── */}
          <div style={{ marginTop: 36, paddingTop: 22, borderTop: `1px solid #e5e7eb`, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.75, marginBottom: 4 }}>
              Thank you for choosing Samara Liveaboard.
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.75 }}>
              Our entire crew will be more than grateful to welcome you aboard.
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
              <div style={{ height: 2, width: 40, backgroundColor: ACCENT, borderRadius: 2 }} />
            </div>
          </div>

        </div>

        </> /* end hasTncPdf else */
        )}

              </div>
            </td>
          </tr>
        </tbody>

      </table>

      {/* TnC pages rendered as images — outside <table> so print header/footer don't repeat */}
      {hasTncPdf && tncPages.map((src, i) => (
        <div key={i} className="sp pb tnc-page">
          <img src={src} alt="" />
        </div>
      ))}
    </>
  )
}
