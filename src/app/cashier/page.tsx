'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Anchor, Search, Plus, Minus, X, Check, Printer, Mail, Send, CreditCard,
  Banknote, Gift, Utensils, Wine, ClipboardList, ShoppingCart,
  ArrowLeft, Delete, Loader2,
} from 'lucide-react'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Vessel { id: string; name: string; image: string | null; locationId: string | null }
interface TripGuest { id: string | null; name: string; bookingId: string }
interface Trip { id: string; tripType: 'OPEN_TRIP' | 'PRIVATE_CHARTER'; label: string; startDate: string; endDate: string; guests: TripGuest[] }
interface MenuItem { id: string; name: string; type: 'FOOD' | 'BEVERAGE'; category: string; baseUnit: string; sellingPrice: number; imageKey: string | null; stock: number }
interface Branding { logoUrl: string; name: string }
interface StaffMember { id: string; fullName: string; department: string | null }

const TYPE_LABELS: Record<'FOOD' | 'BEVERAGE', string> = { FOOD: 'Food', BEVERAGE: 'Beverage' }
const TYPE_ICON: Record<'FOOD' | 'BEVERAGE', typeof Utensils> = { FOOD: Utensils, BEVERAGE: Wine }
interface CartLine { itemId: string | null; name: string; price: number; qty: number; unit: string }
interface SaleItem { id: string; itemId: string | null; name: string; unit: string; price: number; qty: number; round: number }
interface Sale {
  id: string; yachtId: string; locationId: string; bookingId: string | null; guestId: string | null
  guestName: string | null; status: 'open' | 'closed'; payMethod: string | null; total: number
  employeeId: string | null; employeeName: string | null; complimentaryReason: string | null
  closedAt: string | null; createdAt: string; items: SaleItem[]
  booking: { bookingCode: string } | null
  guest: { customer: { email: string | null } } | null
}

function StaffTag() {
  return <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 6, background: `${GOLD_DARK}18`, color: GOLD_DARK, flexShrink: 0 }}>STAFF</span>
}

const PAY_METHODS: { key: string; icon: typeof Banknote }[] = [
  { key: 'Cash', icon: Banknote },
  { key: 'Card', icon: CreditCard },
  { key: 'Transfer', icon: Send },
  { key: 'Complimentary', icon: Gift },
]
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

// ─── BRAND THEME — white / gold, calm & minimal ────────────────────────────────
const GOLD      = '#bdac7e'
const GOLD_DARK = '#a8956a'
const INK       = '#1a252f'

const S = {
  page:     { minHeight: '100vh', background: '#fafaf8', fontFamily: "'DM Sans', 'Inter', sans-serif", color: INK },
  card:     { background: '#ffffff', border: '1px solid #ece6d8', borderRadius: 14, boxShadow: '0 1px 3px rgba(26,37,47,0.04)' },
  input:    { width: '100%', background: '#ffffff', border: '1px solid #e2dccb', color: INK, padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, fontFamily: "'DM Sans', sans-serif" },
  mono:     { fontFamily: "'DM Mono', 'Fira Mono', monospace" },
  btnGhost: { background: 'transparent', border: '1px solid #e2dccb', color: '#7a7468', padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 },
  goldBtn:  { background: `linear-gradient(135deg, ${GOLD_DARK}, ${GOLD})`, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
}

const fmt = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtDateRange = (s: string, e: string) => {
  const sd = new Date(s), ed = new Date(e)
  return `${sd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${ed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
}
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

const FONTS = <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet" />
const PRINT_STYLE = <style>{'@media print { .no-print { display: none !important } body { background: #fff !important } }'}</style>

// Below this width, the sidebar collapses into a top bar and the cart becomes a slide-up drawer (tablet portrait/landscape / phone).
const COMPACT_BREAKPOINT = 1367
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

// Real per-tenant name + logo (see src/app/api/cashier/branding/route.ts) — used
// wherever the UI previously printed a hardcoded "Samara" wordmark, so a white-label
// tenant (e.g. Siloina) sees their own brand here too, not Samara's.
function useBranding() {
  const [branding, setBranding] = useState<Branding | null>(null)
  useEffect(() => {
    fetch('/api/cashier/branding').then(r => r.ok ? r.json() : null).then(setBranding).catch(() => {})
  }, [])
  return branding
}

function BrandMark({ branding, size = 34 }: { branding: Branding | null; size?: number }) {
  if (branding?.logoUrl) return <img src={branding.logoUrl} alt={branding.name} style={{ height: size, maxWidth: size * 4, objectFit: 'contain' }} />
  return <div style={{ fontFamily: "'Playfair Display', serif", fontSize: size * 0.7, fontWeight: 600, color: INK }}>Samara</div>
}

// ─── SIGN IN — vessel + PIN in one screen ──────────────────────────────────────
function SignInScreen({ onSuccess, branding }: { onSuccess: (v: Vessel) => void; branding: Branding | null }) {
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Vessel | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    fetch('/api/cashier/vessels').then(r => r.json()).then(d => setVessels(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  const pick = (v: Vessel) => { setSelected(v); setPin(''); setError('') }

  const dig = (d: string) => {
    if (!selected) return
    if (d === 'back') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    const expected = loadPin(selected.id)
    if (next.length >= expected.length) {
      if (next === expected) { onSuccess(selected) }
      else {
        setShake(true)
        setError('Wrong PIN')
        setTimeout(() => { setPin(''); setError(''); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
      {FONTS}
      <div style={{ width: '100%', maxWidth: 900, margin: 'auto', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 24 }}>

        {/* Left — sign in / vessel list */}
        <div style={{ flex: '1 1 360px', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <BrandMark branding={branding} />
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Sign in</div>
          <div style={{ fontSize: 13, color: '#8a8378', marginBottom: 22 }}>Select the vessel this terminal is for</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading ? (
              <div style={{ color: '#b3ab9c', padding: '20px 0' }}>Loading vessels…</div>
            ) : vessels.length === 0 ? (
              <div style={{ color: '#b3ab9c', padding: '20px 0', fontSize: 13 }}>No vessel has a stock location set up yet.</div>
            ) : vessels.map(v => {
              const sel = selected?.id === v.id
              return (
                <button key={v.id} onClick={() => pick(v)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                  padding: '14px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  border: sel ? 'none' : '1px solid #ece6d8',
                  background: sel ? INK : '#ffffff', color: sel ? '#fff' : INK,
                  transition: 'all .15s',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: sel ? 'rgba(255,255,255,0.15)' : `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {v.image ? <img src={v.image} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Anchor size={16} color={sel ? '#fff' : GOLD_DARK} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{v.name}</div>
                    <div style={{ fontSize: 11.5, color: sel ? 'rgba(255,255,255,0.6)' : '#8a8378', marginTop: 1 }}>Tap to sign in</div>
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ fontSize: 11.5, color: '#b3ab9c', marginTop: 24 }}>Offline entries sync once the vessel is back in signal range.</div>
        </div>

        {/* Right — PIN entry */}
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 14 }}>ENTER PIN</div>

          <div style={{ ...S.card, padding: 26, opacity: selected ? 1 : 0.45, pointerEvents: selected ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24, animation: shake ? 'shake .5s' : 'none' }}>
              {Array.from({ length: Math.max(4, pin.length + (pin.length < 4 ? 1 : 0)) }).map((_, i) => (
                <div key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: i < pin.length ? GOLD : 'transparent', border: `2px solid ${i < pin.length ? GOLD : '#e2dccb'}`, transition: 'all .15s' }} />
              ))}
            </div>

            {error && <div style={{ textAlign: 'center', color: '#dc6868', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((d, i) => (
                <button key={i} onClick={() => d && dig(d)} style={d ? {
                  height: 54, borderRadius: 12, border: '1px solid #ece6d8', background: '#fafaf8',
                  color: d === 'back' ? '#dc6868' : INK, fontSize: 19, fontWeight: 600,
                  cursor: 'pointer', ...S.mono, transition: 'all .1s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                } : { background: 'transparent', border: 'none', cursor: 'default' }}>
                  {d === 'back' ? <Delete size={17} /> : d}
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: '#b3ab9c', marginTop: 14, textAlign: 'center' }}>Forgot the PIN? Contact your purser.</div>
        </div>
      </div>
    </div>
  )
}

// ─── TRIP SELECT ──────────────────────────────────────────────────────────────
function TripSelect({ vessel, onSelect, onBack, branding }: { vessel: Vessel; onSelect: (trip: Trip | null) => void; onBack: () => void; branding: Branding | null }) {
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
      <button onClick={onBack} style={{ position: 'absolute', top: 20, left: 20, ...S.btnGhost, fontSize: 13 }}><ArrowLeft size={14} /> Back</button>
      <div style={{ position: 'absolute', top: 20, right: 20 }}><BrandMark branding={branding} size={26} /></div>

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
            <button onClick={() => onSelect(null)} style={{ ...S.btnGhost, width: '100%', padding: '14px', marginTop: 6, justifyContent: 'center' }}>
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
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState(sale.guest?.customer?.email ?? '')
  const [sending, setSending] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [emailError, setEmailError] = useState('')

  const sendEmail = async () => {
    if (!email.trim()) return
    setSending(true)
    setEmailStatus('idle')
    try {
      const res = await fetch(`/api/cashier/sales/${sale.id}/email-receipt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setEmailStatus('sent') }
      else { setEmailStatus('error'); setEmailError(data.error ?? 'Failed to send') }
    } catch {
      setEmailStatus('error'); setEmailError('Failed to send')
    } finally { setSending(false) }
  }

  const complimentary = sale.payMethod === 'Complimentary'

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {FONTS}{PRINT_STYLE}
      <div style={{ width: '100%', maxWidth: 420, ...S.card, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${GOLD_DARK}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Check size={26} color={GOLD_DARK} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: GOLD_DARK, marginBottom: 4 }}>
            {complimentary ? 'Complimentary!' : 'Paid in full'}
          </div>
          <div style={{ fontSize: 13, color: '#8a8378', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {vessel.name}{sale.guestName ? ` · ${sale.guestName}` : ''}
            {sale.employeeId && <StaffTag />}
          </div>
          {sale.booking && <div style={{ fontSize: 11.5, color: '#b3ab9c', marginTop: 2 }}>Recorded under charter {sale.booking.bookingCode}</div>}
        </div>

        <div style={{ background: '#fafaf8', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          {sale.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #ece6d8', fontSize: 14 }}>
              <span style={{ color: INK }}>{item.name} <span style={{ color: '#b3ab9c' }}>×{item.qty}</span></span>
              <span style={{ ...S.mono, color: '#7a7468' }}>{fmt(item.price * item.qty)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 800, fontSize: 20 }}>
            <span style={{ color: '#7a7468' }}>SETTLED</span>
            <span style={{ ...S.mono, color: GOLD_DARK }}>{fmt(sale.total)}</span>
          </div>
          <div style={{ fontSize: 12, color: '#8a8378', marginTop: 6 }}>Payment: {sale.payMethod}</div>
          {complimentary && sale.complimentaryReason && <div style={{ fontSize: 12, color: '#8a8378', marginTop: 2 }}>Reason: {sale.complimentaryReason}</div>}
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: emailOpen ? 12 : 0 }}>
          <button onClick={() => window.print()} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', padding: '11px 10px' }}><Printer size={14} /> Print</button>
          <button onClick={() => setEmailOpen(o => !o)} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', padding: '11px 10px' }}><Mail size={14} /> Email</button>
        </div>

        {emailOpen && (
          <div className="no-print" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={email} onChange={e => { setEmail(e.target.value); setEmailStatus('idle') }} placeholder="guest@email.com" style={{ ...S.input, fontSize: 13 }} />
              <button onClick={sendEmail} disabled={sending || !email.trim()} style={{ ...S.goldBtn, padding: '0 16px', borderRadius: 10, fontSize: 13, opacity: (sending || !email.trim()) ? 0.5 : 1 }}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
              </button>
            </div>
            {emailStatus === 'sent' && <div style={{ fontSize: 12, color: '#1f9d5c', marginTop: 6 }}>Receipt sent.</div>}
            {emailStatus === 'error' && <div style={{ fontSize: 12, color: '#dc6868', marginTop: 6 }}>{emailError}</div>}
          </div>
        )}

        <button onClick={onDone} className="no-print" style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15, ...S.goldBtn }}>
          New Order
        </button>
      </div>
    </div>
  )
}

// ─── SETTLE TAB — single-payer, single-method close screen ────────────────────
function SettleScreen({ sale, vessel, staffList, onBack, onConfirm, busy }: {
  sale: Sale; vessel: Vessel; staffList: StaffMember[]; onBack: () => void
  onConfirm: (payMethod: string, extra?: { employeeId: string; employeeName: string | null; complimentaryReason: string }) => void
  busy: boolean
}) {
  const [method, setMethod] = useState('Cash')
  const [compStaffId, setCompStaffId] = useState('')
  const [compReason, setCompReason] = useState('')
  const isCompact = useIsCompact()

  const compReady = method !== 'Complimentary' || (!!compStaffId && !!compReason.trim())
  const confirm = () => {
    if (method === 'Complimentary') {
      const staff = staffList.find(s => s.id === compStaffId)
      onConfirm(method, { employeeId: compStaffId, employeeName: staff?.fullName ?? null, complimentaryReason: compReason.trim() })
    } else {
      onConfirm(method)
    }
  }

  return (
    <div style={{ ...S.page, minHeight: '100dvh', padding: isCompact ? 16 : 32 }}>
      {FONTS}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <button onClick={onBack} style={{ ...S.btnGhost, marginBottom: 20 }}><ArrowLeft size={14} /> Back</button>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {/* Left — method + confirm */}
          <div style={{ flex: '1 1 360px', minWidth: 300 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 600 }}>Settle tab</div>
            <div style={{ fontSize: 13, color: '#8a8378', marginTop: 4, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 6 }}>
              {vessel.name}{sale.guestName ? ` · ${sale.guestName}` : ''} · opened {new Date(sale.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {sale.employeeId && <StaffTag />}
            </div>

            <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>METHOD</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 26 }}>
              {PAY_METHODS.map(({ key, icon: Icon }) => (
                <button key={key} onClick={() => setMethod(key)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: method === key ? `2px solid ${GOLD_DARK}` : '1px solid #ece6d8',
                  background: method === key ? `${GOLD_DARK}11` : '#fff', color: method === key ? GOLD_DARK : '#5f594e',
                  fontWeight: 600, fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
                }}>
                  <Icon size={16} /> {key}
                </button>
              ))}
            </div>

            {method === 'Complimentary' && (
              <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select value={compStaffId} onChange={e => setCompStaffId(e.target.value)} style={S.input}>
                  <option value="">Given by (staff)…</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.department ? ` · ${s.department}` : ''}</option>)}
                </select>
                <input value={compReason} onChange={e => setCompReason(e.target.value)} placeholder="Reason for complimentary…" style={S.input} />
              </div>
            )}

            <button onClick={confirm} disabled={busy || !compReady} style={{ width: '100%', padding: 16, borderRadius: 12, fontSize: 16, ...S.goldBtn, opacity: (busy || !compReady) ? 0.6 : 1 }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Take payment {fmt(sale.total)}
            </button>
          </div>

          {/* Right — statement */}
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>STATEMENT</div>
            <div style={{ ...S.card, padding: '6px 18px' }}>
              {sale.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#cfc8b8', fontSize: 13 }}>No items</div>
              ) : sale.items.map((item, i) => (
                <div key={item.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < sale.items.length - 1 ? '1px solid #ece6d8' : 'none', fontSize: 13.5 }}>
                  <span style={{ color: INK }}>{item.qty} × {item.name}</span>
                  <span style={{ ...S.mono, color: '#7a7468' }}>{fmt(item.qty * item.price)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 6px', fontSize: 13, color: '#8a8378' }}>
                <span>Subtotal</span><span style={{ ...S.mono }}>{fmt(sale.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #f1ede2', marginTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#7a7468' }}>TOTAL DUE</span>
                <span style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: GOLD_DARK }}>{fmt(sale.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── BILLS PAGE ("Open tabs") ──────────────────────────────────────────────────
function BillsPage({ sales, reload, setActiveSaleId, vessel, trip, staffList, setSection, settleBill, createBill }: {
  sales: Sale[]; reload: () => void; setActiveSaleId: (id: string | null) => void; vessel: Vessel; trip: Trip | null
  staffList: StaffMember[]; setSection: (s: string) => void; settleBill: (sale: Sale) => void
  createBill: (guest: TripGuest | null, walkInLabel: string, employee?: StaffMember | null) => Promise<boolean>
}) {
  const openBills   = sales.filter(b => b.status === 'open')
  const closedToday = sales.filter(b => b.status === 'closed' && b.closedAt && isToday(b.closedAt))
  const closedBills = closedToday.slice(0, 10)

  const billedToday   = closedToday.reduce((s, b) => s + b.total, 0)
  const unbilledTotal = openBills.reduce((s, b) => s + b.total, 0)

  const [newBillOpen, setNewBillOpen] = useState(false)
  const [newBillType, setNewBillType] = useState<'guest' | 'staff'>('guest')
  const [newBillGuest, setNewBillGuest] = useState<TripGuest | null>(null)
  const [newBillWalkIn, setNewBillWalkIn] = useState('')
  const [newBillStaff, setNewBillStaff] = useState<StaffMember | null>(null)
  const [creatingBill, setCreatingBill] = useState(false)

  const [billDetailId, setBillDetailId] = useState<string | null>(null)
  const billDetail = openBills.find(b => b.id === billDetailId) ?? null
  const setBillDetail = (b: Sale | null) => setBillDetailId(b?.id ?? null)

  function closeNewBillModal() {
    setNewBillOpen(false); setNewBillGuest(null); setNewBillWalkIn(''); setNewBillType('guest'); setNewBillStaff(null)
  }

  async function handleCreateBill() {
    setCreatingBill(true)
    const ok = newBillType === 'staff'
      ? await createBill(null, '', newBillStaff)
      : await createBill(trip ? newBillGuest : null, newBillWalkIn)
    setCreatingBill(false)
    if (ok) closeNewBillModal()
  }

  const canCreate = newBillType === 'staff' ? !!newBillStaff : (trip ? !!newBillGuest : !!newBillWalkIn.trim())
  const isCompact = useIsCompact()

  return (
    <div style={{ overflowY: 'auto', padding: isCompact ? '16px' : 24, minHeight: 0 }}>
      <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: isCompact ? 19 : 22, fontWeight: 600, color: INK, marginBottom: 4 }}>Open tabs</div>
          <div style={{ fontSize: 13, color: '#8a8378' }}>{openBills.length} active · {fmt(unbilledTotal)} unbilled</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reload} style={{ ...S.btnGhost, fontSize: 12, padding: '8px 12px' }}>↻</button>
          <button onClick={() => setNewBillOpen(true)} style={{ ...S.goldBtn, padding: '9px 16px', borderRadius: 9, fontSize: 13 }}><Plus size={14} /> New tab</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        {/* Left — tabs */}
        <div style={{ flex: '2 1 480px', minWidth: 280 }}>
          {openBills.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 10 }}>
              {openBills.map(b => (
                <button key={b.id} onClick={() => setBillDetail(b)} style={{ ...S.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.guestName ?? 'Guest'}</div>
                    {b.employeeId && <StaffTag />}
                  </div>
                  <div style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: GOLD_DARK }}>{fmt(b.total)}</div>
                  <div style={{ fontSize: 11.5, color: '#8a8378' }}>{b.items.length} item{b.items.length !== 1 ? 's' : ''} · opened {new Date(b.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 60, color: '#cfc8b8' }}>
              <ClipboardList size={32} style={{ marginBottom: 10 }} />
              <div>No open tabs</div>
            </div>
          )}

          {closedBills.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>CLOSED TODAY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {closedBills.map(b => (
                  <div key={b.id} style={{ ...S.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#7a7468', display: 'flex', alignItems: 'center', gap: 6 }}>{b.guestName ?? 'Guest'}{b.employeeId && <StaffTag />}</div>
                      <div style={{ fontSize: 11, color: '#b3ab9c', marginTop: 2 }}>{b.payMethod}</div>
                    </div>
                    <div style={{ ...S.mono, fontWeight: 700, fontSize: 15, color: '#8a8378' }}>{fmt(b.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — today summary */}
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>TODAY</div>
          <div style={{ ...S.card, padding: 16, marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: '#8a8378' }}>Billed</div>
            <div style={{ ...S.mono, fontSize: 22, fontWeight: 800, color: INK }}>{fmt(billedToday)}</div>
          </div>
          <div style={{ ...S.card, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: '#8a8378' }}>Unbilled</div>
            <div style={{ ...S.mono, fontSize: 22, fontWeight: 800, color: GOLD_DARK }}>{fmt(unbilledTotal)}</div>
          </div>

          {closedToday.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>LAST CLOSED</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {closedToday.slice(0, 3).map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', fontSize: 13, borderBottom: '1px solid #f1ede2' }}>
                    <span style={{ color: '#7a7468' }}>{b.guestName ?? 'Guest'}</span>
                    <span style={{ ...S.mono, color: '#8a8378' }}>{fmt(b.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── New Tab Modal ── */}
      {newBillOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,37,47,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 24, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 20px 40px rgba(26,37,47,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: INK, marginBottom: 4 }}>New tab</div>
            <div style={{ fontSize: 13, color: '#8a8378', marginBottom: 18 }}>Pick a guest or staff to open a new tab</div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['guest', 'staff'] as const).map(t => (
                <button key={t} onClick={() => setNewBillType(t)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textTransform: 'capitalize',
                  border: newBillType === t ? `2px solid ${GOLD_DARK}` : '1px solid #ece6d8',
                  background: newBillType === t ? `${GOLD_DARK}11` : '#fff', color: newBillType === t ? GOLD_DARK : '#8a8378',
                  fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                }}>{t}</button>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              {newBillType === 'staff' ? (
                <>
                  <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 600, marginBottom: 6 }}>STAFF</div>
                  <select
                    value={newBillStaff?.id ?? ''}
                    onChange={e => setNewBillStaff(staffList.find(s => s.id === e.target.value) ?? null)}
                    style={S.input}
                    autoFocus
                  >
                    <option value="">Select staff…</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.department ? ` · ${s.department}` : ''}</option>)}
                  </select>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeNewBillModal} disabled={creatingBill} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', padding: '10px 16px' }}>Cancel</button>
              <button onClick={handleCreateBill} disabled={creatingBill || !canCreate} style={{ ...S.goldBtn, flex: 1, padding: '10px 16px', borderRadius: 9, opacity: (creatingBill || !canCreate) ? 0.5 : 1, cursor: (creatingBill || !canCreate) ? 'not-allowed' : 'pointer' }}>
                {creatingBill ? 'Creating…' : 'Create'}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 17, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{billDetail.guestName ?? 'Guest'}</div>
                    {billDetail.employeeId && <StaffTag />}
                  </div>
                  <div style={{ fontSize: 12, color: '#8a8378', marginTop: 3 }}>{new Set(billDetail.items.map(i => i.round)).size} round(s) · opened {new Date(billDetail.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <button onClick={() => setBillDetail(null)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', flexShrink: 0 }}><X size={20} /></button>
              </div>
            </div>

            <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 8 }}>ORDER ({billDetail.items.length})</div>
              {billDetail.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#cfc8b8', fontSize: 13 }}>No items yet</div>
              ) : (
                <div style={{ background: '#fafaf8', borderRadius: 10, padding: '4px 14px' }}>
                  {billDetail.items.map((item, i) => (
                    <div key={item.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', color: '#7a7468', fontSize: 13, padding: '8px 0', borderBottom: i < billDetail.items.length - 1 ? '1px solid #ece6d8' : 'none' }}>
                      <span>{item.name} <span style={{ color: '#b3ab9c' }}>×{item.qty}</span> <span style={{ fontSize: 10, color: '#cfc8b8' }}>· R{item.round}</span></span>
                      <span style={S.mono}>{fmt(item.qty * item.price)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1ede2' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#7a7468' }}>TOTAL</span>
                <span style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: GOLD_DARK }}>{fmt(billDetail.total)}</span>
              </div>
            </div>

            <div style={{ padding: '16px 22px 22px', borderTop: '1px solid #f1ede2', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => { const b = billDetail; setBillDetail(null); setActiveSaleId(b.id); setSection('sales') }} style={{ ...S.btnGhost, width: '100%', justifyContent: 'center', padding: '10px 16px' }}><Plus size={14} /> Add Items</button>
              <button onClick={() => { const b = billDetail; setBillDetail(null); settleBill(b) }} style={{ ...S.goldBtn, width: '100%', padding: '10px 16px', borderRadius: 9, fontSize: 13.5 }}>Settle tab</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN CASHIER APP ─────────────────────────────────────────────────────────
function CashierApp({ vessel, trip, onBack, branding }: { vessel: Vessel; trip: Trip | null; onBack: () => void; branding: Branding | null }) {
  const isCompact = useIsCompact()
  const [cartOpen, setCartOpen]   = useState(false)
  const [section, setSection]     = useState('sales')
  const [activeType, setActiveType] = useState<'All' | 'FOOD' | 'BEVERAGE'>('All')
  const [activeCat, setActiveCat] = useState('All')
  const [search, setSearch]       = useState('')
  const [cart, setCart]           = useState<CartLine[]>([])
  const [buyerType, setBuyerType] = useState<'guest' | 'staff'>('guest')
  const [selectedGuest, setSelectedGuest] = useState<TripGuest | null>(null)
  const [walkInName, setWalkInName] = useState('')
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [payMethod, setPayMethod] = useState('Cash')
  const [compStaff, setCompStaff] = useState<StaffMember | null>(null)
  const [compReason, setCompReason] = useState('')
  const [sales, setSales]         = useState<Sale[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [activeSaleId, setActiveSaleId] = useState<string | null>(null)
  const [settleSaleId, setSettleSaleId] = useState<string | null>(null)
  const [receipt, setReceipt]     = useState<Sale | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [busy, setBusy]           = useState(false)

  const ac = GOLD_DARK

  const loadMenu = useCallback(() => {
    fetch(`/api/cashier/menu?yachtId=${vessel.id}`).then(r => r.json()).then(d => setMenuItems(Array.isArray(d.items) ? d.items : []))
  }, [vessel.id])

  const loadSales = useCallback(() => {
    fetch(`/api/cashier/sales?yachtId=${vessel.id}`).then(r => r.json()).then(d => setSales(Array.isArray(d) ? d : []))
  }, [vessel.id])

  const loadStaff = useCallback(() => {
    fetch(`/api/cashier/staff?yachtId=${vessel.id}`).then(r => r.json()).then(d => setStaffList(Array.isArray(d) ? d : []))
  }, [vessel.id])

  useEffect(() => { loadMenu(); loadSales(); loadStaff() }, [loadMenu, loadSales, loadStaff])

  const types = useMemo(() => ['All', ...Array.from(new Set(menuItems.map(i => i.type)))] as ('All' | 'FOOD' | 'BEVERAGE')[], [menuItems])
  const categories = useMemo(() =>
    ['All', ...Array.from(new Set(menuItems.filter(i => activeType === 'All' || i.type === activeType).map(i => i.category)))],
    [menuItems, activeType])
  const cartTotal   = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const activeSale  = sales.find(s => s.id === activeSaleId) ?? null
  const settleSale  = sales.find(s => s.id === settleSaleId) ?? null
  const openBills   = sales.filter(s => s.status === 'open')

  const NAV = [
    { key: 'sales', icon: ShoppingCart, label: 'Sell' },
    { key: 'bills', icon: ClipboardList, label: 'Tabs', badge: openBills.length },
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

  const clearCart = () => {
    setCart([]); setBuyerType('guest'); setSelectedGuest(null); setWalkInName(''); setSelectedStaff(null)
    setPayMethod('Cash'); setCompStaff(null); setCompReason('')
  }

  const guestLabel = (g: TripGuest | null) => g ? g.name : (walkInName.trim() || null)

  // Buyer fields for a new sale/tab: either a guest (from trip or walk-in text) or a staff member buying for themselves.
  const buyerFields = () => buyerType === 'staff'
    ? { guestId: null as string | null, bookingId: null as string | null, guestName: selectedStaff?.fullName ?? null, employeeId: selectedStaff?.id ?? null, employeeName: selectedStaff?.fullName ?? null }
    : { guestId: selectedGuest?.id ?? null, bookingId: selectedGuest?.bookingId ?? null, guestName: guestLabel(selectedGuest), employeeId: null as string | null, employeeName: null as string | null }

  // Complimentary always needs a responsible staff member + reason — either the buyer themselves (if buying as staff) or a separately picked staff.
  const compReady = payMethod !== 'Complimentary' || !!(buyerType === 'staff' ? selectedStaff : compStaff) && !!compReason.trim()

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

  const closeSale = async (sale: Sale, pm: string, extra?: { employeeId: string; employeeName: string | null; complimentaryReason: string }) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/cashier/sales/${sale.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', payMethod: pm, ...extra }),
      })
      if (res.ok) {
        const updated = await res.json()
        setActiveSaleId(null)
        setSettleSaleId(null)
        setCartOpen(false)
        setReceipt(updated)
        loadSales()
      }
    } finally { setBusy(false) }
  }

  const openNewBill = async () => {
    if (buyerType === 'staff' ? !selectedStaff : (!trip && !walkInName.trim())) return
    setBusy(true)
    try {
      const res = await fetch('/api/cashier/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yachtId: vessel.id, locationId: vessel.locationId, ...buyerFields() }),
      })
      if (res.ok) {
        const sale = await res.json()
        setSelectedGuest(null); setWalkInName(''); setSelectedStaff(null)
        setActiveSaleId(sale.id)
        loadSales()
      }
    } finally { setBusy(false) }
  }

  const createBillFor = async (guest: TripGuest | null, walkInLabel: string, employee?: StaffMember | null) => {
    const res = await fetch('/api/cashier/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yachtId: vessel.id, locationId: vessel.locationId,
        bookingId: employee ? null : (guest?.bookingId ?? null),
        guestId: employee ? null : (guest?.id ?? null),
        guestName: employee ? employee.fullName : (guest ? guest.name : (walkInLabel.trim() || null)),
        employeeId: employee?.id ?? null, employeeName: employee?.fullName ?? null,
      }),
    })
    if (res.ok) loadSales()
    return res.ok
  }

  const recordDirectSale = async () => {
    if (!cart.length || !compReady) return
    setBusy(true)
    try {
      const buyer = buyerFields()
      const compFields = payMethod === 'Complimentary'
        ? { employeeId: buyer.employeeId ?? compStaff?.id ?? null, employeeName: buyer.employeeName ?? compStaff?.fullName ?? null, complimentaryReason: compReason.trim() || null }
        : {}
      const res = await fetch('/api/cashier/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: vessel.id, locationId: vessel.locationId,
          ...buyer, ...compFields, items: cart, payMethod, closeImmediately: true,
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
  if (settleSale) return <SettleScreen sale={settleSale} vessel={vessel} staffList={staffList} onBack={() => setSettleSaleId(null)} onConfirm={(pm, extra) => closeSale(settleSale, pm, extra)} busy={busy} />

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
            <BrandMark branding={branding} size={26} />
            <div style={{ ...S.mono, fontSize: 9, color: GOLD_DARK, letterSpacing: '0.2em', marginTop: 6 }}>CASHIER</div>
          </div>
        )}

        {isCompact ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Anchor size={14} color={ac} />
            <span style={{ fontSize: 13, fontWeight: 700, color: ac, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vessel.name}</span>
            <button onClick={onBack} style={{ fontSize: 11, color: '#8a8378', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, whiteSpace: 'nowrap' }}>Change →</button>
          </div>
        ) : (
          <div style={{ margin: '0 14px 20px', background: `${GOLD}15`, border: `1px solid ${GOLD}55`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: ac, fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}><Anchor size={11} /> {vessel.name}</div>
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
              <n.icon size={isCompact ? 15 : 17} />
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
                <span style={{ fontSize: 13, color: ac, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14} /> {activeSale.guestName ?? 'Guest'}{activeSale.employeeId && <StaffTag />} · {fmt(activeSale.total)}</span>
                <button onClick={() => setActiveSaleId(null)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}><X size={13} /> Exit</button>
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} color="#b3ab9c" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…" style={{ ...S.input, paddingLeft: 34 }} />
            </div>

            <div style={{ background: '#fff', border: '1px solid #ece6d8', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              {types.length > 2 && (
                <>
                  <div style={{ display: 'inline-flex', gap: 4, background: '#f6f3ea', borderRadius: 9, padding: 4 }}>
                    {types.map(t => {
                      const sel = activeType === t
                      const Icon = t === 'All' ? null : TYPE_ICON[t]
                      return (
                        <button key={t} onClick={() => { setActiveType(t); setActiveCat('All') }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', border: 'none', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: sel ? '#fff' : 'transparent', color: sel ? INK : '#8a8378', boxShadow: sel ? '0 1px 3px rgba(26,37,47,0.1)' : 'none', transition: 'all .15s' }}>
                          {Icon && <Icon size={13} />} {t === 'All' ? 'All Items' : TYPE_LABELS[t]}
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
                const TypeIcon = TYPE_ICON[item.type]
                return (
                  <div key={item.id} style={{ background: '#fff', border: inCart ? `1.5px solid ${GOLD}` : '1px solid #ece6d8', borderRadius: 14, padding: 12, display: 'flex', gap: 12, fontFamily: "'DM Sans', sans-serif", opacity: outOfStock ? 0.55 : 1 }}>
                    <div style={{ width: 76, height: 76, borderRadius: 10, background: '#f1ede2', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.imageKey ? <img src={item.imageKey} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <TypeIcon size={22} color="#cfc8b8" />}
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
                            <button onClick={() => chgQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fff', color: '#dc6868', cursor: 'pointer', boxShadow: '0 0 0 1px #ece6d8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                            <span style={{ ...S.mono, fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{inCart.qty}</span>
                            <button onClick={() => !atStockLimit && chgQty(item.id, +1)} disabled={atStockLimit} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fff', color: atStockLimit ? '#cfc8b8' : '#1f9d5c', cursor: atStockLimit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px #ece6d8' }}><Plus size={12} /></button>
                          </div>
                          <div style={{ flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 20, background: GOLD, color: '#fff', fontSize: 11.5, fontWeight: 700 }}>
                            Added
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
              {!filtered.length && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#cfc8b8' }}>No items</div>}
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
                <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={14} /> Back to Menu</button>
              </div>
            )}
            <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', overflowY: isCompact ? 'auto' : 'visible' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: INK, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeSale ? <span style={{ color: ac, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14} /> {activeSale.guestName ?? 'Guest'}{activeSale.employeeId && <StaffTag />}</span> : <><ShoppingCart size={14} /> Order</>}
              </div>

              {!activeSale && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {(['guest', 'staff'] as const).map(t => (
                      <button key={t} onClick={() => { setBuyerType(t); if (t === 'staff') { setSelectedGuest(null); setWalkInName('') } else setSelectedStaff(null) }} style={{
                        flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', textTransform: 'capitalize',
                        border: buyerType === t ? `2px solid ${ac}` : '1px solid #ece6d8',
                        background: buyerType === t ? `${ac}11` : '#fafaf8', color: buyerType === t ? ac : '#8a8378',
                        fontWeight: 700, fontSize: 12.5, fontFamily: "'DM Sans', sans-serif",
                      }}>{t}</button>
                    ))}
                  </div>
                  {buyerType === 'staff' ? (
                    <>
                      <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 600, marginBottom: 6 }}>STAFF</div>
                      <select
                        value={selectedStaff?.id ?? ''}
                        onChange={e => setSelectedStaff(staffList.find(s => s.id === e.target.value) ?? null)}
                        style={S.input}
                      >
                        <option value="">Select staff…</option>
                        {staffList.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.department ? ` · ${s.department}` : ''}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}

              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: '#cfc8b8', fontSize: 13, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingCart size={26} style={{ marginBottom: 8 }} />
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
                        {mi?.imageKey ? <img src={mi.imageKey} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ShoppingCart size={15} color="#cfc8b8" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ ...S.mono, fontSize: 11, color: ac }}>{fmt(item.qty * item.price)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => item.itemId && chgQty(item.itemId, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #ece6d8', background: '#fafaf8', color: '#dc6868', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={13} /></button>
                        <span style={{ ...S.mono, fontWeight: 700, fontSize: 14, minWidth: 18, textAlign: 'center' }}>{item.qty}</span>
                        <button onClick={() => !atLimit && item.itemId && chgQty(item.itemId, +1)} disabled={atLimit} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #ece6d8', background: '#fafaf8', color: atLimit ? '#cfc8b8' : '#1f9d5c', cursor: atLimit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
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
                    <span style={{ ...S.mono, color: ac }}>{fmt(cartTotal)}</span>
                  </div>
                </div>
              )}

              {!activeSale && cart.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 600, marginBottom: 8 }}>PAYMENT</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {PAY_METHODS.map(({ key, icon: Icon }) => (
                      <button key={key} onClick={() => setPayMethod(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px', borderRadius: 8, cursor: 'pointer', border: payMethod === key ? `2px solid ${ac}` : '1px solid #ece6d8', background: payMethod === key ? `${ac}11` : '#fafaf8', color: payMethod === key ? ac : '#8a8378', fontWeight: 600, fontSize: 12 }}>
                        <Icon size={13} /> {key}
                      </button>
                    ))}
                  </div>
                  {payMethod === 'Complimentary' && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {buyerType !== 'staff' && (
                        <select value={compStaff?.id ?? ''} onChange={e => setCompStaff(staffList.find(s => s.id === e.target.value) ?? null)} style={S.input}>
                          <option value="">Given by (staff)…</option>
                          {staffList.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.department ? ` · ${s.department}` : ''}</option>)}
                        </select>
                      )}
                      <input value={compReason} onChange={e => setCompReason(e.target.value)} placeholder="Reason for complimentary…" style={S.input} />
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                {activeSale ? (
                  <>
                    <button onClick={addToBill} disabled={!cart.length || busy} style={{ width: '100%', padding: 13, borderRadius: 10, fontSize: 14, ...(cart.length ? S.goldBtn : { background: '#f1ede2', color: '#cfc8b8', border: 'none', cursor: 'not-allowed' }) }}>
                      {cart.length ? `Add to Tab (${fmt(cartTotal)})` : 'Select items to add'}
                    </button>
                    <button onClick={() => setSettleSaleId(activeSale.id)} style={{ ...S.btnGhost, width: '100%', justifyContent: 'center', fontSize: 13, border: `1px solid ${ac}`, color: ac }}>Settle tab</button>
                    <button onClick={() => setActiveSaleId(null)} style={{ ...S.btnGhost, width: '100%', justifyContent: 'center', fontSize: 12 }}>Exit tab mode</button>
                  </>
                ) : (
                  <>
                    {cart.length > 0 && (
                      <button onClick={recordDirectSale} disabled={busy || !compReady || (buyerType === 'staff' ? !selectedStaff : !(selectedGuest || walkInName.trim() || !trip))} style={{ ...S.goldBtn, width: '100%', padding: 14, borderRadius: 10, fontSize: 15 }}>
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Charge {fmt(cartTotal)}
                      </button>
                    )}
                    <button onClick={openNewBill} disabled={busy || (buyerType === 'staff' ? !selectedStaff : (!selectedGuest && !walkInName.trim()))} style={{ ...S.btnGhost, width: '100%', justifyContent: 'center', padding: 13, borderRadius: 10, fontSize: 13, border: `1px solid ${ac}`, color: ac }}>
                      <ClipboardList size={14} /> Open as Tab
                    </button>
                    {cart.length > 0 && <button onClick={clearCart} style={{ ...S.btnGhost, width: '100%', justifyContent: 'center', fontSize: 12, color: '#dc6868', border: '1px solid #f3c9c9' }}>Clear</button>}
                  </>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Floating "View Cart" bar — compact layout only */}
          {isCompact && !cartOpen && (
            <button onClick={() => setCartOpen(true)} style={{
              ...S.goldBtn,
              position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderRadius: 14,
              boxShadow: '0 8px 24px rgba(168,149,106,0.4)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeSale ? <><ClipboardList size={14} /> {activeSale.guestName ?? 'Guest'}{activeSale.employeeId && <StaffTag />}</> : <><ShoppingCart size={14} /> Cart</>}
                {cart.length > 0 && ` · ${cart.reduce((s, i) => s + i.qty, 0)} items`}
              </span>
              <span style={{ ...S.mono, fontWeight: 800 }}>
                {fmt(cart.length > 0 ? cartTotal : (activeSale?.total ?? 0))}
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── MAIN: Bills page ── */}
      {section === 'bills' && (
        <BillsPage sales={sales} reload={loadSales} setActiveSaleId={setActiveSaleId} vessel={vessel} trip={trip} staffList={staffList} setSection={setSection} settleBill={b => setSettleSaleId(b.id)} createBill={createBillFor} />
      )}
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CashierPage() {
  const branding = useBranding()
  const [vessel, setVessel] = useState<Vessel | null>(null)
  const [trip, setTrip]     = useState<Trip | null | undefined>(undefined) // undefined = not chosen yet

  if (!vessel) return <SignInScreen onSuccess={v => { setVessel(v); setTrip(undefined) }} branding={branding} />
  if (trip === undefined) return <TripSelect vessel={vessel} onSelect={t => setTrip(t)} onBack={() => setVessel(null)} branding={branding} />
  return <CashierApp vessel={vessel} trip={trip} onBack={() => { setVessel(null); setTrip(undefined) }} branding={branding} />
}
