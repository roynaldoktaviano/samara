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
    customer: { name: string; email?: string; phone?: string; address?: string }
    yacht?: { name: string; model?: string }
    openTrip?: { title: string; destination?: string }
    agent?: { name: string; company?: string }
    services: Array<{ name: string; price: number }>
  }
}

/* ── helpers ── */
const RATES: Record<string, number> = { USD: 1, EUR: 1.09, IDR: 0.000063 }
const toCurrency = (usdAmt: number, currency: string) => usdAmt / (RATES[currency] ?? 1)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtAmt = (n: number, currency: string) => {
  if (currency === 'IDR') return `Rp ${Math.round(n).toLocaleString('id-ID')}`
  if (currency === 'EUR') return `€ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const ACCENT = '#bdac7e'

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [payment, setPayment] = useState<PaymentDetail | null>(null)
  const [loading, setLoading]   = useState(true)
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
    <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">
      Loading invoice…
    </div>
  )
  if (!payment) return (
    <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">
      Invoice not found.
    </div>
  )

  const b = payment.booking
  const tripName = b.tripType === 'OPEN_TRIP' ? (b.openTrip?.title ?? '—') : (b.yacht?.name ?? '—')
  const destination = b.destination ?? b.openTrip?.destination ?? '—'

  /* All amounts in payment.currency for consistent display */
  const totalInCurrency    = toCurrency(b.totalPrice, payment.currency)
  const prevPaidInCurrency = toCurrency(payment.previouslyPaid, payment.currency)
  const discountAmt        = totalInCurrency * b.discount / 100
  const netTotal           = totalInCurrency - discountAmt
  const remaining          = Math.max(0, netTotal - prevPaidInCurrency - payment.amount)

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[680px] mx-auto font-sans text-gray-800" style={{ fontSize: 13 }}>

        {/* ── Top accent bar ── */}
        <div style={{ backgroundColor: ACCENT, height: 6 }} />

        {/* ── Header ── */}
        <div className="flex items-stretch" style={{ minHeight: 100 }}>
          {/* Brand column */}
          <div className="flex flex-col justify-center px-8 py-6" style={{ borderRight: `1px solid #e5e7eb`, minWidth: 220 }}>
            <div style={{ color: ACCENT, fontSize: 26, fontWeight: 800, letterSpacing: 3 }}>SAMARA</div>
            <div style={{ color: '#9ca3af', fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>PREMIUM YACHT EXPERIENCES</div>
          </div>
          {/* Invoice meta */}
          <div className="flex-1 flex flex-col justify-center px-8 py-6">
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: 1, marginBottom: 4 }}>INVOICE</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#374151', fontWeight: 600 }}>{payment.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Diterbitkan: {fmtDate(payment.createdAt)}</div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, backgroundColor: '#e5e7eb', margin: '0 32px' }} />

        {/* ── Bill To + Booking Details ── */}
        <div className="grid grid-cols-2 gap-0" style={{ padding: '24px 32px' }}>
          <div style={{ paddingRight: 24, borderRight: `1px solid #f3f4f6` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 8 }}>Bill To</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{b.customer.name}</div>
            {b.customer.email   && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{b.customer.email}</div>}
            {b.customer.phone   && <div style={{ color: '#6b7280', fontSize: 12 }}>{b.customer.phone}</div>}
            {b.customer.address && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{b.customer.address}</div>}
            {b.agent && (
              <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 6 }}>
                via {b.agent.name}{b.agent.company ? ` · ${b.agent.company}` : ''}
              </div>
            )}
          </div>
          <div style={{ paddingLeft: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 8 }}>Booking Details</div>
            {[
              ['Booking No.', b.bookingCode],
              ['Trip', tripName],
              ['Destination', destination],
              ['Date', `${fmtDateShort(b.startDate)} – ${fmtDateShort(b.endDate)}`],
              ['Guests', `${b.guestCount} pax`],
              ...(b.salesperson ? [['Sales', b.salesperson]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2" style={{ marginBottom: 3 }}>
                <span style={{ color: '#9ca3af', fontSize: 12, width: 80, flexShrink: 0 }}>{k}</span>
                <span style={{ color: '#111827', fontSize: 12, fontWeight: k === 'Booking No.' ? 700 : 500, fontFamily: k === 'Booking No.' ? 'monospace' : undefined }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Line Items ── */}
        <div style={{ margin: '0 32px' }}>
          {/* Table header */}
          <div className="flex justify-between" style={{ backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: '6px 6px 0 0', borderBottom: `2px solid ${ACCENT}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Description</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Amount</span>
          </div>

          {/* Main item */}
          <div className="flex justify-between items-start" style={{ padding: '12px', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#111827' }}>
                {b.tripType === 'OPEN_TRIP' ? 'Open Trip — Cabin Booking' : 'Private Charter'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{tripName} · {destination}</div>
            </div>
            <div style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', marginLeft: 16 }}>
              {fmtAmt(totalInCurrency, payment.currency)}
            </div>
          </div>

          {/* Discount */}
          {b.discount > 0 && (
            <div className="flex justify-between items-center" style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#059669', fontSize: 12 }}>Discount ({b.discount}%)</span>
              <span style={{ color: '#059669', fontSize: 12 }}>−{fmtAmt(discountAmt, payment.currency)}</span>
            </div>
          )}

          {/* Additional services */}
          {b.services.map((s, i) => (
            <div key={i} className="flex justify-between items-center" style={{ padding: '8px 12px 8px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#6b7280', fontSize: 12 }}>{s.name}</span>
              <span style={{ color: '#374151', fontSize: 12 }}>{fmtAmt(toCurrency(s.price, payment.currency), payment.currency)}</span>
            </div>
          ))}

          {/* ── Payment Summary ── */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '0 0 6px 6px', padding: '12px' }}>
            {/* Net total */}
            <div className="flex justify-between" style={{ paddingBottom: 8, borderBottom: '1px solid #e5e7eb', marginBottom: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 12 }}>Total Paket</span>
              <span style={{ color: '#111827', fontSize: 12, fontWeight: 600 }}>{fmtAmt(netTotal, payment.currency)}</span>
            </div>

            {/* Previously paid (only if there was a prior payment) */}
            {prevPaidInCurrency > 0 && (
              <div className="flex justify-between" style={{ marginBottom: 6 }}>
                <span style={{ color: '#6b7280', fontSize: 12 }}>Pembayaran Sebelumnya</span>
                <span style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}>−{fmtAmt(prevPaidInCurrency, payment.currency)}</span>
              </div>
            )}

            {/* This invoice */}
            <div className="flex justify-between items-center" style={{ backgroundColor: 'white', border: `1.5px solid ${ACCENT}`, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: ACCENT, textTransform: 'uppercase' }}>
                Jumlah Tagihan Invoice Ini
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{fmtAmt(payment.amount, payment.currency)}</div>
            </div>

            {/* Remaining */}
            <div className="flex justify-between">
              <span style={{ color: remaining > 0 ? '#d97706' : '#059669', fontSize: 12, fontWeight: 600 }}>
                {remaining > 0 ? 'Sisa Tagihan' : 'Lunas ✓'}
              </span>
              <span style={{ color: remaining > 0 ? '#d97706' : '#059669', fontSize: 12, fontWeight: 700 }}>
                {fmtAmt(remaining, payment.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        {payment.notes && (
          <div style={{ margin: '20px 32px 0', padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#92400e', textTransform: 'uppercase', marginBottom: 4 }}>Catatan</div>
            <div style={{ fontSize: 12, color: '#78350f' }}>{payment.notes}</div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ margin: '24px 32px 0', paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Terima kasih telah berlayar bersama Samara.</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#d1d5db' }}>Generated {fmtDate(new Date().toISOString())}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#d1d5db', marginTop: 1 }}>{payment.invoiceNumber}</div>
          </div>
        </div>

        {/* ── Bottom accent bar ── */}
        <div style={{ backgroundColor: ACCENT, height: 4, marginTop: 24 }} />
      </div>

      <style>{`
        @media print {
          @page { margin: 1cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
        }
        @media screen {
          body { background: #f3f4f6; padding: 24px 0; }
        }
      `}</style>
    </div>
  )
}
