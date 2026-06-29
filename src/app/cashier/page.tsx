// @ts-nocheck
'use client'

import { useState, useMemo } from 'react'

// ─── DATA ─────────────────────────────────────────────────────────────────────
const VESSELS = [
  { id: 'v1', name: 'Samara I',  color: '#38bdf8', bg: '#38bdf811', border: '#38bdf833' },
  { id: 'v2', name: 'Samara II', color: '#34d399', bg: '#34d39911', border: '#34d39933' },
  { id: 'v3', name: 'Mischief',  color: '#f472b6', bg: '#f472b611', border: '#f472b633' },
  { id: 'v4', name: 'Otium',     color: '#fb923c', bg: '#fb923c11', border: '#fb923c33' },
]

const CATEGORIES = ['All', 'Beer', 'Wine', 'Sparkling', 'Cocktail', 'Liquor', 'Soft Drink', 'Other']
const CAT_COLORS = {
  'Beer': '#86efac', 'Wine': '#f87171', 'Sparkling': '#a5f3fc',
  'Cocktail': '#fb923c', 'Liquor': '#c4b5fd', 'Soft Drink': '#38bdf8', 'Other': '#94a3b8',
}

const MENU_ITEMS = [
  { id: 'm1',  name: 'Heineken',             category: 'Beer',       price: 75000,  unit: 'Can',   emoji: '🍺' },
  { id: 'm2',  name: 'Bintang',              category: 'Beer',       price: 65000,  unit: 'Btl',   emoji: '🍺' },
  { id: 'm3',  name: 'Corona',               category: 'Beer',       price: 85000,  unit: 'Btl',   emoji: '🍺' },
  { id: 'm4',  name: 'House Red Wine',       category: 'Wine',       price: 120000, unit: 'Glass', emoji: '🍷' },
  { id: 'm5',  name: 'House White Wine',     category: 'Wine',       price: 120000, unit: 'Glass', emoji: '🥂' },
  { id: 'm6',  name: 'Rosé Wine',            category: 'Wine',       price: 130000, unit: 'Glass', emoji: '🍷' },
  { id: 'm7',  name: 'Prosecco',             category: 'Sparkling',  price: 150000, unit: 'Glass', emoji: '🍾' },
  { id: 'm8',  name: 'Champagne',            category: 'Sparkling',  price: 350000, unit: 'Glass', emoji: '🍾' },
  { id: 'm9',  name: 'Mojito',               category: 'Cocktail',   price: 145000, unit: 'Glass', emoji: '🍹' },
  { id: 'm10', name: 'Margarita',            category: 'Cocktail',   price: 145000, unit: 'Glass', emoji: '🍹' },
  { id: 'm11', name: 'Gin & Tonic',          category: 'Cocktail',   price: 155000, unit: 'Glass', emoji: '🍸' },
  { id: 'm12', name: 'Aperol Spritz',        category: 'Cocktail',   price: 160000, unit: 'Glass', emoji: '🍊' },
  { id: 'm13', name: 'Grey Goose Vodka',     category: 'Liquor',     price: 130000, unit: 'Shot',  emoji: '🥃' },
  { id: 'm14', name: 'Hendricks Gin',        category: 'Liquor',     price: 130000, unit: 'Shot',  emoji: '🥃' },
  { id: 'm15', name: 'Patron Tequila',       category: 'Liquor',     price: 140000, unit: 'Shot',  emoji: '🥃' },
  { id: 'm16', name: 'San Pellegrino',       category: 'Soft Drink', price: 45000,  unit: 'Btl',   emoji: '💧' },
  { id: 'm17', name: 'Coca-Cola',            category: 'Soft Drink', price: 35000,  unit: 'Can',   emoji: '🥤' },
  { id: 'm18', name: 'Juice (Orange/Mango)', category: 'Soft Drink', price: 55000,  unit: 'Glass', emoji: '🧃' },
  { id: 'm19', name: 'Coconut Water',        category: 'Soft Drink', price: 50000,  unit: 'Btl',   emoji: '🥥' },
  { id: 'm20', name: 'Snack Board',          category: 'Other',      price: 180000, unit: 'Pcs',   emoji: '🧀' },
]

const PAY_METHODS = ['Cash', 'Card', 'Transfer', 'Complimentary']

const PIN_KEY = 'samara_cashier_pins'
const DEFAULT_PINS = { v1: '1111', v2: '2222', v3: '3333', v4: '4444' }
const loadPins = () => { try { const v = localStorage.getItem(PIN_KEY); return v ? JSON.parse(v) : DEFAULT_PINS } catch { return DEFAULT_PINS } }

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  page:     { minHeight: '100vh', background: '#080c12', fontFamily: "'DM Sans', 'Inter', sans-serif", color: '#e2e8f0' },
  card:     { background: '#0c1018', border: '1px solid #1a2030', borderRadius: 14 },
  input:    { width: '100%', background: '#080c12', border: '1px solid #1a2030', color: '#e2e8f0', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" },
  mono:     { fontFamily: "'DM Mono', 'Fira Mono', monospace" },
  btnGhost: { background: 'transparent', border: '1px solid #1a2030', color: '#64748b', padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
}

const fmt = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// ─── PIN SCREEN ───────────────────────────────────────────────────────────────
function PinScreen({ vessel, onSuccess, onBack }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const pins = loadPins()

  const dig = (d) => {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    const expected = pins[vessel.id] || DEFAULT_PINS[vessel.id]
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
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet" />
      <button onClick={onBack} style={{ position: 'absolute', top: 20, left: 20, ...S.btnGhost, fontSize: 13 }}>← Back</button>

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚓</div>
        <div style={{ fontWeight: 700, fontSize: 22, color: vessel.color }}>{vessel.name}</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>Enter your PIN</div>
      </div>

      <div style={{ width: '100%', maxWidth: 320, ...S.card, padding: 28, border: `1px solid ${vessel.border}`, transition: 'all .2s' }}>
        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28, animation: shake ? 'shake .5s' : 'none' }}>
          {Array.from({ length: Math.max(4, pin.length + (pin.length < 4 ? 1 : 0)) }).map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? vessel.color : 'transparent', border: `2px solid ${i < pin.length ? vessel.color : '#2d3748'}`, transition: 'all .15s' }} />
          ))}
        </div>

        {error && <div style={{ textAlign: 'center', color: '#f87171', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button key={i} onClick={() => d && dig(d)} style={d ? {
              height: 56, borderRadius: 12, border: '1px solid #1a2030', background: '#0f1520',
              color: d === '⌫' ? '#f87171' : '#e2e8f0', fontSize: 20, fontWeight: 600,
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
function VesselSelect({ onSelect }) {
  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet" />
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 600, color: '#e2e8f0' }}>Samara</div>
        <div style={{ ...S.mono, fontSize: 11, color: '#38bdf8', letterSpacing: '0.25em', marginTop: 5 }}>CASHIER SYSTEM</div>
      </div>
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginBottom: 6, fontWeight: 600, letterSpacing: '0.1em' }}>SELECT VESSEL</div>
        {VESSELS.map(v => (
          <button key={v.id} onClick={() => onSelect(v)} style={{ background: '#0c1018', border: '1px solid #1a2030', borderRadius: 14, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'border-color .15s' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⚓</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f0' }}>{v.name}</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Tap to open cashier</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: v.color }} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── RECEIPT ──────────────────────────────────────────────────────────────────
function ReceiptView({ bill, vessel, onDone }) {
  const total = bill.items.reduce((s, i) => s + i.price * i.qty, 0)
  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, ...S.card, border: '1px solid #34d39933', padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#34d399', marginBottom: 4 }}>
            {bill.payMethod === 'Complimentary' ? 'Complimentary!' : 'Payment Received!'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>⚓ {vessel.name}{bill.guestName ? ` · ${bill.guestName}` : ''}</div>
        </div>

        <div style={{ background: '#080c12', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          {bill.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1a2030', fontSize: 14 }}>
              <span style={{ color: '#e2e8f0' }}>{item.name} <span style={{ color: '#475569' }}>×{item.qty}</span></span>
              <span style={{ ...S.mono, color: '#94a3b8' }}>{fmt(item.price * item.qty)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 800, fontSize: 20 }}>
            <span style={{ color: '#94a3b8' }}>TOTAL</span>
            <span style={{ ...S.mono, color: '#34d399' }}>{fmt(total)}</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>Payment: {bill.payMethod}</div>
        </div>

        <button onClick={onDone} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: `linear-gradient(135deg, ${vessel.color}cc, ${vessel.color})`, color: '#080c12' }}>
          New Order
        </button>
      </div>
    </div>
  )
}

// ─── BILLS PAGE ───────────────────────────────────────────────────────────────
function BillsPage({ bills, setBills, setActiveBillId, vessel, setSection, setReceipt }) {
  const [newBillName, setNewBillName] = useState('')
  const ac = vessel.color
  const openBills = bills.filter(b => b.status === 'open')
  const closedBills = bills.filter(b => b.status === 'closed').slice(0, 10)

  const newBill = () => {
    if (!newBillName.trim()) return
    const b = { id: 'bill-' + Date.now(), guestName: newBillName.trim(), entries: [], total: 0, createdAt: nowTime(), status: 'open' }
    setBills(prev => [b, ...prev])
    setActiveBillId(b.id)
    setNewBillName('')
    setSection('sales')
  }

  const closeBill = (bill, pm) => {
    const allItems = bill.entries.flatMap(e => e.items)
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: 'closed', payMethod: pm } : b))
    setReceipt({ guestName: bill.guestName, items: allItems, total: bill.total, payMethod: pm })
  }

  return (
    <div style={{ overflowY: 'auto', padding: 24, minHeight: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>📋 Bills</div>
        <div style={{ fontSize: 13, color: '#475569' }}>Manage open tabs for {vessel.name}</div>
      </div>

      {/* New bill */}
      <div style={{ ...S.card, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>OPEN NEW BILL</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newBillName} onChange={e => setNewBillName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newBill()} placeholder="Guest name or table (e.g. Mr. Smith, Table 2…)" style={{ ...S.input, flex: 1 }} />
          <button onClick={newBill} disabled={!newBillName.trim()} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: newBillName.trim() ? `linear-gradient(135deg, ${ac}cc, ${ac})` : '#1a2030', color: newBillName.trim() ? '#080c12' : '#334155', whiteSpace: 'nowrap' }}>
            Open Bill
          </button>
        </div>
        {openBills.length >= 5 && <div style={{ marginTop: 8, fontSize: 12, color: '#f59e0b' }}>⚠ Max 5 open bills — close one first</div>}
      </div>

      {/* Open bills */}
      {openBills.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>OPEN BILLS ({openBills.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openBills.map(b => (
              <div key={b.id} style={{ ...S.card, padding: '16px 18px', border: `1px solid ${ac}33` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>{b.guestName}</div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{b.entries.length} round{b.entries.length !== 1 ? 's' : ''} · opened {b.createdAt}</div>
                  </div>
                  <div style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: ac }}>{fmt(b.total)}</div>
                </div>

                {b.entries.length > 0 && (
                  <div style={{ background: '#080c12', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                    {b.entries.flatMap(e => e.items).reduce((acc, i) => {
                      const ex = acc.find(a => a.name === i.name)
                      if (ex) { ex.qty += i.qty; ex.val += i.qty * i.price } else acc.push({ name: i.name, qty: i.qty, val: i.qty * i.price })
                      return acc
                    }, []).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, marginBottom: 3 }}>
                        <span>{item.name} <span style={{ color: '#334155' }}>×{item.qty}</span></span>
                        <span style={S.mono}>{fmt(item.val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setActiveBillId(b.id); setSection('sales') }} style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${ac}44`, background: ac + '11', color: ac, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>+ Add Items</button>
                  {PAY_METHODS.map(pm => (
                    <button key={pm} onClick={() => closeBill(b, pm)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid #34d39944', background: '#34d39911', color: '#34d399', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>✓ {pm}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closed bills today */}
      {closedBills.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>CLOSED TODAY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {closedBills.map(b => (
              <div key={b.id} style={{ ...S.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#64748b' }}>{b.guestName}</div>
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>{b.payMethod} · {b.entries.length} round{b.entries.length !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ ...S.mono, fontWeight: 700, fontSize: 15, color: '#475569' }}>{fmt(b.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {openBills.length === 0 && closedBills.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#334155' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          No bills yet — open one above
        </div>
      )}
    </div>
  )
}

// ─── MAIN CASHIER APP ─────────────────────────────────────────────────────────
function CashierApp({ vessel, onBack }) {
  const [section, setSection]           = useState('sales')
  const [activeCat, setActiveCat]       = useState('All')
  const [search, setSearch]             = useState('')
  const [cart, setCart]                 = useState([])
  const [guestName, setGuestName]       = useState('')
  const [payMethod, setPayMethod]       = useState('Cash')
  const [bills, setBills]               = useState([])
  const [activeBillId, setActiveBillId] = useState(null)
  const [newBillName, setNewBillName]   = useState('')
  const [receipt, setReceipt]           = useState(null)

  const cartTotal  = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const activeBill = bills.find(b => b.id === activeBillId) ?? null
  const openBills  = bills.filter(b => b.status === 'open')
  const ac         = vessel.color

  const NAV = [
    { key: 'sales', icon: '🧾', label: 'Sales' },
    { key: 'bills', icon: '📋', label: 'Bills', badge: openBills.length },
  ]

  const filtered = useMemo(() =>
    MENU_ITEMS.filter(i =>
      (activeCat === 'All' || i.category === activeCat) &&
      (!search || i.name.toLowerCase().includes(search.toLowerCase()))
    ), [activeCat, search])

  const addToCart = (item) => setCart(prev => {
    const ex = prev.find(c => c.id === item.id)
    if (ex) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
    return [...prev, { ...item, qty: 1 }]
  })

  const chgQty = (id, d) => setCart(prev =>
    prev.map(c => c.id === id ? { ...c, qty: c.qty + d } : c).filter(c => c.qty > 0)
  )

  const clearCart = () => { setCart([]); setGuestName(''); setPayMethod('Cash') }

  const newBill = (name) => {
    if (!name.trim()) return
    const b = { id: 'bill-' + Date.now(), guestName: name.trim(), entries: [], total: 0, createdAt: nowTime(), status: 'open' }
    setBills(prev => [b, ...prev])
    setActiveBillId(b.id)
    setNewBillName('')
  }

  const addToBill = () => {
    if (!cart.length || !activeBillId) return
    const items = cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, unit: c.unit }))
    setBills(prev => prev.map(b => b.id !== activeBillId ? b : {
      ...b,
      entries: [...b.entries, { items, subtotal: cartTotal, time: nowTime() }],
      total: b.total + cartTotal,
    }))
    clearCart()
  }

  const closeBill = (bill, pm) => {
    const allItems = bill.entries.flatMap(e => e.items)
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: 'closed', payMethod: pm } : b))
    setActiveBillId(null)
    setReceipt({ guestName: bill.guestName, items: allItems, total: bill.total, payMethod: pm })
  }

  const recordSale = () => {
    if (!cart.length) return
    const items = cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, unit: c.unit }))
    setReceipt({ guestName, items, total: cartTotal, payMethod })
    clearCart()
  }

  if (receipt) return <ReceiptView bill={receipt} vessel={vessel} onDone={() => setReceipt(null)} />

  return (
    <div style={{ ...S.page, height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet" />

      {/* ── LEFT SIDEBAR NAV ── */}
      <div style={{ width: 200, background: '#0c1018', borderRight: '1px solid #1a2030', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0 }}>
        {/* Brand */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: '#e2e8f0' }}>Samara</div>
          <div style={{ ...S.mono, fontSize: 9, color: '#38bdf8', letterSpacing: '0.2em', marginTop: 3 }}>CASHIER</div>
        </div>

        {/* Vessel badge */}
        <div style={{ margin: '0 14px 20px', background: vessel.bg, border: `1px solid ${vessel.border}`, borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: ac, fontWeight: 700, letterSpacing: '0.08em' }}>⚓ {vessel.name}</div>
          <button onClick={onBack} style={{ marginTop: 5, fontSize: 11, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Change vessel →</button>
        </div>

        {/* Nav items */}
        {NAV.map(n => (
          <button key={n.key} onClick={() => setSection(n.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: section === n.key ? ac + '10' : 'transparent', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: section === n.key ? `3px solid ${ac}` : '3px solid transparent', cursor: 'pointer', color: section === n.key ? ac : '#64748b', fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif", transition: 'all .15s', width: '100%', textAlign: 'left' }}>
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge > 0 && <span style={{ background: '#f59e0b', color: '#080c12', fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>{n.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── MAIN: Sales POS ── */}
      {section === 'sales' && (
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 320px' }}>

          {/* Menu panel */}
          <div style={{ overflowY: 'auto', padding: 20, borderRight: '1px solid #1a2030' }}>
            {activeBill && (
              <div style={{ background: ac + '15', border: `1px solid ${ac}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: ac, fontWeight: 700 }}>📋 Bill: {activeBill.guestName} · {fmt(activeBill.total)}</span>
                <button onClick={() => setActiveBillId(null)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13 }}>✕ Exit</button>
              </div>
            )}

            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…" style={{ ...S.input, marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {CATEGORIES.map(cat => {
                const sel = activeCat === cat
                const color = CAT_COLORS[cat] || '#64748b'
                return (
                  <button key={cat} onClick={() => setActiveCat(cat)} style={{ padding: '5px 13px', borderRadius: 7, cursor: 'pointer', border: 'none', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", background: sel ? (cat === 'All' ? ac : color) : '#1a2030', color: sel ? '#080c12' : '#64748b' }}>
                    {cat}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {filtered.map(item => {
                const inCart = cart.find(c => c.id === item.id)
                const color = CAT_COLORS[item.category] || '#94a3b8'
                return (
                  <button key={item.id} onClick={() => addToCart(item)} style={{ background: inCart ? '#34d39910' : '#0c1018', border: inCart ? '2px solid #34d399' : '1px solid #1a2030', borderRadius: 12, padding: '14px 12px', cursor: 'pointer', textAlign: 'left', position: 'relative', fontFamily: "'DM Sans', sans-serif", transition: 'all .15s' }}>
                    {inCart && <span style={{ position: 'absolute', top: 8, right: 8, background: '#34d399', color: '#080c12', fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>{inCart.qty}</span>}
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{item.emoji}</div>
                    <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.category}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0', marginBottom: 6, lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ ...S.mono, fontSize: 12, color: '#34d399', fontWeight: 600 }}>{fmt(item.price)}</div>
                    <div style={{ fontSize: 11, color: '#334155', marginTop: 3 }}>{item.unit}</div>
                  </button>
                )
              })}
              {!filtered.length && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#334155' }}><div style={{ fontSize: 32, marginBottom: 10 }}>🍾</div>No items</div>}
            </div>
          </div>

          {/* Cart sidebar */}
          <div style={{ background: '#0c1018', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', marginBottom: 14 }}>
                {activeBill ? <span style={{ color: ac }}>📋 {activeBill.guestName}</span> : '🛒 Order'}
              </div>

              {/* Open new bill shortcut */}
              {!activeBill && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>OPEN BILL (optional)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={newBillName} onChange={e => setNewBillName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newBill(newBillName)} placeholder="Guest / table…" style={{ ...S.input, flex: 1, fontSize: 12, padding: '7px 10px' }} />
                    <button onClick={() => newBill(newBillName)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: ac, color: '#080c12', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>+</button>
                  </div>
                </div>
              )}

              {/* Guest note */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{activeBill ? 'NOTE' : 'GUEST NAME'} (optional)</div>
                <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder={activeBill ? 'e.g. Day 2…' : 'e.g. Mr. Smith…'} style={S.input} />
              </div>

              {/* Cart items */}
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: '#334155', fontSize: 13, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🫙</div>
                  Tap items to add
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 14 }}>
                  {cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid #1a2030' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{item.name}</div>
                        <div style={{ ...S.mono, fontSize: 11, color: '#34d399' }}>{fmt(item.qty * item.price)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button onClick={() => chgQty(item.id, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #1a2030', background: '#080c12', color: '#f472b6', cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>−</button>
                        <span style={{ ...S.mono, fontWeight: 700, fontSize: 14, minWidth: 18, textAlign: 'center' }}>{item.qty}</span>
                        <button onClick={() => chgQty(item.id, +1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #1a2030', background: '#080c12', color: '#34d399', cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              {cart.length > 0 && (
                <div style={{ background: '#080c12', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 20 }}>
                    <span style={{ color: '#94a3b8' }}>TOTAL</span>
                    <span style={{ ...S.mono, color: '#34d399' }}>{fmt(cartTotal)}</span>
                  </div>
                </div>
              )}

              {/* Payment (direct only) */}
              {!activeBill && cart.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>PAYMENT</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {PAY_METHODS.map(m => (
                      <button key={m} onClick={() => setPayMethod(m)} style={{ padding: '8px', borderRadius: 8, cursor: 'pointer', border: payMethod === m ? `2px solid ${ac}` : '1px solid #1a2030', background: payMethod === m ? ac + '11' : '#080c12', color: payMethod === m ? ac : '#64748b', fontWeight: 600, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                        {m === 'Cash' ? '💵' : m === 'Card' ? '💳' : m === 'Transfer' ? '📲' : '🎁'} {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                {activeBill ? (
                  <>
                    <button onClick={addToBill} disabled={!cart.length} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", background: cart.length ? `linear-gradient(135deg, ${ac}cc, ${ac})` : '#1a2030', color: cart.length ? '#080c12' : '#334155' }}>
                      {cart.length ? `+ Add to Bill (${fmt(cartTotal)})` : 'Select items to add'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PAY_METHODS.map(pm => (
                        <button key={pm} onClick={() => closeBill(activeBill, pm)} style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: '1px solid #34d39944', background: '#34d39911', color: '#34d399', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>✓ {pm}</button>
                      ))}
                    </div>
                    <button onClick={() => setActiveBillId(null)} style={{ ...S.btnGhost, width: '100%', fontSize: 12 }}>Exit Bill Mode</button>
                  </>
                ) : (
                  <>
                    <button onClick={recordSale} disabled={!cart.length} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 15, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", background: cart.length ? 'linear-gradient(135deg,#34d399cc,#34d399)' : '#1a2030', color: cart.length ? '#080c12' : '#334155' }}>
                      {cart.length ? `✓ Charge ${fmt(cartTotal)}` : 'Select items'}
                    </button>
                    {cart.length > 0 && <button onClick={clearCart} style={{ ...S.btnGhost, width: '100%', fontSize: 12, color: '#f87171', borderColor: '#f8717133' }}>Clear</button>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN: Bills page ── */}
      {section === 'bills' && (
        <BillsPage bills={bills} setBills={setBills} setActiveBillId={setActiveBillId} vessel={vessel} setSection={setSection} setReceipt={setReceipt} />
      )}
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CashierPage() {
  const [vessel, setVessel] = useState(null)
  const [authed, setAuthed] = useState(false)

  if (!vessel) return <VesselSelect onSelect={v => { setVessel(v); setAuthed(false) }} />
  if (!authed) return <PinScreen vessel={vessel} onSuccess={() => setAuthed(true)} onBack={() => setVessel(null)} />
  return <CashierApp vessel={vessel} onBack={() => { setVessel(null); setAuthed(false) }} />
}
