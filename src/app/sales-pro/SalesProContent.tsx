'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Anchor, Users, Compass, Award, Check, LogOut, Menu as MenuIcon, X,
  Mail, Phone, MessageCircle, Building2, Ship, MapPin,
} from 'lucide-react'

const GOLD = '#bdac7e'
const GOLD_DARK = '#a89860'
const INK = '#0a0f0e'
const PANEL = '#101615'

// ── Presentation content — edit freely, this is the only place copy/numbers live. ──
const STATS = [
  { label: 'Tahun Beroperasi', value: '10+' },
  { label: 'Armada Yacht', value: '4' },
  { label: 'Destinasi Utama', value: '4+' },
  { label: 'Tamu Terlayani', value: '1000+' },
]

const HIGHLIGHTS = [
  { icon: Ship, title: 'Armada Terawat', desc: 'Setiap yacht dirawat dan diperiksa rutin untuk kenyamanan & keamanan tamu.' },
  { icon: Compass, title: 'Rute Eksklusif', desc: 'Menjangkau destinasi liveaboard terbaik Indonesia — Komodo, Raja Ampat, Banda, Spice Islands.' },
  { icon: Users, title: 'Kru Profesional', desc: 'Kapten, chef, dan kru berpengalaman yang melayani penuh dari keberangkatan hingga kepulangan.' },
  { icon: Award, title: 'Pengalaman Premium', desc: 'Dari day charter hingga private full-charter multi-hari, disesuaikan kebutuhan tamu.' },
]

const FLEET = [
  { name: 'Samara 1', image: '/agent-portal/samara1.webp', tagline: 'Klasik dan elegan — cocok untuk keluarga maupun grup kecil.' },
  { name: 'Samara 2', image: '/agent-portal/samara-II.webp', tagline: 'Desain modern dengan ruang bersantai yang luas di atas air.' },
  { name: 'Mischief', image: '/agent-portal/mischief-yacht-komodo.jpg', tagline: 'Petualangan Komodo dalam balutan gaya dan kenyamanan.' },
  { name: 'Otium', image: '/agent-portal/lounge-otium.webp', tagline: 'Kemewahan tenang untuk private charter yang berkesan.' },
]

const DESTINATIONS = ['Komodo', 'Raja Ampat', 'Kepulauan Banda', 'Spice Islands']

const PACKAGES = [
  { name: 'Day Charter', duration: '1 Hari', desc: 'Pengalaman singkat namun berkesan di perairan pilihan.', points: ['Makan siang & minuman di kapal', 'Snorkeling di spot terbaik', 'Kru & kapten berpengalaman'] },
  { name: 'Weekend Getaway', duration: '3 Hari 2 Malam', desc: 'Liburan singkat lepas dari rutinitas, tetap penuh eksplorasi.', points: ['Kabin pribadi ber-AC', 'Full board meals', 'Aktivitas air & island stop'] },
  { name: 'Komodo Expedition', duration: '5 Hari 4 Malam', desc: 'Jelajahi Taman Nasional Komodo dari sisi terbaiknya.', points: ['Kunjungan Pulau Komodo & Padar', 'Diving/snorkeling spot ikonik', 'Itinerary fleksibel'] },
  { name: 'Raja Ampat Explorer', duration: '7 Hari 6 Malam', desc: 'Ekspedisi panjang menyusuri surga bahari Raja Ampat.', points: ['Rute liveaboard eksklusif', 'Guide lokal berpengalaman', 'Private charter tersedia'] },
]

const CONTACT = {
  phone: '+62 812-0000-0000',
  whatsapp: '628120000000',
  email: 'sales@samarayachting.com',
}

const MENU = [
  { key: 'profile', label: 'Company Profile' },
  { key: 'fleet', label: 'Fleet & Yachts' },
  { key: 'packages', label: 'Packages & Pricing' },
  { key: 'gallery', label: 'Gallery & Contact' },
] as const

type MenuKey = typeof MENU[number]['key']

function SectionHeading({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>{eyebrow}</div>
      <h2 style={{ fontSize: 32, fontWeight: 700, color: '#f4f1ea', margin: 0, fontFamily: "'Playfair Display', serif" }}>{title}</h2>
      {desc && <p style={{ color: '#9aa39e', fontSize: 15, marginTop: 12, maxWidth: 640, lineHeight: 1.6 }}>{desc}</p>}
    </div>
  )
}

function CompanyProfile() {
  return (
    <div>
      <div
        style={{
          position: 'relative', borderRadius: 24, overflow: 'hidden', minHeight: 420,
          display: 'flex', alignItems: 'flex-end', padding: '48px 40px',
          backgroundImage: `linear-gradient(180deg, rgba(10,15,14,0.15) 0%, rgba(10,15,14,0.92) 100%), url(/agent-portal/samara1.webp)`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 14 }}>
            Samara Yachting
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 700, color: '#f4f1ea', margin: 0, maxWidth: 640, lineHeight: 1.15, fontFamily: "'Playfair Display', serif" }}>
            Liveaboard charter premium di jantung perairan terindah Indonesia
          </h1>
          <p style={{ color: '#c9cfca', fontSize: 15, marginTop: 18, maxWidth: 560, lineHeight: 1.7 }}>
            Samara Yachting menghadirkan pengalaman berlayar mewah dan personal — dari day charter santai
            hingga ekspedisi multi-hari ke destinasi paling ikonik di Nusantara.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginTop: 28 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: PANEL, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '22px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: GOLD, fontFamily: "'Playfair Display', serif" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#8b9490', marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 56 }}>
        <SectionHeading eyebrow="Mengapa Samara" title="Dirancang untuk pengalaman tak terlupakan" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {HIGHLIGHTS.map(h => (
            <div key={h.title} style={{ background: PANEL, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(189,172,126,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <h.icon size={19} color={GOLD} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f4f1ea', marginBottom: 8 }}>{h.title}</div>
              <div style={{ fontSize: 13.5, color: '#9aa39e', lineHeight: 1.6 }}>{h.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 56 }}>
        <SectionHeading eyebrow="Rute" title="Destinasi yang kami layani" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {DESTINATIONS.map(d => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, background: PANEL, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '10px 18px' }}>
              <MapPin size={14} color={GOLD} />
              <span style={{ fontSize: 13.5, color: '#e5e2d8', fontWeight: 500 }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Fleet() {
  return (
    <div>
      <SectionHeading eyebrow="Armada Kami" title="Fleet & Yachts" desc="Empat yacht dengan karakter berbeda, siap disesuaikan dengan kebutuhan dan gaya perjalanan tamu." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
        {FLEET.map(y => (
          <div key={y.name} style={{ background: PANEL, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ height: 190, backgroundImage: `url(${y.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Anchor size={15} color={GOLD} />
                <div style={{ fontSize: 17, fontWeight: 700, color: '#f4f1ea' }}>{y.name}</div>
              </div>
              <div style={{ fontSize: 13.5, color: '#9aa39e', lineHeight: 1.6 }}>{y.tagline}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Packages() {
  return (
    <div>
      <SectionHeading eyebrow="Penawaran" title="Packages & Pricing" desc="Setiap paket dapat disesuaikan — hubungi sales untuk penawaran harga sesuai jumlah tamu, tanggal, dan rute." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        {PACKAGES.map(p => (
          <div key={p.name} style={{ background: PANEL, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{p.duration}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#f4f1ea', margin: '8px 0 10px' }}>{p.name}</div>
            <div style={{ fontSize: 13.5, color: '#9aa39e', lineHeight: 1.6, marginBottom: 16 }}>{p.desc}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
              {p.points.map(pt => (
                <div key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Check size={14} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#c9cfca' }}>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GalleryContact() {
  const waHref = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Halo, saya tertarik dengan penawaran charter Samara Yachting.')}`
  return (
    <div>
      <SectionHeading eyebrow="Galeri" title="Gallery & Contact" desc="Cuplikan armada dan destinasi kami — hubungi tim sales untuk media kit lengkap dan penawaran khusus." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 48 }}>
        {FLEET.map(y => (
          <div key={y.name} style={{ height: 170, borderRadius: 14, backgroundImage: `url(${y.image})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid rgba(255,255,255,0.08)' }} />
        ))}
      </div>

      <div style={{ background: PANEL, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`} style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(189,172,126,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Phone size={18} color={GOLD} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b9490' }}>Telepon</div>
            <div style={{ fontSize: 14, color: '#f4f1ea', fontWeight: 600 }}>{CONTACT.phone}</div>
          </div>
        </a>
        <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(189,172,126,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={18} color={GOLD} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b9490' }}>WhatsApp</div>
            <div style={{ fontSize: 14, color: '#f4f1ea', fontWeight: 600 }}>Chat Sales</div>
          </div>
        </a>
        <a href={`mailto:${CONTACT.email}`} style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(189,172,126,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mail size={18} color={GOLD} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b9490' }}>Email</div>
            <div style={{ fontSize: 14, color: '#f4f1ea', fontWeight: 600 }}>{CONTACT.email}</div>
          </div>
        </a>
      </div>
    </div>
  )
}

export default function SalesProContent() {
  const router = useRouter()
  const [active, setActive] = useState<MenuKey>('profile')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  async function logout() {
    await fetch('/api/sales-pro/logout', { method: 'POST' })
    router.refresh()
  }

  function selectMenu(key: MenuKey) {
    setActive(key)
    setMobileNavOpen(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20, background: 'rgba(10,15,14,0.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={20} color={GOLD} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f4f1ea' }}>Samara Yachting</span>
          </div>

          <nav style={{ display: 'flex', gap: 4 }} className="sales-pro-desktop-nav">
            {MENU.map(m => (
              <button
                key={m.key}
                onClick={() => selectMenu(m.key)}
                style={{
                  padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: active === m.key ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_DARK} 100%)` : 'transparent',
                  color: active === m.key ? INK : '#c9cfca', fontSize: 13.5, fontWeight: 600,
                  transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={logout}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9aa39e', borderRadius: 999, padding: '8px 14px', fontSize: 12.5, cursor: 'pointer' }}
            >
              <LogOut size={13} /> Keluar
            </button>
            <button
              onClick={() => setMobileNavOpen(v => !v)}
              className="sales-pro-mobile-toggle"
              style={{ display: 'none', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#f4f1ea', borderRadius: 10, padding: 8, cursor: 'pointer' }}
            >
              {mobileNavOpen ? <X size={16} /> : <MenuIcon size={16} />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="sales-pro-mobile-nav" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 24px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {MENU.map(m => (
              <button
                key={m.key}
                onClick={() => selectMenu(m.key)}
                style={{
                  textAlign: 'left', padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: active === m.key ? 'rgba(189,172,126,0.15)' : 'transparent',
                  color: active === m.key ? GOLD : '#c9cfca', fontSize: 14, fontWeight: 600,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '44px 24px 80px' }}>
        {active === 'profile' && <CompanyProfile />}
        {active === 'fleet' && <Fleet />}
        {active === 'packages' && <Packages />}
        {active === 'gallery' && <GalleryContact />}
      </main>

      <style>{`
        @media (max-width: 820px) {
          .sales-pro-desktop-nav { display: none !important; }
          .sales-pro-mobile-toggle { display: flex !important; align-items: center; justify-content: center; }
        }
      `}</style>
    </div>
  )
}
