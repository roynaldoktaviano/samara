'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

interface PaymentDetail {
  id: string
  invoiceNumber: string
  paymentType: string
  previouslyPaid: number
  amount: number
  currency: string
  status: string
  notes?: string
  createdAt: string
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
    customer: { name: string; email?: string; phone?: string; address?: string }
    yacht?: { name: string; model?: string }
    openTrip?: { title: string; destination?: string }
    source?: string
    agent?: { name: string; company?: string; email?: string; phone?: string; commission?: number }
    services: Array<{ name: string; price: number }>
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
  const [payment, setPayment] = useState<PaymentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    fetch(`/api/payments/${id}`)
      .then(r => r.json())
      .then(d => { setPayment(d); setLoading(false) })
      .catch(() => setLoading(false))
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

  // Currency conversion — all DB amounts are in USD
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

  const servicesTotal  = b.services.reduce((s, x) => s + x.price, 0)
  const discountAmt    = b.totalPrice * b.discount / 100
  const afterDiscount  = b.totalPrice - discountAmt
  const commissionPct  = isAgentBooking ? (b.agent!.commission ?? 0) : 0
  const commissionAmt  = afterDiscount * commissionPct / 100
  const netTotal       = afterDiscount - commissionAmt
  const remaining      = Math.max(0, netTotal - payment.previouslyPaid - payment.amount)

  // Cabins with guest names — only shown for direct bookings
  const guestsWithCabin = b.guests.filter(g => g.cabin)
  const hasCabins = !isAgentBooking && guestsWithCabin.length > 0

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #f3f4f6; }
        @media print {
          @page { margin: 1cm; size: A4 portrait; }
          html, body { background: white; height: 100%; }
        }
        @media screen {
          body { padding: 32px 0 48px; }
        }
      `}</style>

      {/* Page shell — A4 height, flex column so footer sticks to bottom */}
      <div style={{
        maxWidth: 680,
        margin: '0 auto',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(297mm - 2cm)',
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 13,
        color: '#1f2937',
      }}>

        {/* ── Top accent bar ── */}
        <div style={{ backgroundColor: ACCENT, height: 6, flexShrink: 0 }} />

        {/* ── Header: logo + invoice meta ── */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 28px', borderRight: '1px solid #e5e7eb', minWidth: 220 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png"
              alt="Samara Liveaboard"
              style={{ width: 140, objectFit: 'contain' }}
            />
            <div style={{ color: '#9ca3af', fontSize: 9, letterSpacing: 1.5, marginTop: 6 }}>PREMIUM YACHT EXPERIENCES</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 28px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: 1, marginBottom: 6 }}>INVOICE</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#374151', fontWeight: 700 }}>{payment.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Issued: {fmtDate(payment.createdAt)}</div>
            {invoiceCurrency !== 'USD' && (
              <div style={{ fontSize: 10, color: ACCENT, marginTop: 4, fontWeight: 600 }}>
                {invoiceCurrency} · 1 USD = {rate.toLocaleString('en-US', { maximumFractionDigits: isIDR ? 0 : 4 })} {invoiceCurrency}
              </div>
            )}
          </div>
        </div>

        {/* ── Bill To + Booking Details ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '24px 28px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ paddingRight: 24, borderRight: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 10 }}>Bill To</div>

            {b.source === 'AGENT' && b.agent ? (
              /* ── Via Agent: bill to the agent ── */
              <>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{b.agent.name}</div>
                {b.agent.company && <div style={{ color: '#374151', fontSize: 12, marginTop: 2 }}>{b.agent.company}</div>}
                {b.agent.email   && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>{b.agent.email}</div>}
                {b.agent.phone   && <div style={{ color: '#6b7280', fontSize: 12 }}>{b.agent.phone}</div>}
                {/* Guest info as secondary line */}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 9, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Guest</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{b.customer.name}</div>
                  {b.customer.phone && <div style={{ fontSize: 11, color: '#9ca3af' }}>{b.customer.phone}</div>}
                </div>
              </>
            ) : (
              /* ── Direct: bill to the customer ── */
              <>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{b.customer.name}</div>
                {b.customer.email   && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>{b.customer.email}</div>}
                {b.customer.phone   && <div style={{ color: '#6b7280', fontSize: 12 }}>{b.customer.phone}</div>}
                {b.customer.address && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{b.customer.address}</div>}
              </>
            )}
          </div>
          <div style={{ paddingLeft: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 10 }}>Booking Details</div>
            {([
              ['Booking No.', b.bookingCode],
              ['Trip',        tripName],
              ['Destination', destination],
              ['Date',        `${fmtDateShort(b.startDate)} – ${fmtDateShort(b.endDate)}`],
              ['Guests',      `${b.guestCount} pax`],
              ...(b.salesperson ? [['Sales', b.salesperson]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ color: '#9ca3af', fontSize: 12, width: 80, flexShrink: 0 }}>{k}</span>
                <span style={{ color: '#111827', fontSize: 12, fontWeight: k === 'Booking No.' ? 700 : 500, fontFamily: k === 'Booking No.' ? 'monospace' : undefined }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Line Items ── */}
        <div style={{ padding: '0 28px', flexShrink: 0 }}>
          {/* Table header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: '6px 6px 0 0', borderBottom: `2px solid ${ACCENT}`, marginTop: 20 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Description</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Amount</span>
          </div>

          {/* Main item */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#111827' }}>
                {b.tripType === 'OPEN_TRIP' ? 'Open Trip — Cabin Booking' : 'Private Charter'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{tripName} · {destination}</div>
            </div>
            <div style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', marginLeft: 16 }}>
              {fmtAmt(b.totalPrice - servicesTotal)}
            </div>
          </div>

          {/* Cabin / Passenger breakdown */}
          {hasCabins && (
            <div style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' }}>Passengers &amp; Cabins</span>
              </div>
              {guestsWithCabin.map((g, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 4px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#374151', fontSize: 12 }}>{g.customer?.name ?? '—'}</span>
                    {g.isLead && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lead</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                    {g.cabin?.name}
                  </span>
                </div>
              ))}
              <div style={{ height: 8 }} />
            </div>
          )}

          {/* Discount */}
          {b.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#059669', fontSize: 12 }}>Discount ({b.discount}%)</span>
              <span style={{ color: '#059669', fontSize: 12 }}>−{fmtAmt(discountAmt)}</span>
            </div>
          )}

          {/* Agent commission deduction */}
          {isAgentBooking && commissionPct > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#6b7280', fontSize: 12, fontStyle: 'italic' }}>
                Agent Rate ({commissionPct}% Commission)
              </span>
              <span style={{ color: '#6b7280', fontSize: 12, fontStyle: 'italic' }}>
                ({fmtAmt(commissionAmt)})
              </span>
            </div>
          )}

          {/* Additional services */}
          {b.services.length > 0 && (
            <div style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' }}>Additional Services</span>
              </div>
              {b.services.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 4px 20px' }}>
                  <span style={{ color: '#374151', fontSize: 12 }}>{s.name}</span>
                  <span style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>{fmtAmt(s.price)}</span>
                </div>
              ))}
              <div style={{ height: 8 }} />
            </div>
          )}

          {/* Payment summary */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '0 0 6px 6px', padding: '12px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #e5e7eb', marginBottom: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 12 }}>Package Total</span>
              <span style={{ color: '#111827', fontSize: 12, fontWeight: 600 }}>{fmtAmt(netTotal)}</span>
            </div>

            {payment.previouslyPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#6b7280', fontSize: 12 }}>Previously Paid</span>
                <span style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}>−{fmtAmt(payment.previouslyPaid)}</span>
              </div>
            )}

            {/* This invoice highlight */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', border: `1.5px solid ${ACCENT}`, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: ACCENT, textTransform: 'uppercase' }}>
                Amount Due — This Invoice
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{fmtAmt(payment.amount)}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: remaining > 0 ? '#d97706' : '#059669', fontSize: 12, fontWeight: 600 }}>
                {remaining > 0 ? 'Balance Due' : 'Paid in Full ✓'}
              </span>
              <span style={{ color: remaining > 0 ? '#d97706' : '#059669', fontSize: 12, fontWeight: 700 }}>
                {fmtAmt(remaining)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {payment.notes && (
          <div style={{ margin: '0 28px 20px', padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#92400e', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 12, color: '#78350f' }}>{payment.notes}</div>
          </div>
        )}

        {/* ── Spacer pushes footer to bottom ── */}
        <div style={{ flex: 1 }} />

        {/* ── Footer ── */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ margin: '0 28px', paddingTop: 14, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Thank you for sailing with Samara.</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>samaraliveaboard.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#d1d5db' }}>Generated {fmtDate(new Date().toISOString())}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#d1d5db', marginTop: 1 }}>{payment.invoiceNumber}</div>
            </div>
          </div>
          <div style={{ backgroundColor: ACCENT, height: 6 }} />
        </div>

      </div>
    </>
  )
}
