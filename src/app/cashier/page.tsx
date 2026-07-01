'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Vessel { id: string; name: string; image: string | null; locationId: string | null }
interface TripGuest { id: string | null; name: string; bookingId: string }
interface Trip { id: string; tripType: 'OPEN_TRIP' | 'PRIVATE_CHARTER'; label: string; startDate: string; endDate: string; guests: TripGuest[] }
interface MenuItem { id: string; name: string; type: 'FOOD' | 'BEVERAGE'; category: string; baseUnit: string; sellingPrice: number; imageKey: string | null; stock: number }

const TYPE_LABELS: Record<'FOOD' | 'BEVERAGE', string> = { FOOD: 'Food', BEVERAGE: 'Beverage' }
const TYPE_ICONS: Record<'FOOD' | 'BEVERAGE', string> = { FOOD: '🍽️', BEVERAGE: '🍷' }
interface CartLine { itemId: string | null; name: string; price: number; qty: number; unit: string }
interface SaleItem { id: string; itemId: string | null; name: string; unit: string; price: number; qty: number; round: number }
interface Sale {
  id: string; yachtId: string; locationId: string; bookingId: string | null; guestId: string | null
  guestName: string | null; status: 'open' | 'closed'; payMethod: string | null; total: number
  closedAt: string | null; createdAt: string; items: SaleItem[]
}

const PAY_METHODS = ['Cash', 'Card', 'Transfer', 'Complimentary']
const WALK_IN_TRIP_ID = '__walkin__'

const PIN_KEY = 'samara_cashier_pins'
const DEFAULT_PIN = '1111'
const loadPin = (vesselId: string) => {
  try {
    const v = localStorage.getItem(PIN_KEY)
    const pins = v ? JSON.parse(v) : {}
    return pins[vesselId] || DEFAULT_PIN
  } catch { return DEFAULT_PIN }
}

// ─── BRAND THEME — white / gold ────────────────────────────────────────────────
const GOLD      = '#bdac7e'
const GOLD_DARK = '#a8956a'
const INK       = '#1a252f'

const S = {
  page:     { minHeight: '100vh', background: '#fafaf8', fontFamily: "'DM Sans', 'Inter', sans-serif", color: INK },
  card:     { background: '#ffffff', border: '1px solid #ece6d8', borderRadius: 14, boxShadow: '0 1px 3px rgba(26,37,47,0.04)' },
  input:    { width: '100%', background: '#ffffff', border: '1px solid #e2dccb', color: INK, padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, fontFamily: "'DM Sans', sans-serif" },
  mono:     { fontFamily: "'DM Mono', 'Fira Mono', monospace" },
  btnGhost: { background: 'transparent', border: '1px solid #e2dccb', color: '#7a7468', padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
  goldBtn:  { background: `linear-gradient(135deg, ${GOLD_DARK}, ${GOLD})`, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
}

const fmt = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtDateRange = (s: string, e: string) => {
  const sd = new Date(s), ed = new Date(e)
  return `${sd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${ed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
}

const FONTS = <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet" />

// Below this width, the sidebar collapses into a top bar and the cart becomes a slide-up drawer (tablet portrait / phone).
const COMPACT_BREAKPOINT = 900
function useIsCompact() {
  const [isCompact, setIsCompact] = useState(false)
  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < COMPACT_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isCompact
}

// ─── PIN SCREEN ───────────────────────────────────────────────────────────────
function PinScreen({ vessel, onSuccess, onBack }: { vessel: Vessel; onSuccess: () => void; onBack: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const dig = (d: string) => {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    const expected = loadPin(vessel.id)
    if (next.length >= expected.length) {
      if (next === expected) { onSuccess() }
      else {
        setShake(true)
        setError('Wrong PIN')
        setTimeout(() => { setPin(''); setError(''); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      {FONTS}
      <button onClick={onBack} style={{ position: 'absolute', top: 20, left: 20, ...S.btnGhost, fontSize: 13 }}>← Back</button>

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚓</div>
        <div style={{ fontWeight: 700, fontSize: 22, color: GOLD_DARK }}>{vessel.name}</div>
        <div style={{ fontSize: 13, color: '#8a8378', marginTop: 4 }}>Enter your PIN</div>
      </div>

      <div style={{ width: '100%', maxWidth: 320, ...S.card, padding: 28, transition: 'all .2s' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28, animation: shake ? 'shake .5s' : 'none' }}>
          {Array.from({ length: Math.max(4, pin.length + (pin.length < 4 ? 1 : 0)) }).map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? GOLD : 'transparent', border: `2px solid ${i < pin.length ? GOLD : '#e2dccb'}`, transition: 'all .15s' }} />
          ))}
        </div>

        {error && <div style={{ textAlign: 'center', color: '#dc6868', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
            <button key={i} onClick={() => d && dig(d)} style={d ? {
              height: 56, borderRadius: 12, border: '1px solid #ece6d8', background: '#fafaf8',
              color: d === '⌫' ? '#dc6868' : INK, fontSize: 20, fontWeight: 600,
              cursor: 'pointer', ...S.mono, transition: 'all .1s',
            } : { background: 'transparent', border: 'none', cursor: 'default' }}>
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── VESSEL SELECT ────────────────────────────────────────────────────────────
function VesselSelect({ onSelect }: { onSelect: (v: Vessel) => void }) {
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cashier/vessels').then(r => r.json()).then(d => setVessels(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {FONTS}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 600, color: INK }}>Samara</div>
        <div style={{ ...S.mono, fontSize: 11, color: GOLD_DARK, letterSpacing: '0.25em', marginTop: 5 }}>CASHIER SYSTEM</div>
      </div>
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: '#8a8378', textAlign: 'center', marginBottom: 6, fontWeight: 600, letterSpacing: '0.1em' }}>SELECT VESSEL</div>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#b3ab9c', padding: 20 }}>Loading vessels…</div>
        ) : vessels.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#b3ab9c', padding: 20, fontSize: 13 }}>No vessel has a stock location set up yet.</div>
        ) : vessels.map(v => (
          <button key={v.id} onClick={() => onSelect(v)} style={{ background: '#fff', border: '1px solid #ece6d8', borderRadius: 14, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, fontFamily: "'DM Sans', sans-serif", width: '100%', boxShadow: '0 1px 3px rgba(26,37,47,0.04)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, overflow: 'hidden' }}>
              {v.image ? <img src={v.image} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '⚓'}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: INK }}>{v.name}</div>
              <div style={{ fontSize: 12, color: '#8a8378', marginTop: 2 }}>Tap to open cashier</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── TRIP SELECT ──────────────────────────────────────────────────────────────
function TripSelect({ vessel, onSelect, onBack }: { vessel: Vessel; onSelect: (trip: Trip | null) => void; onBack: () => void }) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/cashier/trips?yachtId=${vessel.id}`).then(r => r.json()).then(d => {
      setTrips(Array.isArray(d) ? d : [])
    }).finally(() => setLoading(false))
  }, [vessel.id])

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      {FONTS}
      <button onClick={onBack} style={{ position: 'absolute', top: 20, left: 20, ...S.btnGhost, fontSize: 13 }}>← Back</button>

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 22, color: GOLD_DARK }}>{vessel.name}</div>
        <div style={{ fontSize: 13, color: '#8a8378', marginTop: 4 }}>Select the trip currently running</div>
      </div>

      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#b3ab9c', padding: 20 }}>Loading trips…</div>
        ) : (
          <>
            {trips.map(t => (
              <button key={t.id} onClick={() => onSelect(t)} style={{ ...S.card, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: INK }}>{t.label}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: t.tripType === 'OPEN_TRIP' ? '#dbeafe' : '#fde7d2', color: t.tripType === 'OPEN_TRIP' ? '#1d4ed8' : '#c2660b' }}>
                    {t.tripType === 'OPEN_TRIP' ? 'Sharing' : 'Private'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#8a8378', marginTop: 4 }}>{fmtDateRange(t.startDate, t.endDate)} · {t.guests.length} guest{t.guests.length !== 1 ? 's' : ''}</div>
              </button>
            ))}
            {trips.length === 0 && (
              <div style={{ textAlign: 'center', color: '#b3ab9c', padding: '24px 0', fontSize: 13 }}>No trip running on this vessel right now.</div>
            )}
            <button onClick={() => onSelect(null)} style={{ ...S.btnGhost, width: '100%', padding: '14px', marginTop: 6 }}>
              Walk-in sale (no trip)
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── RECEIPT ──────────────────────────────────────────────────────────────────
function ReceiptView({ sale, vessel, onDone }: { sale: Sale; vessel: Vessel; onDone: () => void }) {
  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {FONTS}
      <div style={{ width: '100%', maxWidth: 420, ...S.card, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 40, marginBottom: 10, color: GOLD_DARK }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: GOLD_DARK, marginBottom: 4 }}>
            {sale.payMethod === 'Complimentary' ? 'Complimentary!' : 'Payment Received!'}
          </div>
          <div style={{ fontSize: 13, color: '#8a8378' }}>⚓ {vessel.name}{sale.guestName ? ` · ${sale.guestName}` : ''}</div>
        </div>

        <div style={{ background: '#fafaf8', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          {sale.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #ece6d8', fontSize: 14 }}>
              <span style={{ color: INK }}>{item.name} <span style={{ color: '#b3ab9c' }}>×{item.qty}</span></span>
              <span style={{ ...S.mono, color: '#7a7468' }}>{fmt(item.price * item.qty)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 800, fontSize: 20 }}>
            <span style={{ color: '#7a7468' }}>TOTAL</span>
            <span style={{ ...S.mono, color: GOLD_DARK }}>{fmt(sale.total)}</span>
          </div>
          <div style={{ fontSize: 12, color: '#8a8378', marginTop: 6 }}>Payment: {sale.payMethod}</div>
        </div>

        <button onClick={onDone} style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15, ...S.goldBtn }}>
          New Order
        </button>
      </div>
    </div>
  )
}

// ─── BILLS PAGE ───────────────────────────────────────────────────────────────
function BillsPage({ sales, reload, setActiveSaleId, vessel, trip, setSection, setReceipt, closeSale, createBill }: {
  sales: Sale[]; reload: () => void; setActiveSaleId: (id: string | null) => void; vessel: Vessel; trip: Trip | null
  setSection: (s: string) => void; setReceipt: (s: Sale) => void; closeSale: (sale: Sale, pm: string) => void
  createBill: (guest: TripGuest | null, walkInLabel: string) => Promise<boolean>
}) {
  const openBills   = sales.filter(b => b.status === 'open')
  const closedBills = sales.filter(b => b.status === 'closed').slice(0, 10)

  const [newBillOpen, setNewBillOpen] = useState(false)
  const [newBillGuest, setNewBillGuest] = useState<TripGuest | null>(null)
  const [newBillWalkIn, setNewBillWalkIn] = useState('')
  const [creatingBill, setCreatingBill] = useState(false)

  const [billDetailId, setBillDetailId] = useState<string | null>(null)
  const billDetail = openBills.find(b => b.id === billDetailId) ?? null
  const setBillDetail = (b: Sale | null) => setBillDetailId(b?.id ?? null)

  function closeNewBillModal() {
    setNewBillOpen(false); setNewBillGuest(null); setNewBillWalkIn('')
  }

  async function handleCreateBill() {
    setCreatingBill(true)
    const ok = await createBill(trip ? newBillGuest : null, newBillWalkIn)
    setCreatingBill(false)
    if (ok) closeNewBillModal()
  }

  const canCreate = trip ? !!newBillGuest : !!newBillWalkIn.trim()
  const isCompact = useIsCompact()

  return (
    <div style={{ overflowY: 'auto', padding: isCompact ? '16px' : 24, minHeight: 0 }}>
      <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: isCompact ? 19 : 22, fontWeight: 600, color: INK, marginBottom: 4 }}>📋 Bills</div>
          <div style={{ fontSize: 13, color: '#8a8378' }}>Manage open tabs for {vessel.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reload} style={{ ...S.btnGhost, fontSize: 12 }}>↻ Refresh</button>
          <button onClick={() => setNewBillOpen(true)} style={{ ...S.goldBtn, padding: '8px 16px', borderRadius: 9, fontSize: 13 }}>+ New Bill</button>
        </div>
      </div>

      {openBills.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>OPEN BILLS ({openBills.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openBills.map(b => (
              <button key={b.id} onClick={() => setBillDetail(b)} style={{ ...S.card, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.guestName ?? 'Guest'}</div>
                  <div style={{ fontSize: 12, color: '#8a8378', marginTop: 3 }}>{new Set(b.items.map(i => i.round)).size} round(s) · opened {new Date(b.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <div style={{ ...S.mono, fontSize: 19, fontWeight: 800, color: GOLD_DARK, letterSpacing: 'normal', whiteSpace: 'nowrap' }}>{fmt(b.total)}</div>
                  <span style={{ color: '#cfc8b8', fontSize: 16 }}>›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {closedBills.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>CLOSED TODAY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {closedBills.map(b => (
              <div key={b.id} style={{ ...S.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#7a7468' }}>{b.guestName ?? 'Guest'}</div>
                  <div style={{ fontSize: 11, color: '#b3ab9c', marginTop: 2 }}>{b.payMethod} · {new Set(b.items.map(i => i.round)).size} round(s)</div>
                </div>
                <div style={{ ...S.mono, fontWeight: 700, fontSize: 15, color: '#8a8378' }}>{fmt(b.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {openBills.length === 0 && closedBills.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#cfc8b8' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          No bills yet today
        </div>
      )}

      {/* ── New Bill Modal ── */}
      {newBillOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,37,47,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 24, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 20px 40px rgba(26,37,47,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: INK, marginBottom: 4 }}>New Bill / Tab</div>
            <div style={{ fontSize: 13, color: '#8a8378', marginBottom: 18 }}>Pilih tamu untuk membuka bill baru</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 600, marginBottom: 6 }}>GUEST {trip ? '(from trip)' : ''}</div>
              {trip ? (
                <select
                  value={newBillGuest?.id ?? newBillGuest?.bookingId ?? ''}
                  onChange={e => setNewBillGuest(trip.guests.find(g => (g.id ?? g.bookingId) === e.target.value) ?? null)}
                  style={S.input}
                  autoFocus
                >
                  <option value="">Select guest…</option>
                  {trip.guests.map(g => <option key={g.id ?? g.bookingId} value={g.id ?? g.bookingId}>{g.name}</option>)}
                </select>
              ) : (
                <input value={newBillWalkIn} onChange={e => setNewBillWalkIn(e.target.value)} placeholder="Guest / table name…" style={S.input} autoFocus />
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeNewBillModal} disabled={creatingBill} style={{ ...S.btnGhost, flex: 1, padding: '10px 16px' }}>Cancel</button>
              <button onClick={handleCreateBill} disabled={creatingBill || !canCreate} style={{ ...S.goldBtn, flex: 1, padding: '10px 16px', borderRadius: 9, opacity: (creatingBill || !canCreate) ? 0.5 : 1, cursor: (creatingBill || !canCreate) ? 'not-allowed' : 'pointer' }}>
                {creatingBill ? 'Creating…' : '+ Create Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill Detail Modal ── */}
      {billDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,37,47,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setBillDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '85vh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 20px 40px rgba(26,37,47,0.2)' }}>
            <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid #f1ede2', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 17, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{billDetail.guestName ?? 'Guest'}</div>
                  <div style={{ fontSize: 12, color: '#8a8378', marginTop: 3 }}>{new Set(billDetail.items.map(i => i.round)).size} round(s) · opened {new Date(billDetail.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <button onClick={() => setBillDetail(null)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            </div>

            <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 8 }}>ORDER ({billDetail.items.length})</div>
              {billDetail.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#cfc8b8', fontSize: 13 }}>Belum ada item</div>
              ) : (
                <div style={{ background: '#fafaf8', borderRadius: 10, padding: '4px 14px' }}>
                  {billDetail.items.map((item, i) => (
                    <div key={item.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', color: '#7a7468', fontSize: 13, padding: '8px 0', borderBottom: i < billDetail.items.length - 1 ? '1px solid #ece6d8' : 'none' }}>
                      <span>{item.name} <span style={{ color: '#b3ab9c' }}>×{item.qty}</span> <span style={{ fontSize: 10, color: '#cfc8b8' }}>· R{item.round}</span></span>
                      <span style={{ ...S.mono, letterSpacing: 'normal' }}>{fmt(item.qty * item.price)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1ede2' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#7a7468' }}>TOTAL</span>
                <span style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: GOLD_DARK, letterSpacing: 'normal' }}>{fmt(billDetail.total)}</span>
              </div>
            </div>

            <div style={{ padding: '16px 22px 22px', borderTop: '1px solid #f1ede2', flexShrink: 0 }}>
              <button onClick={() => { const b = billDetail; setBillDetail(null); setActiveSaleId(b.id); setSection('sales') }} style={{ ...S.goldBtn, width: '100%', padding: '10px 16px', borderRadius: 9, fontSize: 13 }}>+ Add Items</button>

              <div style={{ fontSize: 10, color: '#b3ab9c', fontWeight: 700, letterSpacing: '0.06em', margin: '14px 0 6px' }}>CLOSE BILL</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PAY_METHODS.map(pm => (
                  <button key={pm} onClick={() => { const b = billDetail; setBillDetail(null); closeSale(b, pm) }} style={{ flex: 1, minWidth: 0, padding: '8px 4px', borderRadius: 8, border: '1px solid #c5e5d4', background: '#eaf7f0', color: '#1f9d5c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pm}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN CASHIER APP ─────────────────────────────────────────────────────────
function CashierApp({ vessel, trip, onBack }: { vessel: Vessel; trip: Trip | null; onBack: () => void }) {
  const isCompact = useIsCompact()
  const [cartOpen, setCartOpen]   = useState(false)
  const [section, setSection]     = useState('sales')
  const [activeType, setActiveType] = useState<'All' | 'FOOD' | 'BEVERAGE'>('All')
  const [activeCat, setActiveCat] = useState('All')
  const [search, setSearch]       = useState('')
  const [cart, setCart]           = useState<CartLine[]>([])
  const [selectedGuest, setSelectedGuest] = useState<TripGuest | null>(null)
  const [walkInName, setWalkInName] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [sales, setSales]         = useState<Sale[]>([])
  const [activeSaleId, setActiveSaleId] = useState<string | null>(null)
  const [receipt, setReceipt]     = useState<Sale | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [busy, setBusy]           = useState(false)
  const [closeSaleConfirm, setCloseSaleConfirm] = useState<{ sale: Sale; pm: string } | null>(null)

  const ac = GOLD_DARK

  const loadMenu = useCallback(() => {
    fetch(`/api/cashier/menu?yachtId=${vessel.id}`).then(r => r.json()).then(d => setMenuItems(Array.isArray(d.items) ? d.items : []))
  }, [vessel.id])

  const loadSales = useCallback(() => {
    fetch(`/api/cashier/sales?yachtId=${vessel.id}`).then(r => r.json()).then(d => setSales(Array.isArray(d) ? d : []))
  }, [vessel.id])

  useEffect(() => { loadMenu(); loadSales() }, [loadMenu, loadSales])

  const types = useMemo(() => ['All', ...Array.from(new Set(menuItems.map(i => i.type)))] as ('All' | 'FOOD' | 'BEVERAGE')[], [menuItems])
  const categories = useMemo(() =>
    ['All', ...Array.from(new Set(menuItems.filter(i => activeType === 'All' || i.type === activeType).map(i => i.category)))],
    [menuItems, activeType])
  const cartTotal   = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const activeSale  = sales.find(s => s.id === activeSaleId) ?? null
  const openBills   = sales.filter(s => s.status === 'open')

  const NAV = [
    { key: 'sales', icon: '🧾', label: 'Sales' },
    { key: 'bills', icon: '📋', label: 'Bills', badge: openBills.length },
  ]

  const filtered = useMemo(() =>
    menuItems.filter(i =>
      (activeType === 'All' || i.type === activeType) &&
      (activeCat === 'All' || i.category === activeCat) &&
      (!search || i.name.toLowerCase().includes(search.toLowerCase()))
    ), [menuItems, activeType, activeCat, search])

  const addToCart = (item: MenuItem) => setCart(prev => {
    const ex = prev.find(c => c.itemId === item.id)
    if (ex) return prev.map(c => c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c)
    return [...prev, { itemId: item.id, name: item.name, price: item.sellingPrice, qty: 1, unit: item.baseUnit }]
  })

  const chgQty = (itemId: string, d: number) => setCart(prev =>
    prev.map(c => c.itemId === itemId ? { ...c, qty: c.qty + d } : c).filter(c => c.qty > 0)
  )

  const clearCart = () => { setCart([]); setSelectedGuest(null); setWalkInName(''); setPayMethod('Cash') }

  const guestLabel = (g: TripGuest | null) => g ? g.name : (walkInName.trim() || null)

  const addToBill = async () => {
    if (!cart.length || !activeSaleId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/cashier/sales/${activeSaleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_items', items: cart }),
      })
      if (res.ok) { clearCart(); setCartOpen(false); loadSales(); loadMenu() }
    } finally { setBusy(false) }
  }

  const closeSale = async (sale: Sale, pm: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/cashier/sales/${sale.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', payMethod: pm }),
      })
      if (res.ok) {
        const updated = await res.json()
        setActiveSaleId(null)
        setCartOpen(false)
        setReceipt(updated)
        loadSales()
      }
    } finally { setBusy(false) }
  }

  const requestCloseSale = (sale: Sale, pm: string) => setCloseSaleConfirm({ sale, pm })

  const confirmCloseSale = async () => {
    if (!closeSaleConfirm) return
    const { sale, pm } = closeSaleConfirm
    setCloseSaleConfirm(null)
    await closeSale(sale, pm)
  }

  const openNewBill = async () => {
    const guest = selectedGuest
    if (!trip && !walkInName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/cashier/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: vessel.id, locationId: vessel.locationId,
          bookingId: guest?.bookingId ?? null, guestId: guest?.id ?? null,
          guestName: guestLabel(guest),
        }),
      })
      if (res.ok) {
        const sale = await res.json()
        setSelectedGuest(null); setWalkInName('')
        setActiveSaleId(sale.id)
        loadSales()
      }
    } finally { setBusy(false) }
  }

  const createBillFor = async (guest: TripGuest | null, walkInLabel: string) => {
    const res = await fetch('/api/cashier/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yachtId: vessel.id, locationId: vessel.locationId,
        bookingId: guest?.bookingId ?? null, guestId: guest?.id ?? null,
        guestName: guest ? guest.name : (walkInLabel.trim() || null),
      }),
    })
    if (res.ok) loadSales()
    return res.ok
  }

  const recordDirectSale = async () => {
    if (!cart.length) return
    const guest = selectedGuest
    setBusy(true)
    try {
      const res = await fetch('/api/cashier/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: vessel.id, locationId: vessel.locationId,
          bookingId: guest?.bookingId ?? null, guestId: guest?.id ?? null,
          guestName: guestLabel(guest), items: cart, payMethod, closeImmediately: true,
        }),
      })
      if (res.ok) {
        const sale = await res.json()
        setReceipt(sale)
        clearCart()
        setCartOpen(false)
        loadSales(); loadMenu()
      }
    } finally { setBusy(false) }
  }

  if (receipt) return <ReceiptView sale={receipt} vessel={vessel} onDone={() => setReceipt(null)} />

  return (
    <div style={{ ...S.page, height: '100dvh', display: 'flex', flexDirection: isCompact ? 'column' : 'row', overflow: 'hidden' }}>
      {FONTS}

      {/* ── SIDEBAR NAV (top bar on compact / tablet & phone) ── */}
      <div style={{
        width: isCompact ? '100%' : 200, flexShrink: 0,
        background: '#fff',
        borderRight: isCompact ? 'none' : '1px solid #ece6d8',
        borderBottom: isCompact ? '1px solid #ece6d8' : 'none',
        display: 'flex', flexDirection: isCompact ? 'row' : 'column',
        alignItems: isCompact ? 'center' : 'stretch',
        justifyContent: isCompact ? 'space-between' : 'flex-start',
        flexWrap: 'wrap', gap: isCompact ? 10 : 0,
        padding: isCompact ? '10px 16px' : '24px 0',
      }}>
        {!isCompact && (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: INK }}>Samara</div>
            <div style={{ ...S.mono, fontSize: 9, color: GOLD_DARK, letterSpacing: '0.2em', marginTop: 3 }}>CASHIER</div>
          </div>
        )}

        {isCompact ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: ac, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⚓ {vessel.name}</span>
            <button onClick={onBack} style={{ fontSize: 11, color: '#8a8378', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, whiteSpace: 'nowrap' }}>Change →</button>
          </div>
        ) : (
          <div style={{ margin: '0 14px 20px', background: `${GOLD}15`, border: `1px solid ${GOLD}55`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: ac, fontWeight: 700, letterSpacing: '0.08em' }}>⚓ {vessel.name}</div>
            {trip && <div style={{ fontSize: 10, color: '#8a8378', marginTop: 2 }}>{trip.label}</div>}
            <button onClick={onBack} style={{ marginTop: 5, fontSize: 11, color: '#8a8378', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>Change vessel →</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: isCompact ? 'row' : 'column', gap: isCompact ? 6 : 0 }}>
          {NAV.map(n => (
            <button key={n.key} onClick={() => { setSection(n.key); setCartOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: isCompact ? 6 : 10,
              padding: isCompact ? '8px 14px' : '12px 20px',
              borderRadius: isCompact ? 20 : 0,
              background: section === n.key ? (isCompact ? ac : `${ac}10`) : 'transparent',
              border: 'none',
              borderLeft: !isCompact && section === n.key ? `3px solid ${ac}` : (isCompact ? 'none' : '3px solid transparent'),
              cursor: 'pointer',
              color: section === n.key ? (isCompact ? '#fff' : ac) : '#8a8378',
              fontWeight: 600, fontSize: isCompact ? 13 : 14, fontFamily: "'DM Sans', sans-serif",
              width: isCompact ? 'auto' : '100%', textAlign: 'left', whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: isCompact ? 14 : 16 }}>{n.icon}</span>
              <span style={isCompact ? undefined : { flex: 1 }}>{n.label}</span>
              {!!n.badge && n.badge > 0 && <span style={{ background: isCompact && section === n.key ? 'rgba(255,255,255,0.3)' : GOLD, color: '#fff', fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>{n.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN: Sales POS ── */}
      {section === 'sales' && (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 340px', position: 'relative' }}>

          {/* Menu panel */}
          <div style={{ overflowY: 'auto', padding: 20, paddingBottom: isCompact ? 84 : 20, borderRight: isCompact ? 'none' : '1px solid #ece6d8' }}>
            {activeSale && (
              <div style={{ background: `${ac}12`, border: `1px solid ${ac}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: ac, fontWeight: 700 }}>📋 Bill: {activeSale.guestName ?? 'Guest'} · {fmt(activeSale.total)}</span>
                <button onClick={() => setActiveSaleId(null)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', fontSize: 13 }}>✕ Exit</button>
              </div>
            )}

            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…" style={{ ...S.input, marginBottom: 10 }} />

            <div style={{ background: '#fff', border: '1px solid #ece6d8', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              {types.length > 2 && (
                <>
                  <div style={{ display: 'inline-flex', gap: 4, background: '#f6f3ea', borderRadius: 9, padding: 4 }}>
                    {types.map(t => {
                      const sel = activeType === t
                      return (
                        <button key={t} onClick={() => { setActiveType(t); setActiveCat('All') }} style={{ padding: '7px 16px', borderRadius: 7, cursor: 'pointer', border: 'none', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: sel ? '#fff' : 'transparent', color: sel ? INK : '#8a8378', boxShadow: sel ? '0 1px 3px rgba(26,37,47,0.1)' : 'none', transition: 'all .15s' }}>
                          {t === 'All' ? 'All Items' : `${TYPE_ICONS[t]} ${TYPE_LABELS[t]}`}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ height: 1, background: '#f1ede2', margin: '10px 0' }} />
                </>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {categories.map(cat => {
                  const sel = activeCat === cat
                  const inType = menuItems.filter(i => activeType === 'All' || i.type === activeType)
                  const count = cat === 'All' ? inType.length : inType.filter(i => i.category === cat).length
                  return (
                    <button key={cat} onClick={() => setActiveCat(cat)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px 7px 14px', borderRadius: 20, cursor: 'pointer', border: sel ? 'none' : '1px solid #ece6d8', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", background: sel ? ac : '#fff', color: sel ? '#fff' : '#5f594e', boxShadow: sel ? `0 2px 6px ${ac}44` : 'none', transition: 'all .15s' }}>
                      {cat}
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: sel ? 'rgba(255,255,255,0.25)' : '#f1ede2', color: sel ? '#fff' : '#8a8378' }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10 }}>
              {filtered.map(item => {
                const inCart = cart.find(c => c.itemId === item.id)
                const outOfStock = item.stock <= 0
                const atStockLimit = !!inCart && inCart.qty >= item.stock
                return (
                  <div key={item.id} style={{ background: '#fff', border: inCart ? `1.5px solid ${GOLD}` : '1px solid #ece6d8', borderRadius: 14, padding: 12, display: 'flex', gap: 12, fontFamily: "'DM Sans', sans-serif", opacity: outOfStock ? 0.55 : 1 }}>
                    <div style={{ width: 76, height: 76, borderRadius: 10, background: '#f1ede2', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.imageKey ? <img src={item.imageKey} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22, color: '#cfc8b8' }}>🍾</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: INK, lineHeight: 1.3 }}>{item.name}</div>
                        <div style={{ ...S.mono, fontSize: 13, fontWeight: 800, color: ac, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmt(item.sellingPrice)}</div>
                      </div>
                      <div style={{ fontSize: 11, color: outOfStock ? '#dc6868' : '#8a8378', marginTop: 3 }}>
                        {item.category} · {outOfStock ? 'Out of stock' : `${item.stock} ${item.baseUnit} left`}
                      </div>

                      {inCart ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fafaf8', border: '1px solid #ece6d8', borderRadius: 20, padding: 3 }}>
                            <button onClick={() => chgQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fff', color: '#dc6868', cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 0 0 1px #ece6d8' }}>−</button>
                            <span style={{ ...S.mono, fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{inCart.qty}</span>
                            <button onClick={() => !atStockLimit && chgQty(item.id, +1)} disabled={atStockLimit} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fff', color: atStockLimit ? '#cfc8b8' : '#1f9d5c', cursor: atStockLimit ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 0 0 1px #ece6d8' }}>+</button>
                          </div>
                          <div style={{ flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 20, background: GOLD, color: '#fff', fontSize: 11.5, fontWeight: 700 }}>
                            Added to Cart
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} disabled={outOfStock} style={{ marginTop: 'auto', width: '100%', padding: '8px 4px', borderRadius: 20, border: `1px solid ${ac}`, background: '#fff', color: ac, fontSize: 12, fontWeight: 700, cursor: outOfStock ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                          Add to Cart
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {!filtered.length && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#cfc8b8' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🍾</div>No items</div>}
            </div>
          </div>

          {/* Cart sidebar (static panel on desktop, slide-up drawer on compact) */}
          {(!isCompact || cartOpen) && (
          <div style={isCompact
            ? { position: 'fixed', inset: 0, background: '#fff', zIndex: 50, display: 'flex', flexDirection: 'column' }
            : { background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
          }>
            {isCompact && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #ece6d8', flexShrink: 0 }}>
                <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0 }}>‹ Back to Menu</button>
              </div>
            )}
            <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', overflowY: isCompact ? 'auto' : 'visible' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: INK, marginBottom: 14 }}>
                {activeSale ? <span style={{ color: ac }}>📋 {activeSale.guestName ?? 'Guest'}</span> : '🛒 Order'}
              </div>

              {!activeSale && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 600, marginBottom: 6 }}>GUEST {trip ? '(from trip)' : ''}</div>
                  {trip ? (
                    <select
                      value={selectedGuest?.id ?? selectedGuest?.bookingId ?? ''}
                      onChange={e => setSelectedGuest(trip.guests.find(g => (g.id ?? g.bookingId) === e.target.value) ?? null)}
                      style={S.input}
                    >
                      <option value="">Select guest…</option>
                      {trip.guests.map(g => <option key={g.id ?? g.bookingId} value={g.id ?? g.bookingId}>{g.name}</option>)}
                    </select>
                  ) : (
                    <input value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder="Guest / table name…" style={S.input} />
                  )}
                </div>
              )}

              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: '#cfc8b8', fontSize: 13, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🫙</div>
                  Tap items to add
                </div>
              ) : (
                <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                  {cart.map(item => {
                    const mi = menuItems.find(m => m.id === item.itemId)
                    const atLimit = item.qty >= (mi?.stock ?? Infinity)
                    return (
                    <div key={item.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #ece6d8' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f1ede2', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {mi?.imageKey ? <img src={mi.imageKey} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 15, color: '#cfc8b8' }}>🍾</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ ...S.mono, fontSize: 11, color: ac, letterSpacing: 'normal' }}>{fmt(item.qty * item.price)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => item.itemId && chgQty(item.itemId, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #ece6d8', background: '#fafaf8', color: '#dc6868', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>−</button>
                        <span style={{ ...S.mono, fontWeight: 700, fontSize: 14, minWidth: 18, textAlign: 'center' }}>{item.qty}</span>
                        <button onClick={() => !atLimit && item.itemId && chgQty(item.itemId, +1)} disabled={atLimit} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #ece6d8', background: '#fafaf8', color: atLimit ? '#cfc8b8' : '#1f9d5c', cursor: atLimit ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15 }}>+</button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div style={{ background: '#fafaf8', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 800, fontSize: 20 }}>
                    <span style={{ color: '#7a7468' }}>TOTAL <span style={{ fontWeight: 600, fontSize: 11, color: '#b3ab9c' }}>· {cart.reduce((s, i) => s + i.qty, 0)} items</span></span>
                    <span style={{ ...S.mono, color: ac, letterSpacing: 'normal' }}>{fmt(cartTotal)}</span>
                  </div>
                </div>
              )}

              {!activeSale && cart.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 600, marginBottom: 8 }}>PAYMENT</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {PAY_METHODS.map(m => (
                      <button key={m} onClick={() => setPayMethod(m)} style={{ padding: '8px', borderRadius: 8, cursor: 'pointer', border: payMethod === m ? `2px solid ${ac}` : '1px solid #ece6d8', background: payMethod === m ? `${ac}11` : '#fafaf8', color: payMethod === m ? ac : '#8a8378', fontWeight: 600, fontSize: 12 }}>
                        {m === 'Cash' ? '💵' : m === 'Card' ? '💳' : m === 'Transfer' ? '📲' : '🎁'} {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                {activeSale ? (
                  <>
                    <button onClick={addToBill} disabled={!cart.length || busy} style={{ width: '100%', padding: 13, borderRadius: 10, fontSize: 14, ...(cart.length ? S.goldBtn : { background: '#f1ede2', color: '#cfc8b8', border: 'none', cursor: 'not-allowed' }) }}>
                      {cart.length ? `+ Add to Bill (${fmt(cartTotal)})` : 'Select items to add'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PAY_METHODS.map(pm => (
                        <button key={pm} disabled={busy} onClick={() => requestCloseSale(activeSale, pm)} style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: '1px solid #c5e5d4', background: '#eaf7f0', color: '#1f9d5c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✓ {pm}</button>
                      ))}
                    </div>
                    <button onClick={() => setActiveSaleId(null)} style={{ ...S.btnGhost, width: '100%', fontSize: 12 }}>Exit Bill Mode</button>
                  </>
                ) : (
                  <>
                    {cart.length > 0 && (
                      <button onClick={recordDirectSale} disabled={busy || !(selectedGuest || walkInName.trim() || !trip)} style={{ ...S.goldBtn, width: '100%', padding: 14, borderRadius: 10, fontSize: 15 }}>
                        {busy ? 'Processing…' : `✓ Charge ${fmt(cartTotal)}`}
                      </button>
                    )}
                    <button onClick={openNewBill} disabled={busy || (!selectedGuest && !walkInName.trim())} style={{ ...S.btnGhost, width: '100%', padding: 13, borderRadius: 10, fontSize: 13, border: `1px solid ${ac}`, color: ac }}>
                      📋 Open as Bill / Tab
                    </button>
                    {cart.length > 0 && <button onClick={clearCart} style={{ ...S.btnGhost, width: '100%', fontSize: 12, color: '#dc6868', border: '1px solid #f3c9c9' }}>Clear</button>}
                  </>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Floating "View Cart" bar — compact layout only */}
          {isCompact && !cartOpen && (
            <button onClick={() => setCartOpen(true)} style={{
              position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderRadius: 14,
              ...S.goldBtn, boxShadow: '0 8px 24px rgba(168,149,106,0.4)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {activeSale ? `📋 ${activeSale.guestName ?? 'Guest'}` : '🛒 Cart'}
                {cart.length > 0 && ` · ${cart.reduce((s, i) => s + i.qty, 0)} items`}
              </span>
              <span style={{ ...S.mono, fontWeight: 800, letterSpacing: 'normal' }}>
                {fmt(cart.length > 0 ? cartTotal : (activeSale?.total ?? 0))} ›
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── MAIN: Bills page ── */}
      {section === 'bills' && (
        <BillsPage sales={sales} reload={loadSales} setActiveSaleId={setActiveSaleId} vessel={vessel} trip={trip} setSection={setSection} setReceipt={setReceipt} closeSale={requestCloseSale} createBill={createBillFor} />
      )}

      {/* ── Confirm Close Bill ── */}
      {closeSaleConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,37,47,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 360, padding: 24, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 20px 40px rgba(26,37,47,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: INK, marginBottom: 6 }}>Selesaikan Bill?</div>
            <div style={{ fontSize: 13, color: '#8a8378', marginBottom: 18 }}>
              Bill <b style={{ color: INK }}>{closeSaleConfirm.sale.guestName ?? 'Guest'}</b> akan ditutup dan tidak bisa diubah lagi.
            </div>
            <div style={{ background: '#fafaf8', borderRadius: 10, padding: '12px 14px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#b3ab9c', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 2 }}>METODE</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{closeSaleConfirm.pm}</div>
              </div>
              <div style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: GOLD_DARK, letterSpacing: 'normal' }}>{fmt(closeSaleConfirm.sale.total)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCloseSaleConfirm(null)} disabled={busy} style={{ ...S.btnGhost, flex: 1, padding: '10px 16px' }}>Batal</button>
              <button onClick={confirmCloseSale} disabled={busy} style={{ flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none', background: '#1f9d5c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Memproses…' : 'Ya, Selesaikan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CashierPage() {
  const [vessel, setVessel] = useState<Vessel | null>(null)
  const [authed, setAuthed] = useState(false)
  const [trip, setTrip]     = useState<Trip | null | undefined>(undefined) // undefined = not chosen yet

  if (!vessel) return <VesselSelect onSelect={v => { setVessel(v); setAuthed(false); setTrip(undefined) }} />
  if (!authed) return <PinScreen vessel={vessel} onSuccess={() => setAuthed(true)} onBack={() => setVessel(null)} />
  if (trip === undefined) return <TripSelect vessel={vessel} onSelect={t => setTrip(t)} onBack={() => { setVessel(null); setAuthed(false) }} />
  return <CashierApp vessel={vessel} trip={trip} onBack={() => { setVessel(null); setAuthed(false); setTrip(undefined) }} />
}
