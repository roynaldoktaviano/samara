'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { cashierSlug } from '@/lib/cashier-slug'
import {
  Anchor, Search, Plus, Minus, X, Check, Printer, Mail, Send, CreditCard,
  Banknote, Gift, Utensils, ClipboardList, ShoppingCart,
  ArrowLeft, Delete, Loader2, ChevronDown, Trash2, CalendarDays, Clock, Power, Receipt,
  Wine, Beer, Coffee, CupSoda, Martini, Sandwich, CakeSlice, GlassWater, Soup, LayoutGrid,
} from 'lucide-react'

// ─── TYPES ────────────────────────────────────────────────────────────────────
// pinLength comes from the public vessel list (null = no PIN set in the ERP yet); locationId/barConfigured only after /api/cashier/login.
interface Vessel { id: string; name: string; image: string | null; locationId: string | null; barConfigured?: boolean; pinLength?: number | null }
interface TripGuest { id: string | null; name: string; bookingId: string }
interface Trip { id: string; tripType: 'OPEN_TRIP' | 'PRIVATE_CHARTER'; label: string; startDate: string; endDate: string; guests: TripGuest[] }
interface PosCategoryLite { id: string; name: string }
interface MenuItem { kind: 'item'; id: string; name: string; categoryId: string; categoryName: string; unit: string; price: number; imageKey: string | null; stock: number }
interface PackageEntry { kind: 'package'; id: string; name: string; categoryId: string; categoryName: string; price: number; imageKey: string | null; description: string | null; components: { name: string; qty: number }[] }
// A Menu made from ingredients (recipe); stock = portions the scarcest ingredient still allows.
interface RecipeEntry { kind: 'recipe'; id: string; name: string; categoryId: string; categoryName: string; price: number; imageKey: string | null; description: string | null; stock: number; components: { name: string; qty: number; unit: string }[] }
type CatalogEntry = MenuItem | PackageEntry | RecipeEntry
interface DiscountEntry { id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number }
interface Branding { logoUrl: string; name: string }
interface StaffMember { id: string; fullName: string; department: string | null }

interface CartLine { kind: 'item' | 'package' | 'recipe'; itemId: string | null; packageId: string | null; recipeId?: string | null; name: string; price: number; qty: number; unit: string }
interface SaleItem { id: string; itemId: string | null; packageId: string | null; name: string; unit: string; price: number; qty: number; round: number }
interface Sale {
  id: string; yachtId: string; locationId: string; bookingId: string | null; guestId: string | null
  guestName: string | null; status: 'open' | 'closed'; payMethod: string | null; total: number
  discountId: string | null; discountName: string | null; discountAmount: number
  employeeId: string | null; employeeName: string | null; complimentaryReason: string | null
  closedAt: string | null; createdAt: string; items: SaleItem[]
  booking: { bookingCode: string } | null
  guest: { customer: { email: string | null } } | null
}

/** The amount actually charged after discount — sale.total stays the raw item subtotal. */
const chargedTotal = (sale: Pick<Sale, 'total' | 'discountAmount'>) => sale.total - (sale.discountAmount || 0)

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


// ─── BRAND THEME — white / gold, calm & minimal ────────────────────────────────
const GOLD      = '#d4a73c'
const GOLD_DARK = '#b8892a'
const INK       = '#1a252f'

const S = {
  page:     { minHeight: '100vh', background: '#fafaf8', fontFamily: "'DM Sans', 'Inter', sans-serif", color: INK },
  card:     { background: '#ffffff', border: '1px solid #ece6d8', borderRadius: 14, boxShadow: '0 1px 3px rgba(26,37,47,0.04)' },
  input:    { width: '100%', background: '#ffffff', border: '1px solid #e2dccb', color: INK, padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, fontFamily: "'DM Sans', sans-serif" },
  mono:     { fontFamily: "'DM Mono', 'Fira Mono', monospace" },
  btnGhost: { background: 'transparent', border: '1px solid #e2dccb', color: '#7a7468', padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 },
  goldBtn:  { background: `linear-gradient(135deg, #a8781c, ${GOLD} 60%, #e2bc5c)`, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
}

const fmt = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtDateRange = (s: string, e: string) => {
  const sd = new Date(s), ed = new Date(e)
  return `${sd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${ed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
}
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

/** Searchable staff picker — staffList is already scoped to the open vessel's crew (see /api/cashier/staff). */
function StaffSelect({ staffList, value, onChange, placeholder }: {
  staffList: StaffMember[]; value: string; onChange: (id: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = staffList.find(s => s.id === value) ?? null
  const filtered = staffList.filter(s =>
    !query || s.fullName.toLowerCase().includes(query.toLowerCase()) || s.department?.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...S.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ color: selected ? INK : '#b3ab9c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? `${selected.fullName}${selected.department ? ` · ${selected.department}` : ''}` : placeholder}
        </span>
        <ChevronDown size={14} color="#b3ab9c" style={{ flexShrink: 0, marginLeft: 6 }} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setOpen(false); setQuery('') }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #ece6d8', borderRadius: 10, boxShadow: '0 8px 24px rgba(26,37,47,0.15)', zIndex: 50, maxHeight: 240, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 8, borderBottom: '1px solid #ece6d8', flexShrink: 0 }}>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search staff…" style={{ ...S.input, height: 32, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div style={{ overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '14px 12px', fontSize: 12, color: '#b3ab9c', textAlign: 'center' }}>No staff found</div>
              ) : filtered.map(s => (
                <button key={s.id} type="button" onClick={() => { onChange(s.id); setOpen(false); setQuery('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13, background: value === s.id ? '#faf6ec' : 'transparent', border: 'none', cursor: 'pointer', color: INK, fontFamily: "'DM Sans', sans-serif" }}>
                  {s.fullName}{s.department && <span style={{ color: '#8a8378' }}> · {s.department}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

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
function SignInScreen({ onSuccess, branding, vesselSlug }: { onSuccess: (v: Vessel) => void; branding: Branding | null; vesselSlug?: string }) {
  const [vessels, setVessels] = useState<Vessel[]>([])
  // A per-vessel link (cashier.<domain>/samara1) locks this terminal to that one vessel.
  const [unknownSlug, setUnknownSlug] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Vessel | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    fetch('/api/cashier/vessels').then(r => r.json()).then(d => {
      const all: Vessel[] = Array.isArray(d) ? d : []
      const locked = vesselSlug ? all.find(v => cashierSlug(v.name) === vesselSlug.toLowerCase()) : undefined
      if (locked) { setVessels([locked]); setSelected(locked) }
      else { setVessels(all); setUnknownSlug(!!vesselSlug) }
    }).finally(() => setLoading(false))
  }, [vesselSlug])

  const pick = (v: Vessel) => { setSelected(v); setPin(''); setError('') }

  // PIN is checked server-side (/api/cashier/login sets the terminal's cookie); auto-submits
  // once the vessel's PIN length is reached.
  const dig = async (d: string) => {
    if (!selected || checking || !selected.pinLength) return
    if (d === 'back') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= selected.pinLength) return
    const next = pin + d
    setPin(next)
    if (next.length < selected.pinLength) return
    setChecking(true)
    try {
      const res = await fetch('/api/cashier/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yachtId: selected.id, pin: next }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { onSuccess(data); return }
      setShake(true)
      setError(data.error ?? 'Wrong PIN')
      setTimeout(() => { setPin(''); setShake(false) }, 700)
    } catch {
      setError('No connection'); setPin('')
    } finally { setChecking(false) }
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
          <div style={{ fontSize: 13, color: '#8a8378', marginBottom: 22 }}>
            {vesselSlug && !unknownSlug ? 'Enter the PIN to open this terminal' : 'Select the vessel this terminal is for'}
          </div>
          {unknownSlug && (
            <div style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
              No vessel matches &ldquo;/{vesselSlug}&rdquo; — pick one below.
            </div>
          )}

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
              {Array.from({ length: selected?.pinLength ?? 4 }).map((_, i) => (
                <div key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: i < pin.length ? GOLD : 'transparent', border: `2px solid ${i < pin.length ? GOLD : '#e2dccb'}`, transition: 'all .15s' }} />
              ))}
            </div>

            {selected && !selected.pinLength && <div style={{ textAlign: 'center', color: '#b45309', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>No PIN set for this vessel yet — ask an admin to set one in the ERP (Yachts → key icon).</div>}
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
        {vessel.barConfigured === false && (
          <div style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 10, padding: '8px 12px', marginTop: 12, maxWidth: 420 }}>
            No POS Bar is set for this vessel yet — sales deduct from its first stock location. Set one in Purchasing → Stock Locations.
          </div>
        )}
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
          {sale.discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 13, color: '#8a8378' }}>
              <span>Subtotal</span><span style={{ ...S.mono }}>{fmt(sale.total)}</span>
            </div>
          )}
          {sale.discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 0', fontSize: 13, color: '#1f9d5c' }}>
              <span>Discount{sale.discountName ? ` (${sale.discountName})` : ''}</span><span style={{ ...S.mono }}>−{fmt(sale.discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 800, fontSize: 20 }}>
            <span style={{ color: '#7a7468' }}>SETTLED</span>
            <span style={{ ...S.mono, color: GOLD_DARK }}>{fmt(chargedTotal(sale))}</span>
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
function SettleScreen({ sale, vessel, staffList, discounts, onBack, onConfirm, busy }: {
  sale: Sale; vessel: Vessel; staffList: StaffMember[]; discounts: DiscountEntry[]; onBack: () => void
  onConfirm: (payMethod: string, discountId: string | null, extra?: { employeeId: string; employeeName: string | null; complimentaryReason: string }) => void
  busy: boolean
}) {
  const [method, setMethod] = useState('Cash')
  const [compStaffId, setCompStaffId] = useState('')
  const [compReason, setCompReason] = useState('')
  const [discountId, setDiscountId] = useState('')
  const isCompact = useIsCompact()

  const selectedDiscount = discounts.find(d => d.id === discountId) ?? null
  const discountPreview = selectedDiscount
    ? Math.max(0, Math.min(selectedDiscount.type === 'PERCENT' ? sale.total * (selectedDiscount.value / 100) : selectedDiscount.value, sale.total))
    : 0
  const dueTotal = sale.total - discountPreview

  const compReady = method !== 'Complimentary' || (!!compStaffId && !!compReason.trim())
  const confirm = () => {
    if (method === 'Complimentary') {
      const staff = staffList.find(s => s.id === compStaffId)
      onConfirm(method, discountId || null, { employeeId: compStaffId, employeeName: staff?.fullName ?? null, complimentaryReason: compReason.trim() })
    } else {
      onConfirm(method, discountId || null)
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
                <StaffSelect staffList={staffList} value={compStaffId} onChange={setCompStaffId} placeholder="Given by (staff)…" />
                <input value={compReason} onChange={e => setCompReason(e.target.value)} placeholder="Reason for complimentary…" style={S.input} />
              </div>
            )}

            <div style={{ fontSize: 11, color: '#8a8378', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>DISCOUNT</div>
            <select value={discountId} onChange={e => setDiscountId(e.target.value)} style={{ ...S.input, marginBottom: 26 }}>
              <option value="">No discount</option>
              {discounts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type === 'PERCENT' ? `${d.value}%` : fmt(d.value)})</option>)}
            </select>

            <button onClick={confirm} disabled={busy || !compReady} style={{ width: '100%', padding: 16, borderRadius: 12, fontSize: 16, ...S.goldBtn, opacity: (busy || !compReady) ? 0.6 : 1 }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Take payment {fmt(dueTotal)}
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
              {discountPreview > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0 6px', fontSize: 13, color: '#1f9d5c' }}>
                  <span>Discount ({selectedDiscount?.name})</span><span style={{ ...S.mono }}>−{fmt(discountPreview)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #f1ede2', marginTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#7a7468' }}>TOTAL DUE</span>
                <span style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: GOLD_DARK }}>{fmt(dueTotal)}</span>
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

  const billedToday   = closedToday.reduce((s, b) => s + chargedTotal(b), 0)
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
                    <div style={{ ...S.mono, fontWeight: 700, fontSize: 15, color: '#8a8378' }}>{fmt(chargedTotal(b))}</div>
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
                    <span style={{ ...S.mono, color: '#8a8378' }}>{fmt(chargedTotal(b))}</span>
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
                  <StaffSelect staffList={staffList} value={newBillStaff?.id ?? ''}
                    onChange={id => setNewBillStaff(staffList.find(s => s.id === id) ?? null)} placeholder="Select staff…" />
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

/** Best-guess icon for a POS category from its name. */
function categoryIcon(name: string) {
  const n = name.toLowerCase()
  if (/wine|champagne|prosecco/.test(n)) return Wine
  if (/beer|bir/.test(n)) return Beer
  if (/cocktail|mocktail|spirit|liquor|vodka|gin|rum|whisk/.test(n)) return Martini
  if (/coffee|kopi|tea|teh/.test(n)) return Coffee
  if (/juice|soda|soft|drink|minum/.test(n)) return CupSoda
  if (/water|air/.test(n)) return GlassWater
  if (/cake|dessert|sweet/.test(n)) return CakeSlice
  if (/sandwich|snack|burger/.test(n)) return Sandwich
  if (/soup|noodle|mie|food|makan/.test(n)) return Soup
  return Utensils
}

// Pastel tag colours, picked deterministically per category id.
const PILL_TONES = [
  { bg: '#fdf0e6', fg: '#c2660b' }, { bg: '#e8f6f0', fg: '#1f8a5c' }, { bg: '#fdeef3', fg: '#c03a6b' },
  { bg: '#eaf1fd', fg: '#2f62c9' }, { bg: '#f3eefc', fg: '#7046c4' }, { bg: '#fbf0d6', fg: '#8a7448' },
]
const pillTone = (id: string) => PILL_TONES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % PILL_TONES.length]

// ─── MAIN CASHIER APP ─────────────────────────────────────────────────────────
function CashierApp({ vessel, trip, onBack, branding, locked }: { vessel: Vessel; trip: Trip | null; onBack: () => void; branding: Branding | null; locked: boolean }) {
  const isCompact = useIsCompact()
  const [cartOpen, setCartOpen]   = useState(false)
  const [section, setSection]     = useState('sales')
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
  const [packages, setPackages]   = useState<PackageEntry[]>([])
  const [recipes, setRecipes]     = useState<RecipeEntry[]>([])
  const [posCategories, setPosCategories] = useState<PosCategoryLite[]>([])
  const [discounts, setDiscounts] = useState<DiscountEntry[]>([])
  const [busy, setBusy]           = useState(false)
  const [now, setNow]             = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])

  // Cookie expired or the PIN was reset in the ERP → back to the PIN screen.
  // onBack is a fresh closure each render — read it through a ref so the loaders stay stable.
  const onBackRef = useRef(onBack)
  useEffect(() => { onBackRef.current = onBack })
  const authed = useCallback((r: Response) => { if (r.status === 401) onBackRef.current(); return r.json() }, [])

  const loadMenu = useCallback(() => {
    fetch(`/api/cashier/menu?yachtId=${vessel.id}`).then(authed).then(d => {
      setMenuItems(Array.isArray(d.items) ? d.items : [])
      setPackages(Array.isArray(d.packages) ? d.packages : [])
      setRecipes(Array.isArray(d.recipes) ? d.recipes : [])
      setPosCategories(Array.isArray(d.categories) ? d.categories : [])
      setDiscounts(Array.isArray(d.discounts) ? d.discounts : [])
    })
  }, [vessel.id, authed])

  const loadSales = useCallback(() => {
    fetch(`/api/cashier/sales?yachtId=${vessel.id}`).then(authed).then(d => setSales(Array.isArray(d) ? d : []))
  }, [vessel.id, authed])

  const loadStaff = useCallback(() => {
    fetch(`/api/cashier/staff?yachtId=${vessel.id}`).then(r => r.json()).then(d => setStaffList(Array.isArray(d) ? d : []))
  }, [vessel.id])

  useEffect(() => { loadMenu(); loadSales(); loadStaff() }, [loadMenu, loadSales, loadStaff])

  const catalog = useMemo<CatalogEntry[]>(() => [...recipes, ...menuItems, ...packages], [recipes, menuItems, packages])
  const categoryTabs = useMemo(() =>
    posCategories.filter(c => catalog.some(x => x.categoryId === c.id)),
    [posCategories, catalog])
  const cartTotal   = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const activeSale  = sales.find(s => s.id === activeSaleId) ?? null
  const settleSale  = sales.find(s => s.id === settleSaleId) ?? null
  const openBills   = sales.filter(s => s.status === 'open')

  const NAV = [
    { key: 'sales', icon: ShoppingCart, label: 'Sell' },
    { key: 'bills', icon: ClipboardList, label: 'Tabs', badge: openBills.length },
  ]

  const filtered = useMemo(() =>
    catalog.filter(x =>
      (activeCat === 'All' || x.categoryId === activeCat) &&
      (!search || x.name.toLowerCase().includes(search.toLowerCase()))
    ), [catalog, activeCat, search])

  type CartRef = Pick<CartLine, 'kind' | 'itemId' | 'packageId' | 'recipeId'>
  const cartKey = (c: CartRef) => `${c.kind}:${c.kind === 'package' ? c.packageId : c.kind === 'recipe' ? c.recipeId : c.itemId}`
  const entryKey = (e: CatalogEntry) => `${e.kind}:${e.id}`

  const addToCart = (entry: CatalogEntry) => setCart(prev => {
    const key = entryKey(entry)
    const ex = prev.find(c => cartKey(c) === key)
    if (ex) return prev.map(c => cartKey(c) === key ? { ...c, qty: c.qty + 1 } : c)
    if (entry.kind === 'package') return [...prev, { kind: 'package', itemId: null, packageId: entry.id, name: entry.name, price: entry.price, qty: 1, unit: 'pkg' }]
    if (entry.kind === 'recipe') return [...prev, { kind: 'recipe', itemId: null, packageId: null, recipeId: entry.id, name: entry.name, price: entry.price, qty: 1, unit: 'portion' }]
    return [...prev, { kind: 'item', itemId: entry.id, packageId: null, name: entry.name, price: entry.price, qty: 1, unit: entry.unit }]
  })

  const chgQty = (target: CartRef, d: number) => setCart(prev =>
    prev.map(c => cartKey(c) === cartKey(target) ? { ...c, qty: c.qty + d } : c).filter(c => c.qty > 0)
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

  const closeSale = async (sale: Sale, pm: string, discountId: string | null, extra?: { employeeId: string; employeeName: string | null; complimentaryReason: string }) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/cashier/sales/${sale.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', payMethod: pm, discountId, ...extra }),
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
  if (settleSale) return <SettleScreen sale={settleSale} vessel={vessel} staffList={staffList} discounts={discounts} onBack={() => setSettleSaleId(null)} onConfirm={(pm, discountId, extra) => closeSale(settleSale, pm, discountId, extra)} busy={busy} />

  const itemCount = cart.reduce((s, i) => s + i.qty, 0)
  const chargeDisabled = busy || !cart.length || !compReady || (buyerType === 'staff' ? !selectedStaff : !(selectedGuest || walkInName.trim() || !trip))
  const openTabDisabled = busy || (buyerType === 'staff' ? !selectedStaff : (!selectedGuest && !walkInName.trim()))
  const orderTitle = activeSale
    ? (activeSale.guestName ?? 'Guest')
    : (buyerType === 'staff' ? selectedStaff?.fullName : guestLabel(selectedGuest)) || "Customer's Name"

  const pill = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px 0 6px', borderRadius: 999, background: '#fff', border: '1px solid #f1ede2', fontSize: 13, fontWeight: 600, color: INK, whiteSpace: 'nowrap' as const, fontFamily: "'DM Sans', sans-serif" }
  const pillIcon = { width: 28, height: 28, borderRadius: '50%', background: '#fbf0d6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  const softSelect = { ...S.input, background: '#f7f5f0', border: '1px solid transparent', borderRadius: 12, fontSize: 13, padding: '10px 12px' }

  // ── Order / cart panel — static column on desktop, full-screen drawer on compact.
  const cartPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', background: '#fff' }}>
      {isCompact && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f1ede2', flexShrink: 0 }}>
          <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={14} /> Back to Menu</button>
        </div>
      )}

      {/* Header — order identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', flexShrink: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f7f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {activeSale ? <ClipboardList size={17} color={GOLD_DARK} /> : <Receipt size={17} color="#7a7468" />}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: orderTitle === "Customer's Name" ? '#9b9486' : INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {orderTitle}{(activeSale?.employeeId || (!activeSale && buyerType === 'staff' && selectedStaff)) && <StaffTag />}
          </div>
          <div style={{ fontSize: 11.5, color: '#9b9486', marginTop: 2 }}>
            {activeSale ? `Open tab · opened ${new Date(activeSale.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : (trip?.label ?? 'Walk-in sale')}
          </div>
        </div>
        <button onClick={clearCart} disabled={!cart.length} title="Clear order" style={{ width: 42, height: 42, borderRadius: '50%', background: '#f7f5f0', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: cart.length ? 'pointer' : 'default', flexShrink: 0, opacity: cart.length ? 1 : 0.4 }}>
          <Trash2 size={16} color="#dc6868" />
        </button>
      </div>

      {/* Buyer pickers */}
      {!activeSale && (
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '0 16px 14px', borderBottom: '1px solid #f1ede2', flexShrink: 0 }}>
          <select value={buyerType} onChange={e => { const t = e.target.value as 'guest' | 'staff'; setBuyerType(t); if (t === 'staff') { setSelectedGuest(null); setWalkInName('') } else setSelectedStaff(null) }} style={softSelect}>
            <option value="guest">Guest</option>
            <option value="staff">Staff</option>
          </select>
          {buyerType === 'staff' ? (
            <StaffSelect staffList={staffList} value={selectedStaff?.id ?? ''} onChange={id => setSelectedStaff(staffList.find(s => s.id === id) ?? null)} placeholder="Select staff…" />
          ) : trip ? (
            <select value={selectedGuest?.id ?? selectedGuest?.bookingId ?? ''} onChange={e => setSelectedGuest(trip.guests.find(g => (g.id ?? g.bookingId) === e.target.value) ?? null)} style={softSelect}>
              <option value="">Select guest…</option>
              {trip.guests.map(g => <option key={g.id ?? g.bookingId} value={g.id ?? g.bookingId}>{g.name}</option>)}
            </select>
          ) : (
            <input value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder="Guest / table name…" style={softSelect} />
          )}
        </div>
      )}

      {/* Items */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 16px' }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0 22px', color: '#9b9486', fontSize: 13, borderBottom: '1.5px dashed #ece6d8' }}>
            {activeSale ? `Tab total so far ${fmt(activeSale.total)} — tap items to add` : 'No Item Selected'}
          </div>
        ) : cart.map(item => {
          const mi = item.kind === 'item' ? menuItems.find(m => m.id === item.itemId) : item.kind === 'recipe' ? recipes.find(r => r.id === item.recipeId) : packages.find(p => p.id === item.packageId)
          const atLimit = item.kind !== 'package' && item.qty >= ((mi as MenuItem | RecipeEntry | undefined)?.stock ?? Infinity)
          return (
            <div key={cartKey(item)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1.5px dashed #f1ede2' }}>
              <div style={{ width: 46, height: 46, borderRadius: 10, background: '#f5f3ee', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mi?.imageKey ? <img src={mi.imageKey} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Utensils size={16} color="#cfc8b8" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}{item.kind === 'package' && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: GOLD_DARK }}>PKG</span>}</div>
                <div style={{ fontSize: 11, color: '#9b9486', marginTop: 1 }}><span style={S.mono}>{fmt(item.price)}</span> × {item.qty}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ ...S.mono, fontSize: 12.5, fontWeight: 700, color: INK }}>{fmt(item.qty * item.price)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f7f5f0', borderRadius: 999, padding: 2 }}>
                  <button onClick={() => chgQty(item, -1)} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fff', color: '#dc6868', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={11} /></button>
                  <span style={{ ...S.mono, fontWeight: 700, fontSize: 12, minWidth: 14, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => !atLimit && chgQty(item, +1)} disabled={atLimit} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fff', color: atLimit ? '#cfc8b8' : '#1f9d5c', cursor: atLimit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} /></button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Receipt-style scalloped edge */}
      <div style={{ height: 10, flexShrink: 0, background: 'radial-gradient(circle at 8px 0, #fff 7px, #faf8f3 7.5px) repeat-x', backgroundSize: '16px 10px' }} />

      {/* Totals + payment */}
      <div style={{ background: '#faf8f3', padding: '12px 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7a7468', marginBottom: 4 }}>
          <span>Subtotal</span><span style={S.mono}>{fmt(cartTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#b3ab9c' }}>
          <span>Items</span><span style={S.mono}>{itemCount}</span>
        </div>
        <div style={{ borderTop: '1.5px dashed #e2dccb', margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 800, fontSize: 18 }}>
          <span style={{ color: INK }}>TOTAL</span>
          <span style={{ ...S.mono, color: INK }}>{fmt(cartTotal)}</span>
        </div>

        {!activeSale && cart.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
              {PAY_METHODS.map(({ key, icon: Icon }) => {
                const sel = payMethod === key
                return (
                  <button key={key} onClick={() => setPayMethod(key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 4px', borderRadius: 12, cursor: 'pointer', border: sel ? `1.5px solid ${INK}` : '1px solid #e2dccb', background: '#fff', color: sel ? INK : '#8a8378', fontWeight: 600, fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                    <Icon size={15} /> {key === 'Complimentary' ? 'Comp' : key}
                  </button>
                )
              })}
            </div>
            {payMethod === 'Complimentary' && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buyerType !== 'staff' && (
                  <StaffSelect staffList={staffList} value={compStaff?.id ?? ''} onChange={id => setCompStaff(staffList.find(s => s.id === id) ?? null)} placeholder="Given by (staff)…" />
                )}
                <input value={compReason} onChange={e => setCompReason(e.target.value)} placeholder="Reason for complimentary…" style={S.input} />
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {activeSale ? (
            <>
              <button onClick={() => setSettleSaleId(activeSale.id)} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', borderRadius: 999, background: '#fff', border: `1px solid ${INK}`, color: INK }}>Settle tab</button>
              <button onClick={() => setActiveSaleId(null)} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', borderRadius: 999, background: '#fff' }}>Exit tab</button>
            </>
          ) : (
            <button onClick={openNewBill} disabled={openTabDisabled} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', borderRadius: 999, background: '#fff', border: `1px solid ${INK}`, color: INK, opacity: openTabDisabled ? 0.45 : 1, cursor: openTabDisabled ? 'not-allowed' : 'pointer' }}>
              <ClipboardList size={14} /> Open as Tab
            </button>
          )}
        </div>
      </div>

      {/* Primary action — full-width bar like a "Place Order" button */}
      {activeSale ? (
        <button onClick={addToBill} disabled={!cart.length || busy} style={{ ...S.goldBtn, width: '100%', height: 60, fontSize: 16, flexShrink: 0, borderRadius: 0, opacity: (!cart.length || busy) ? 0.55 : 1, cursor: (!cart.length || busy) ? 'not-allowed' : 'pointer' }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {cart.length ? `Add to Tab · ${fmt(cartTotal)}` : 'Select items to add'}
        </button>
      ) : (
        <button onClick={recordDirectSale} disabled={chargeDisabled} style={{ ...S.goldBtn, width: '100%', height: 60, fontSize: 16, flexShrink: 0, borderRadius: 0, opacity: chargeDisabled ? 0.55 : 1, cursor: chargeDisabled ? 'not-allowed' : 'pointer' }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {cart.length ? `Place Order · ${fmt(cartTotal)}` : 'Place Order'}
        </button>
      )}
    </div>
  )

  return (
    <div style={{ ...S.page, height: '100dvh', overflow: 'hidden', padding: isCompact ? 0 : 16, background: 'radial-gradient(circle at 100% 0%, #f1dca6 0%, #f7f1e3 35%, #f4f3f0 100%)', boxSizing: 'border-box' }}>
      {FONTS}
      <div style={{
        height: '100%', display: 'grid', gridTemplateColumns: section === 'sales' && !isCompact ? '1fr 380px' : '1fr',
        background: '#fff', borderRadius: isCompact ? 0 : 22, overflow: 'hidden', boxShadow: isCompact ? 'none' : '0 10px 40px rgba(26,37,47,0.08)',
      }}>
        {/* ── LEFT: top bar + menu / tabs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: '#fafaf8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: isCompact ? '12px 16px' : '16px 20px', flexShrink: 0 }}>
            <div style={{ ...pill, padding: '0 14px' }}><BrandMark branding={branding} size={20} /></div>
            {!isCompact && <div style={pill}><span style={pillIcon}><CalendarDays size={14} color={GOLD_DARK} /></span>{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>}
            <div style={pill}><span style={pillIcon}><Clock size={14} color={GOLD_DARK} /></span><span style={S.mono}>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div style={{ ...pill, maxWidth: 260 }} title={trip?.label}>
              <span style={pillIcon}><Anchor size={14} color={GOLD_DARK} /></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{vessel.name}{trip && <span style={{ color: '#9b9486', fontWeight: 500 }}> · {trip.label}</span>}</span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #f1ede2', borderRadius: 999, padding: 4 }}>
              {NAV.map(n => {
                const sel = section === n.key
                return (
                  <button key={n.key} onClick={() => { setSection(n.key); setCartOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: sel ? INK : 'transparent', color: sel ? '#fff' : '#7a7468', fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
                    <n.icon size={14} /> {n.label}
                    {!!n.badge && n.badge > 0 && <span style={{ background: sel ? 'rgba(255,255,255,0.25)' : GOLD, color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 20 }}>{n.badge}</span>}
                  </button>
                )
              })}
            </div>
            <button onClick={onBack} style={{ ...pill, padding: '0 6px 0 14px', cursor: 'pointer', color: '#dc4c4c' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc4c4c' }} /> {locked ? 'Lock' : 'Change Vessel'}
              <span style={{ ...pillIcon, background: '#fdecec' }}><Power size={13} color="#dc4c4c" /></span>
            </button>
          </div>

          {section === 'sales' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isCompact ? '0 16px 90px' : '0 20px 20px' }}>
              {activeSale && (
                <div style={{ background: `${GOLD}1c`, border: `1px solid ${GOLD}55`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: GOLD_DARK, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14} /> Adding to tab: {activeSale.guestName ?? 'Guest'}{activeSale.employeeId && <StaffTag />} · {fmt(activeSale.total)}</span>
                  <button onClick={() => setActiveSaleId(null)} style={{ background: 'none', border: 'none', color: '#8a8378', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}><X size={13} /> Exit</button>
                </div>
              )}

              {/* Category cards */}
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
                {(['All', ...categoryTabs.map(c => c.id)] as const).map(catId => {
                  const sel = activeCat === catId
                  const label = catId === 'All' ? 'All Menu' : (categoryTabs.find(c => c.id === catId)?.name ?? '')
                  const count = catId === 'All' ? catalog.length : catalog.filter(x => x.categoryId === catId).length
                  const Icon = catId === 'All' ? LayoutGrid : categoryIcon(label)
                  return (
                    <button key={catId} onClick={() => setActiveCat(catId)} style={{
                      flexShrink: 0, width: 116, textAlign: 'left', padding: 12, borderRadius: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                      background: sel ? '#fdf5e2' : '#fff', border: sel ? `1.5px solid ${GOLD_DARK}` : '1.5px solid #f1ede2', transition: 'all .15s',
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: sel ? GOLD_DARK : '#fbf0d6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                        <Icon size={16} color={sel ? '#fff' : GOLD_DARK} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#9b9486', marginTop: 2 }}>{count} Items</div>
                    </button>
                  )
                })}
              </div>

              {/* Search */}
              <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #f1ede2', borderRadius: 999, padding: '4px 4px 4px 18px', marginBottom: 14 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search something on your mind…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: INK, fontFamily: "'DM Sans', sans-serif", minWidth: 0 }} />
                {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b3ab9c', padding: '0 8px', display: 'flex' }}><X size={15} /></button>}
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#f7f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Search size={16} color="#5f594e" /></span>
              </div>

              {/* Product grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(168px, 100%), 1fr))', gap: 12 }}>
                {filtered.map(item => {
                  const inCart = cart.find(c => cartKey(c) === entryKey(item))
                  const outOfStock = item.kind !== 'package' && item.stock <= 0
                  const atStockLimit = item.kind !== 'package' && !!inCart && inCart.qty >= item.stock
                  const Icon = item.kind === 'package' ? Gift : categoryIcon(item.categoryName)
                  const tone = pillTone(item.categoryId)
                  const tap = () => { if (outOfStock || atStockLimit) return; if (inCart) chgQty(inCart, +1); else addToCart(item) }
                  return (
                    <div key={entryKey(item)} onClick={tap} style={{
                      background: '#fff', borderRadius: 16, padding: 8, cursor: outOfStock ? 'not-allowed' : 'pointer', opacity: outOfStock ? 0.5 : 1,
                      border: inCart ? `1.5px solid ${GOLD_DARK}` : '1.5px solid #f1ede2', transition: 'border-color .15s', fontFamily: "'DM Sans', sans-serif",
                    }}>
                      <div style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 12, background: '#f5f3ee', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.imageKey ? <img src={item.imageKey} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon size={30} color="#d6cfbf" />}
                        {outOfStock && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#fff', color: '#dc6868' }}>Out of stock</span>}
                        {item.kind === 'package' && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', padding: '3px 7px', borderRadius: 999, background: '#fff', color: GOLD_DARK }}>PACKAGE</span>}
                        {inCart && (
                          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 999, padding: 3, boxShadow: '0 2px 8px rgba(26,37,47,0.15)' }}>
                            <button onClick={() => chgQty(inCart, -1)} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#f7f5f0', color: '#dc6868', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={13} /></button>
                            <span style={{ ...S.mono, fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{inCart.qty}</span>
                            <button onClick={() => !atStockLimit && chgQty(inCart, +1)} disabled={atStockLimit} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#f7f5f0', color: atStockLimit ? '#cfc8b8' : '#1f9d5c', cursor: atStockLimit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '10px 4px 4px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{item.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{item.categoryName}</span>
                          <span style={{ ...S.mono, fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{fmt(item.price)}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: outOfStock ? '#dc6868' : '#b3ab9c', marginTop: 4 }}>
                          {item.kind === 'package' ? `${item.components.length} item${item.components.length !== 1 ? 's' : ''} included` : outOfStock ? 'Out of stock' : item.kind === 'recipe' ? `${item.stock} left` : `${item.stock} ${item.unit} left`}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {!filtered.length && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#cfc8b8' }}>No items</div>}
              </div>
            </div>
          )}

          {section === 'bills' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <BillsPage sales={sales} reload={loadSales} setActiveSaleId={setActiveSaleId} vessel={vessel} trip={trip} staffList={staffList} setSection={setSection} settleBill={b => setSettleSaleId(b.id)} createBill={createBillFor} />
            </div>
          )}
        </div>

        {/* ── RIGHT: order panel (desktop) ── */}
        {section === 'sales' && !isCompact && <div style={{ borderLeft: '1px solid #f1ede2', minHeight: 0 }}>{cartPanel}</div>}
      </div>

      {/* Compact: full-screen order drawer + floating cart bar */}
      {section === 'sales' && isCompact && cartOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>{cartPanel}</div>}
      {section === 'sales' && isCompact && !cartOpen && (
        <button onClick={() => setCartOpen(true)} style={{
          ...S.goldBtn, position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14,
          boxShadow: '0 8px 24px rgba(184,137,42,0.4)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeSale ? <><ClipboardList size={14} /> {activeSale.guestName ?? 'Guest'}{activeSale.employeeId && <StaffTag />}</> : <><ShoppingCart size={14} /> Order</>}
            {cart.length > 0 && ` · ${itemCount} items`}
          </span>
          <span style={{ ...S.mono, fontWeight: 800 }}>{fmt(cart.length > 0 ? cartTotal : (activeSale?.total ?? 0))}</span>
        </button>
      )}
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
/** vesselSlug comes from a per-vessel link (/cashier/samara1, or cashier.<domain>/samara1 via middleware). */
export default function Cashier({ vesselSlug }: { vesselSlug?: string }) {
  const branding = useBranding()
  const [vessel, setVessel] = useState<Vessel | null>(null)
  const [trip, setTrip]     = useState<Trip | null | undefined>(undefined) // undefined = not chosen yet

  if (!vessel) return <SignInScreen onSuccess={v => { setVessel(v); setTrip(undefined) }} branding={branding} vesselSlug={vesselSlug} />
  if (trip === undefined) return <TripSelect vessel={vessel} onSelect={t => setTrip(t)} onBack={() => { fetch('/api/cashier/logout', { method: 'POST' }).catch(() => {}); setVessel(null) }} branding={branding} />
  const signOut = () => { fetch('/api/cashier/logout', { method: 'POST' }).catch(() => {}); setVessel(null); setTrip(undefined) }
  return <CashierApp vessel={vessel} trip={trip} onBack={signOut} branding={branding} locked={!!vesselSlug} />
}
