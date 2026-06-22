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
    customer: { name: string; email?: string; phone?: string; address?: string; gender?: string | null }
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

async function renderPdfPages(url: string): Promise<string[]> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return []
    const buf = await resp.arrayBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = (await import('pdfjs-dist')) as any
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
    const images: string[] = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page     = await pdf.getPage(p)
      const viewport = page.getViewport({ scale: 2 })
      const canvas   = document.createElement('canvas')
      canvas.width   = viewport.width
      canvas.height  = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.92))
    }
    return images
  } catch { return [] }
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
  const [payment,   setPayment]   = useState<PaymentDetail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [hasTncPdf, setHasTncPdf] = useState(false)
  const [tncPages,  setTncPages]  = useState<string[]>([])
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [paymentData, tncImages] = await Promise.all([
        fetch(`/api/payments/${id}`).then(r => r.json()),
        renderPdfPages('/api/public/tnc-pdf'),
      ])
      setPayment(paymentData)
      if (tncImages.length) {
        setHasTncPdf(true)
        setTncPages(tncImages)
      }
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
  const remaining      = Math.max(0, afterDiscount - payment.previouslyPaid - payment.amount)

  // Always show gross base price (commission is internal only, not shown to customer)
  const baseRaw        = b.totalPrice - servicesTotal
  const displayBase    = baseRaw - discountAmt

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
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{[salutation(b.customer.gender), b.customer.name].filter(Boolean).join(' ')}</div>
                  {b.customer.phone && <div style={{ fontSize: 10, color: '#9ca3af' }}>{b.customer.phone}</div>}
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
            PAGE 2 — T&C V2.2 — PREAMBLE + §1–4
            ══════════════════════════════════════════════════════════ */}
        <div className="pb" style={{ background: 'white', padding: '28px 36px 32px' }}>

          {/* ── Header ── */}
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 1.5, color: '#111827', textTransform: 'uppercase', marginBottom: 3 }}>Samara Yachting</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, letterSpacing: 0.5, marginBottom: 12 }}>Terms &amp; Conditions — V 2.2</div>
            <div style={{ height: 3, width: 52, backgroundColor: ACCENT, borderRadius: 2, margin: '0 auto' }} />
          </div>

          {/* ── Preamble ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>Preamble</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>
              These Terms and Conditions ("T&amp;C") govern all bookings and services provided to or by PT Samara Yacht Agency and all its subsidiaries or partners (the "Principal") for yacht charters. These terms are binding for all clients who engage in these services, either directly or through an authorized Travel Agency ("Agency"). By confirming a booking and/or making payment, the Guest acknowledges and agrees to these T&amp;C.
            </div>
          </div>

          {/* ── §1 Roles and Responsibilities ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>1. Roles and Responsibilities</div>
            <div style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 2 }}>1.1. Principal and Operator</div>
              <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>PT Samara Yacht Agency acts as the commercial principal and/or chartering entity. The operational management of the vessel is carried out by PT Samara Yacht Management (the "Operator").</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 2 }}>1.2. Travel Agent</div>
              <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>Where a booking is made through a Travel Agent, the Agency acts solely as an intermediary between the Guest and the Principal. The Travel Agent does not own, operate, manage, or control the vessel, crew, or maritime operations and shall not be considered a contractual carrier or service provider.</div>
            </div>
          </div>

          {/* ── §2 Hierarchy of Documents ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>2. Hierarchy of Documents</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 5 }}>In the event of any inconsistency, the order of precedence is:</div>
            {[
              'a) The signed Charter Contract',
              'b) These Terms & Conditions',
              'c) Any marketing material, brochure, website content, or Agency communication',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 3 }}>
                <span style={{ color: ACCENT, fontWeight: 700, fontSize: 11, lineHeight: 1.4, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginTop: 5 }}>The provisions of the signed Charter Contract shall prevail, followed by these Terms &amp; Conditions.</div>
          </div>

          {/* ── §3 Cruise Type ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>3. Cruise Type</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 5 }}>The Principal offers two charter models:</div>
            <div style={{ marginBottom: 7 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>3.1. Private Charter: </span>
              <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>The entire vessel is chartered exclusively by one group. Guests enjoy full use of all cabins, crew, and a custom itinerary. Activities include island hopping, snorkeling, and leisure cruising.</span>
            </div>
            <div>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>3.2. Open Trip (FIT): </span>
              <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>Guests book individual cabins for 2 guests (extra beds available) and share the vessel and program with other travelers on a fixed schedule. Open Trips operate once a minimum of three (3) cabins is booked. If the minimum is not reached, the booking may be moved to the next available schedule; guests will be informed in advance.</span>
            </div>
          </div>

          {/* ── §4 Check-In and Check-Out ── */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>4. Check-In and Check-Out Times</div>
            {[
              { num: '4.1.', label: 'Check-In', text: 'Boarding begins at 10:00 AM on the first day of the trip. Guests are strongly encouraged to arrive one day in advance to avoid delays.' },
              { num: '4.2.', label: 'Check-Out', text: 'Disembarkation is scheduled around 2:00 PM on the final day of the cruise.' },
              { num: '4.3.', label: 'Private Charters', text: 'Check-in and check-out times may vary depending on the customized itinerary and flight schedules, as agreed upon in advance with the Principal.' },
            ].map(({ num, label, text }) => (
              <div key={num} style={{ marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>{num} {label}: </span>
                <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>{text}</span>
              </div>
            ))}
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════
            PAGE 3 — T&C V2.2 — §5–10
            ══════════════════════════════════════════════════════════ */}
        <div className="pb" style={{ background: 'white', padding: '28px 36px 32px' }}>

          {/* ── §5 Bookings and Payments ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>5. Bookings and Payments</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Charters and FIT below USD 5,000 per night:</div>
              {[
                '5.1. Deposit: A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation.',
                '5.2. Balance Payment: The remaining 70% must be paid at least 30 days before the departure date.',
                '5.3. Short-Notice Bookings: For bookings made within 30 days of departure, full payment is required at the time of booking.',
              ].map((t, i) => <div key={i} style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>{t}</div>)}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Charters and FIT above USD 5,000 per night:</div>
              {[
                '5.4. Deposit: A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation.',
                '5.5. Balance Payment: The remaining 70% must be paid at least 90 days before the departure date.',
                '5.6. Short-Notice Bookings: For bookings made within 90 days of departure, full payment is required at the time of booking.',
              ].map((t, i) => <div key={i} style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>{t}</div>)}
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>General Payment Rules:</div>
              {[
                '5.7. Failure to Pay: If payment deadlines are not met, the booking may be canceled without refund of previous payments.',
                '5.8. Payment Methods: Payment may be made by bank transfer or credit card. Credit card payments incur a 3% processing fee. All bank charges are the responsibility of the guest or agent.',
                '5.9. Payment Instructions: All payments must be made to the official bank account in the currency specified in the invoice issued by the Principal.',
              ].map((t, i) => <div key={i} style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>{t}</div>)}
            </div>
          </div>

          {/* ── §6 Cancellations and Refunds ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>6. Cancellations and Refunds</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>FIT (Open Trips)</div>
                <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>6.1. More than 30 days before departure: Payments are refundable minus the 30% deposit.</div>
                <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>6.2. 30 days or less before departure: No refund.</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Charters (Private)</div>
                <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>6.3. More than 90 days before departure: Payments are refundable minus the 30% deposit.</div>
                <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>6.4. 90 days or less before departure: No refund.</div>
              </div>
            </div>
          </div>

          {/* ── §7 General Policies ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>7. General Policies</div>
            {[
              '7.1. Refund Policy: Payments are generally non-refundable. However, the Principal may, acting in good faith, assist with rescheduling or offering alternative solutions where possible. No obligation or precedent is created.',
              '7.2. Force Majeure: In cases of force majeure — including natural disasters, adverse sea conditions, port closures, government restrictions, or safety-related decisions — the Principal may offer rescheduling or alternative arrangements at its discretion.',
              '7.3. Weather conditions at sea are unpredictable. Rain, swell, or cloudiness may occur and are not grounds for refund or cancellation.',
            ].map((t, i) => <div key={i} style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 4 }}>{t}</div>)}
          </div>

          {/* ── §8 Rescheduling ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>8. Rescheduling</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>8.1. While our policies are firm to ensure fairness and operational consistency, the Principal may, at its sole discretion, offer alternative solutions in extraordinary cases. Any exception granted is made without obligation and does not set a precedent.</div>
          </div>

          {/* ── §9 Illness ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>9. Illness Before or During the Trip</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 3 }}>9.1. Prior to Trip: The cancellation policy remains in effect. No refunds are granted unless covered by travel insurance.</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>9.2. During Trip: If a guest falls ill and cannot participate in activities, no refund will be granted. A formal letter may be issued to support a travel insurance claim.</div>
          </div>

          {/* ── §10 General Inclusions and Exclusions ── */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>10. General Inclusions and Exclusions</div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>10.1. Included in the Cruise</div>
                {[
                  'Transfers to/from local airport or local hotel',
                  'Accommodation onboard the Vessel',
                  'All meals, snacks, coffee/tea, mineral water and local beers',
                  'Scuba Diving for certified divers and use of water sports equipment (where available)',
                  'Guided excursions and scheduled activities',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <span style={{ color: ACCENT, fontWeight: 700, fontSize: 11, lineHeight: 1.4, flexShrink: 0 }}>•</span>
                    <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>10.2. Not Included</div>
                {[
                  'Alcoholic beverages',
                  'Domestic flights and hotel accommodations before or after the trip',
                  'Travel insurance',
                  'Crew gratuities (suggested at 10% of the trip value)',
                  'Optional activities not listed in the itinerary',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <span style={{ color: '#374151', fontWeight: 700, fontSize: 11, lineHeight: 1.4, flexShrink: 0 }}>•</span>
                    <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: '#9ca3af', lineHeight: 1.7 }}>10.3. Specific inclusions vary depending on the vessel and/or trip type. Details may be defined in the Charter Contract.</div>
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════
            PAGE 4 — T&C V2.2 — §11–19
            ══════════════════════════════════════════════════════════ */}
        <div className="pb" style={{ background: 'white', padding: '28px 36px 32px' }}>

          {/* ── §11 Guest Responsibilities ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>11. Guest Responsibilities</div>
            {[
              '11.1. Guests must follow all safety instructions provided by the crew.',
              '11.2. Respectful and cooperative behavior toward staff and fellow guests is expected at all times.',
              '11.3. Guests are financially responsible for any damage to the vessel or its equipment caused by negligence or misconduct.',
              '11.4. Failure to comply with safety or ecological rules may result in exclusion from activities without refund.',
            ].map((t, i) => <div key={i} style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>{t}</div>)}
          </div>

          {/* ── §12 Onboard Payments ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>12. Onboard Payments</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>12.1. Onboard purchases such as alcoholic drinks or merchandise can be paid in cash or by credit card (subject to a 3% surcharge).</div>
          </div>

          {/* ── §13 Diving Activities ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>13. Diving Activities (if offered)</div>
            {[
              '13.1. Guests must hold a valid dive certification (e.g., PADI Open Water or equivalent).',
              '13.2. Dive insurance is mandatory and must be presented before the first dive.',
              '13.3. A signed liability waiver is required before participating.',
              '13.4. Missed dives for personal or medical reasons are non-refundable.',
            ].map((t, i) => <div key={i} style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>{t}</div>)}
          </div>

          {/* ── §14 Liability and Indemnity ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>14. Liability and Indemnity</div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>14.1. Assumption of Risk: </span>
              <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>Guests participate in all onboard and offboard activities at their own risk. While the Principal takes reasonable precautions, the nature of sea travel and adventure activities involves inherent risks.</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>14.2. Limitation of Liability</div>
              <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 3 }}>To the maximum extent permitted by law, the Principal, its subsidiaries, partners, Agents, employees, and crew shall not be liable for any injury, illness, death, loss, damage, delay, or expense arising from:</div>
              {[
                'Slips, trips, or falls onboard (including staircases, decks, or wet areas)',
                'Participation in snorkeling, diving, swimming, trekking, or other activities',
                'Shore excursions organised by the Principal or any third-party service providers',
                'Guest negligence, disregard of safety instructions, or inappropriate behavior',
                'Loss, theft, or damage to personal belongings',
                'Delays, missed flights, or travel disruptions',
                'Incomplete or inaccurate travel documentation or insurance coverage',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 2 }}>
                  <span style={{ color: '#9ca3af', fontSize: 10.5, lineHeight: 1.4, flexShrink: 0 }}>14.2.{i + 1}.</span>
                  <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>14.3. Gross Negligence: </span>
              <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>The Principal shall only be liable where gross negligence or intentional misconduct can be clearly demonstrated. General sea conditions, weather-related movement, or vessel motion do not constitute grounds for liability.</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>14.4. Travel Insurance: </span>
              <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>Guests are strongly advised to obtain comprehensive travel and medical insurance, including coverage for accidents, evacuation, missed connections, and activity-related injuries.</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>14.5. Indemnification: </span>
              <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>By participating in the cruise, all Guests agree to fully indemnify and hold harmless the Principal, its subsidiaries, partners, Agents, employees, and crew from any claims, damages, losses, or expenses arising from the Guest&apos;s actions or omissions during the trip.</span>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', marginBottom: 2 }}>14.6. Weather and Itinerary Changes</div>
              <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>14.6.1. The Principal shall comply with all directives from port authorities or the Indonesian Coast Guard. Resulting itinerary changes, delays, or cancellations do not entitle the Guest to compensation.</div>
              <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>14.6.2. The Captain and crew may adjust the route, activities, or schedule at their discretion to ensure safety and optimize the guest experience.</div>
            </div>
          </div>

          {/* ── §15 Changes and Price Adjustments ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>15. Changes and Price Adjustments</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>15.1. The Principal reserves the right to update service descriptions and pricing at any time before a booking is confirmed.</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 2 }}>15.2. In rare cases, post-booking price adjustments may occur due to significant increases in fuel or operational costs, new government fees or taxes, or major exchange rate fluctuations.</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>15.3. Guests will be informed of any such changes and may choose to accept or cancel under applicable terms.</div>
          </div>

          {/* ── §16 Cancellation by Principal for Guest Misconduct ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>16. Cancellation by the Principal for Guest Misconduct</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7, marginBottom: 4 }}>The Principal reserves the right to cancel a guest&apos;s participation without refund if the guest:</div>
            {[
              'Provides false personal information',
              'Fails to follow crew instructions or safety procedures',
              'Damages the vessel',
              'Endangers themselves, other guests, or marine life',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 3 }}>
                <span style={{ color: ACCENT, fontWeight: 700, fontSize: 11, lineHeight: 1.4, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* ── §17 Governing Law ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>17. Governing Law</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>17.1. These Terms &amp; Conditions are governed by the laws of the Republic of Indonesia. Any disputes shall be resolved through mediation or arbitration in Bali.</div>
          </div>

          {/* ── §18 Acknowledgment and Acceptance ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid #f3f4f6' }}>18. Acknowledgment and Acceptance</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.7 }}>By confirming a booking, the guest acknowledges that they have read, understood, and agreed to these Terms and Conditions.</div>
          </div>

          {/* ── §19 Contact ── */}
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid #e5e7eb`, textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>19. Contact</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 2 }}>PT Samara Yacht Agency</div>
            <div style={{ fontSize: 10.5, color: '#374151', lineHeight: 1.8 }}>info@samarayachting.com · www.samarayachting.com</div>
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
