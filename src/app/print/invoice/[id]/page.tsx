'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

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
  const searchParams = useSearchParams()
  const currencyOverride = searchParams.get('currency')?.toUpperCase() ?? null
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
  const commissionPct  = isAgentBooking && payment.showNetAmount
    ? (b.tripType === 'OPEN_TRIP' ? (b.agent!.commissionOpenTrip ?? 0) : (b.agent!.commissionPrivateCharter ?? 0))
    : 0
  const baseRaw        = b.totalPrice - servicesTotal
  const baseAfterDisc  = baseRaw - discountAmt
  const commissionAmt  = baseAfterDisc * commissionPct / 100
  const afterDiscount  = b.totalPrice - discountAmt - commissionAmt
  const remaining      = Math.max(0, afterDiscount - payment.previouslyPaid - payment.amount)
  const displayBase    = baseAfterDisc - commissionAmt

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

        {/* ══ COVER PAGE ══ */}
        <div className="pb" style={{
          background: '#1b3d5c',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-between',
          minHeight: 900, padding: '60px 48px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: 9, color: 'white', textTransform: 'uppercase', marginBottom: 5 }}>SAMARA</div>
            <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: 6, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>YACHTING</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: 7, color: 'white', textTransform: 'uppercase', marginBottom: 14 }}>TERMS &amp; CONDITIONS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>www.samarayachting.com</div>
          </div>
        </div>

        {(() => {
          const TncHeader = () => (
            <div style={{ padding: '18px 42px 14px', borderBottom: '1.5px solid #1b3d5c', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 300, letterSpacing: 6, color: '#1b3d5c', textTransform: 'uppercase' }}>SAMARA</span>
              <span style={{ fontSize: 7.5, fontWeight: 400, letterSpacing: 4, color: '#7a9db5', textTransform: 'uppercase' }}>YACHTING</span>
            </div>
          )
          const TncFooter = () => (
            <div style={{ padding: '10px 42px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 'auto' }}>
              <div>
                <div style={{ fontSize: 7.5, fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>Office Address</div>
                <div style={{ fontSize: 7.5, color: '#9ca3af', lineHeight: 1.65 }}>
                  Jalan Tukad Badung IXB No.9, Renon,<br/>
                  Denpasar Selatan, Kota Denpasar, Bali 80234<br/>
                  Phone/WhatsApp: +62 859-5495-1085
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 7.5, color: '#9ca3af', lineHeight: 1.85 }}>
                  www.samarayachting.com<br/>
                  inquiry@samarayachting.com<br/>
                  @samara.liveaboard · @otiumyacht · @mischief.voyage
                </div>
              </div>
            </div>
          )
          const SH = ({ n, title }: { n: string; title: string }) => (
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1b3d5c', marginBottom: 6, marginTop: 16, paddingBottom: 4, borderBottom: '1px solid #e5e7eb' }}>
              {n}.&nbsp;&nbsp;{title}
            </div>
          )
          const Sub = ({ n, bold, text }: { n: string; bold?: string; text: string }) => (
            <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 4 }}>
              <span style={{ color: '#6b7280', marginRight: 5 }}>{n}</span>
              {bold && <span style={{ fontWeight: 600 }}>{bold}: </span>}
              {text}
            </div>
          )
          const Bullet = ({ text, accent }: { text: string; accent?: boolean }) => (
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: accent ? '#1b3d5c' : '#6b7280', fontWeight: 700, fontSize: 11, lineHeight: 1.3, flexShrink: 0 }}>•</span>
              <span style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.7 }}>{text}</span>
            </div>
          )
          const bodyStyle: React.CSSProperties = { flex: 1, padding: '20px 42px 24px' }

          return (
            <>

            {/* ══ PAGE 2 — Preamble · §1–4 ══ */}
            <div className="pb" style={{ background: 'white', display: 'flex', flexDirection: 'column', minHeight: 900 }}>
              <TncHeader />
              <div style={bodyStyle}>

                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1b3d5c', marginBottom: 6, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase' }}>Preamble</div>
                  <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75 }}>
                    These Terms and Conditions (&quot;T&amp;C&quot;) govern all bookings and services provided to or by <strong>PT Samara Yacht Agency</strong> and all its subsidiaries or partners (the &quot;Principal&quot;) for yacht charters. These terms are binding for all clients who engage in these services, either directly or through an authorized Travel Agency (&quot;Agency&quot;). By confirming a booking and/or making payment, the Guest acknowledges and agrees to these T&amp;C.
                  </div>
                </div>

                <SH n="1" title="Roles and Responsibilities" />
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>1.1.&nbsp;&nbsp;Principal and Operator</div>
                  <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 8 }}>
                    <strong>PT Samara Yacht Agency</strong> acts as the commercial principal and/or chartering entity. The operational management of the vessel is carried out by <strong>PT Samara Yacht Management</strong> (the &quot;Operator&quot;).
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>1.2.&nbsp;&nbsp;Travel Agent</div>
                  <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75 }}>
                    Where a booking is made through a Travel Agent, the Agency acts solely as an intermediary between the Guest and the Principal. The Travel Agent does not own, operate, manage, or control the vessel, crew, or maritime operations and shall not be considered a contractual carrier or service provider.
                  </div>
                </div>

                <SH n="2" title="Hierarchy of Documents" />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 5 }}>In the event of any inconsistency between:</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14, marginBottom: 1 }}>a) the signed Charter Contract,</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14, marginBottom: 1 }}>b) these Terms &amp; Conditions, and</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14, marginBottom: 5 }}>c) any marketing material, brochure, website content, or Agency communication,</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75 }}>the provisions of the signed Charter Contract shall prevail, followed by these Terms &amp; Conditions.</div>

                <SH n="3" title="Cruise Type" />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 6 }}>The Principal offers two charter models:</div>
                <Sub n="3.1." bold="Private Charter" text="The entire vessel is chartered exclusively by one group. Guests enjoy full use of all cabins, crew, and a custom itinerary. Activities include island hopping, snorkeling, and leisure cruising." />
                <Sub n="3.2." bold="Open Trip (FIT)" text="Guests book individual cabins for 2 guests (extra beds available) and share the vessel and program with other travelers on a fixed schedule. Open Trips will operate as scheduled once a minimum booking of three (3) cabins is reached. If the minimum booking is not reached, the booking may be moved to the next available schedule, and guests will be informed in advance." />

                <SH n="4" title="Check-In and Check-Out Times" />
                <Sub n="4.1." bold="Check-In" text="Boarding begins at 10:00 AM on the first day of the trip. Guests are strongly encouraged to arrive at the destination one day in advance to avoid delays." />
                <Sub n="4.2." bold="Check-Out" text="Disembarkation is scheduled around 2:00 PM on the final day of the cruise." />
                <Sub n="4.3." text="For Private Charters, check-in and check-out times may vary depending on the customized itinerary and flight schedules, as agreed upon in advance with the Principal." />

              </div>
              <TncFooter />
            </div>

            {/* ══ PAGE 3 — §5–10 ══ */}
            <div className="pb" style={{ background: 'white', display: 'flex', flexDirection: 'column', minHeight: 900 }}>
              <TncHeader />
              <div style={bodyStyle}>

                <SH n="5" title="Bookings and Payments" />
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Charters and FIT below USD 5,000.- per night:</div>
                <Sub n="5.1." bold="Deposit" text="A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation." />
                <Sub n="5.2." bold="Balance Payment" text="The remaining 70% must be paid at least 30 days before the departure date." />
                <Sub n="5.3." bold="Short-Notice Bookings" text="For bookings made within 30 days of departure, full payment is required at the time of booking." />
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginTop: 8, marginBottom: 4 }}>Charters and FIT above USD 5,000.- per night:</div>
                <Sub n="5.4." bold="Deposit" text="A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation." />
                <Sub n="5.5." bold="Balance Payment" text="The remaining 70% must be paid at least 90 days before the departure date." />
                <Sub n="5.6." bold="Short-Notice Bookings" text="For bookings made within 90 days of departure, full payment is required at the time of booking." />
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginTop: 8, marginBottom: 4 }}>General Payment Rules:</div>
                <Sub n="5.7." bold="Failure to Pay" text="If payment deadlines are not met, the booking may be canceled without refund of previous payments." />
                <Sub n="5.8." bold="Payment Methods" text="Payment may be made by bank transfer or credit card. Credit card payments incur a 3% processing fee. All bank charges are the responsibility of the guest or agent." />
                <Sub n="5.9." bold="Payment Instructions" text="All payments must be made to the official bank account in the currency specified in the invoice issued by the Principal." />

                <SH n="6" title="Cancellations and Refunds" />
                <div style={{ display: 'flex', gap: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>FIT</div>
                    <Sub n="6.1." bold="More than 30 days before departure" text="Payments are refundable minus the 30% deposit." />
                    <Sub n="6.2." bold="30 days or less before departure" text="No refund." />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Charters</div>
                    <Sub n="6.3." bold="More than 90 days before departure" text="Payments are refundable minus the 30% deposit." />
                    <Sub n="6.4." bold="90 days or less before departure" text="No refund." />
                  </div>
                </div>

                <SH n="7" title="General Policies" />
                <Sub n="7.1." bold="General Refund Policy" text="Payments are generally non-refundable. However, the Principal may, acting reasonably and in good faith, assist with rescheduling or offering alternative solutions where possible. No obligation or precedent is created." />
                <Sub n="7.2." bold="Force Majeure" text="In cases of force majeure, including but not limited to natural disasters, or similar uncontrollable events, adverse sea conditions, port closures, government restrictions, or safety-related decisions, the Principal may offer rescheduling or alternative arrangements at its discretion." />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 4, paddingLeft: 2 }}>
                  <span style={{ color: '#6b7280', marginRight: 5 }}>7.3.</span>
                  Weather conditions at sea are unpredictable. Rain, swell, or cloudiness may occur and are not grounds for refund or cancellation.
                </div>

                <SH n="8" title="Rescheduling" />
                <Sub n="8.1." bold="Discretionary Rescheduling" text="While our policies are firm to ensure fairness and operational consistency, the Principal may, at its sole discretion, choose to offer alternative solutions in extraordinary cases. Any exception granted is made without obligation and does not set a precedent." />

                <SH n="9" title="Illness Before or During the Trip" />
                <Sub n="9.1." bold="Prior to Trip" text="The cancellation policy remains in effect. No refunds are granted unless covered by travel insurance." />
                <Sub n="9.2." bold="During Trip" text="If a guest falls ill and cannot participate in activities, no refund will be granted. A formal letter may be issued to support a travel insurance claim." />

                <SH n="10" title="General Inclusions and Exclusions" />
                <div style={{ display: 'flex', gap: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>10.1.&nbsp;&nbsp;Included in the Cruise</div>
                    {[
                      'Transfers to/from local airport or local hotel',
                      'Accommodation onboard the Vessel',
                      'All meals, snacks, coffee/tea, and mineral water and local beers',
                      'Scuba Diving for certified divers and the use of water sports equipment (where available)',
                      'Guided excursions and scheduled activities',
                    ].map((t, i) => <Bullet key={i} text={t} accent />)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>10.2.&nbsp;&nbsp;Not Included</div>
                    {[
                      'Alcoholic beverages',
                      'Domestic flights and hotel accommodations before or after the trip',
                      'Travel insurance',
                      'Crew gratuities (suggested at 10% of the trip value)',
                      'Optional activities not listed in the itinerary',
                    ].map((t, i) => <Bullet key={i} text={t} />)}
                  </div>
                </div>
                <div style={{ fontSize: 9.5, color: '#6b7280', lineHeight: 1.75, marginTop: 6 }}>
                  <span style={{ marginRight: 5 }}>10.3.</span>
                  Specific inclusions vary depending on the vessel and/or trip type. Details might be defined in the Charter Contract in writing.
                </div>

              </div>
              <TncFooter />
            </div>

            {/* ══ PAGE 4 — §11–19 ══ */}
            <div className="pb" style={{ background: 'white', display: 'flex', flexDirection: 'column', minHeight: 900 }}>
              <TncHeader />
              <div style={bodyStyle}>

                <SH n="11" title="Guest Responsibilities" />
                <Sub n="11.1." text="Guests must follow all safety instructions provided by the crew." />
                <Sub n="11.2." text="Respectful and cooperative behavior toward staff and fellow guests is expected at all times." />
                <Sub n="11.3." text="Guests are financially responsible for any damage to the vessel or its equipment caused by negligence or misconduct." />
                <Sub n="11.4." text="Failure to comply with safety or ecological rules may result in exclusion from activities without refund." />

                <SH n="12" title="Onboard Payments" />
                <Sub n="12.1." text="Onboard purchases, such as alcoholic drinks or merchandise, can be paid in cash or by credit card (3% surcharge)." />

                <SH n="13" title="Diving Activities (if offered)" />
                <Sub n="13.1." text="Guests must hold a valid dive certification (e.g., PADI Open Water)." />
                <Sub n="13.2." bold="Dive insurance is mandatory" text="and must be presented before the first dive." />
                <Sub n="13.3." text="A signed liability waiver is required before participating." />
                <Sub n="13.4." text="Missed dives for personal or medical reasons are non-refundable." />

                <SH n="14" title="Liability and Indemnity" />
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3, paddingLeft: 2 }}>14.1.&nbsp;&nbsp;Assumption of Risk</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 8, paddingLeft: 14 }}>
                  Guests participate in all onboard and offboard activities at their own risk. While the Principal takes reasonable precautions to ensure guest safety, the nature of sea travel and adventure activities involves inherent risks.
                </div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3, paddingLeft: 2 }}>14.2.&nbsp;&nbsp;Limitation of Liability</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 5, paddingLeft: 14 }}>
                  To the maximum extent permitted by applicable law, neither the Principal, its subsidiaries, partners, Agents, employees, nor crew shall be liable for any injury, illness, death, loss, damage, delay, or expense arising from, including but not limited to, the following:
                </div>
                {[
                  'Slips, trips, or falls onboard (including staircases, decks, or wet areas)',
                  'Participation in snorkeling, diving, swimming, trekking, or other activities',
                  'Shore excursions or organised by the principal or any third-party service providers',
                  'Guest negligence, disregard of safety instructions, or inappropriate behavior',
                  'Loss, theft, or damage to personal belongings',
                  'Delays, missed flights, or travel disruptions',
                  'Incomplete or inaccurate travel documentation or insurance coverage',
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: 14 }}>
                    <span style={{ color: '#9ca3af', fontSize: 9.5, lineHeight: 1.4, flexShrink: 0, minWidth: 38 }}>14.2.{i + 1}.</span>
                    <span style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.7 }}>{t}</span>
                  </div>
                ))}
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginTop: 7, marginBottom: 3, paddingLeft: 2 }}>14.3.&nbsp;&nbsp;Gross Negligence</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 7, paddingLeft: 14 }}>
                  The Principal, its subsidiaries, partners, Agents, employees, and crew shall only be liable where gross negligence or intentional misconduct can be clearly demonstrated. General sea conditions, weather-related movement, vessel motion, or incidental onboard hazards do not constitute grounds for liability.
                </div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3, paddingLeft: 2 }}>14.4.&nbsp;&nbsp;Travel Insurance</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 7, paddingLeft: 14 }}>
                  Guests are strongly advised to obtain comprehensive travel and medical insurance, including coverage for accidents, evacuation, missed connections, and activity-related injuries (such as diving or trekking).
                </div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3, paddingLeft: 2 }}>14.5.&nbsp;&nbsp;Indemnification</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 7, paddingLeft: 14 }}>
                  By participating in the cruise, all Guests agree to fully indemnify, defend, and hold harmless the Principal, its subsidiaries, partners, Agents, employees, and crew from and against any claims, damages, losses, liabilities, or expenses (including legal fees) arising from the Guest&apos;s actions or omissions during the trip. This indemnity shall survive the end of the voyage and apply to any post-trip claims.
                </div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', marginBottom: 3, paddingLeft: 2 }}>14.6.&nbsp;&nbsp;Weather and Itinerary Changes</div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 3, paddingLeft: 14 }}>
                  14.6.1.&nbsp;&nbsp;The Principal shall comply with all directives issued by port authorities or the Indonesian Coast Guard. Any resulting itinerary changes, delays, or cancellations do not entitle the Guest to compensation.
                </div>
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14 }}>
                  14.6.2.&nbsp;&nbsp;The Captain and crew may adjust the route, activities, or schedule at their discretion at any time to ensure safety and optimize the guest experience.
                </div>

                <SH n="15" title="Changes and Price Adjustments" />
                <Sub n="15.1." text="The Principal reserves the right to update brochures, service descriptions, and pricing at any time before a booking is confirmed." />
                <Sub n="15.2." text="In very rare cases, price adjustments after booking may occur due to: significant increases in fuel or operational costs; new government fees, taxes, or port charges; or major exchange rate fluctuations. Guests will be informed of such changes and may choose to accept or cancel under applicable terms." />

                <SH n="16" title="Cancellation by the Principal for Guest Misconduct" />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, marginBottom: 6, paddingLeft: 14 }}>
                  16.1.&nbsp;&nbsp;The Principal reserves the right to cancel a guest&apos;s participation <strong>without refund</strong> if the guest:
                </div>
                <Bullet text="16.2.  Provides false personal information" />
                <Bullet text="16.3.  Fails to follow crew instructions or safety procedures" />
                <Bullet text="16.4.  Damages the vessel" />
                <Bullet text="16.5.  Endangers themselves, other guests, or marine life" />

                <SH n="17" title="Governing Law" />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14 }}>
                  17.1.&nbsp;&nbsp;These Terms &amp; Conditions are governed by the laws of the <strong>Republic of Indonesia</strong>. Any disputes shall be resolved through <strong>mediation or arbitration in Bali</strong>.
                </div>

                <SH n="18" title="Acknowledgment and Acceptance" />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14 }}>
                  By confirming a booking, the guest acknowledges that they have <strong>read, understood, and agreed</strong> to these Terms and Conditions.
                </div>

                <SH n="19" title="Contact" />
                <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.75, paddingLeft: 14 }}>
                  For assistance or inquiries, please contact:<br/>
                  <strong>PT Samara Yacht Agency</strong><br/>
                  info@samarayachting.com&nbsp;&nbsp;·&nbsp;&nbsp;www.samarayachting.com
                </div>

              </div>
              <TncFooter />
            </div>

            </>
          )
        })()}

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
