'use client'

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  Lock, ChevronLeft, ChevronRight, ChevronDown, FileText, MapPin, FileStack,
  CalendarDays, LogOut, X, FolderOpen, Play, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEffectiveBookingStatus } from '@/lib/booking-status'

const GOLD = '#bdac7e'
const GOLD_DARK = '#a8956a'

const SAMARA_LOGO = '/agent-portal/logoo.png'

// react-pageflip touches browser globals (document/HTMLElement) at module-evaluation time,
// which throws during Next.js's server-side render pass on a self-hosted (non-edge) Node
// server — loaded client-only to avoid that.
const HTMLFlipBook = dynamic(() => import('react-pageflip'), { ssr: false })

// Shown when a yacht has no `image` set in the ERP yet — decorative background only.
const FALLBACK_PHOTO_A = '/agent-portal/samara1.webp'
const FALLBACK_PHOTO_B = '/agent-portal/lounge-otium.webp'

type Step = 'login' | 'yacht' | 'media' | 'calendar'

interface YachtOption {
  id: string
  name: string
  tagline: string | null
  type: string | null
  capacity: number
  cabinCount: number
  length: number | null
  description: string | null
  image: string | null
}

type MediaFileType = 'image' | 'document' | 'video'

interface MediaCategoryRecord { id: string; name: string }
interface MediaFolderRecord { id: string; name: string; parentId: string | null; categoryId: string; yachtId: string | null }

interface MediaFile {
  id: string
  yachtId: string | null
  categoryId: string
  type: MediaFileType
  name: string
  url: string
  sizeBytes: number | null
  mimeType: string | null
  folderId: string | null
}

interface PromoRecord {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  ctaLabel: string | null
  ctaUrl: string | null
}

function formatSize(bytes: number | null) {
  if (bytes == null) return null
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Converts a YouTube/Vimeo watch link to its embeddable form; falls back to the raw URL.
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
      if (u.pathname.startsWith('/embed/')) return url
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1)
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop()
      if (id) return `https://player.vimeo.com/video/${id}`
    }
  } catch { /* not a parseable URL, fall through */ }
  return url
}

const MONTH_NAMES_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function firstWeekday(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).getDay()
}

// 12-month rolling window starting this month, since real bookings aren't confined to a
// single calendar year the way the old preview's fixed CALENDAR_YEAR grid assumed.
function monthsAhead(count: number) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return { year: d.getFullYear(), monthIndex: d.getMonth(), label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
  })
}

function formatDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start), e = new Date(end)
  return `${s.toLocaleDateString('en-US', opts)}–${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

type DayStatus = 'available' | 'onhold' | 'pending' | 'booked'

const DAY_STATUS_STYLE: Record<DayStatus, string> = {
  available: 'bg-white border border-neutral-200 text-neutral-500',
  onhold: 'bg-emerald-500 text-white',
  pending: 'bg-amber-400 text-white',
  booked: 'bg-red-500 text-white',
}

interface CalendarBooking { id: string; startDate: string; endDate: string; status: string; tripType: string }
interface OpenTripCabinStatus { id: string; name: string; bookingStatus: string | null }
interface CalendarOpenTrip {
  id: string; title: string; destination: string; startDate: string; endDate: string
  status: string; spotsAvailable: number; maxCapacity: number; cabinStatuses: OpenTripCabinStatus[]
}

function dayStatusFromBookingStatus(status: string): DayStatus {
  if (status === 'on_hold') return 'onhold'
  if (status === 'pending') return 'pending'
  return 'booked' // confirmed, partially_paid, fully_paid, completed, on_trip, pending_refund
}

function statusForDate(bookings: CalendarBooking[], date: Date): DayStatus {
  for (const b of bookings) {
    const start = new Date(b.startDate.split('T')[0] + 'T00:00:00')
    const end = new Date(b.endDate.split('T')[0] + 'T00:00:00')
    if (date >= start && date < end) {
      return dayStatusFromBookingStatus(getEffectiveBookingStatus(b.status, b.startDate, b.endDate))
    }
  }
  return 'available'
}

function FullScreenLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function PromoPopup({ promo, onClose }: { promo: PromoRecord; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl overflow-hidden max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        {promo.imageUrl && (
          <div className="aspect-[16/9] bg-neutral-100">
            <img src={promo.imageUrl} alt={promo.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold tracking-tight" style={{ fontFamily: "'Merriweather', serif" }}>{promo.title}</h3>
            <button onClick={onClose} aria-label="Close" className="text-muted-foreground/70 hover:text-foreground transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          {promo.description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{promo.description}</p>}
          <div className="flex items-center gap-4 mt-5">
            {promo.ctaLabel && promo.ctaUrl && (
              <a
                href={promo.ctaUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-sm font-semibold text-white px-5 py-2.5 rounded-full transition-colors"
                style={{ background: GOLD }}
                onMouseEnter={e => (e.currentTarget.style.background = GOLD_DARK)}
                onMouseLeave={e => (e.currentTarget.style.background = GOLD)}
                onClick={onClose}
              >
                {promo.ctaLabel}
              </a>
            )}
            <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AgentPortalPage() {
  const [step, setStep] = useState<Step>('login')
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [yachtId, setYachtId] = useState<string | null>(null)
  const [yachts, setYachts] = useState<YachtOption[]>([])
  const [yachtsLoading, setYachtsLoading] = useState(false)
  const [agentName, setAgentName] = useState('')
  const [generalPromo, setGeneralPromo] = useState<PromoRecord | null>(null)
  const [yachtPromo, setYachtPromo] = useState<PromoRecord | null>(null)

  const selectedYacht = useMemo(() => yachts.find(y => y.id === yachtId) ?? null, [yachts, yachtId])

  const loadYachts = useCallback(async () => {
    setYachtsLoading(true)
    try {
      const res = await fetch('/api/agent-portal/yachts')
      if (res.ok) setYachts(await res.json())
    } catch (e) { console.error(e) }
    finally { setYachtsLoading(false) }
  }, [])

  // Fired right when an agent lands on the yacht screen (fresh login or session bootstrap
  // on refresh) — shows the fleet-wide "General" promo popup, if one's currently active.
  const loadGeneralPromo = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-portal/promos')
      setGeneralPromo(res.ok ? await res.json() : null)
    } catch (e) { console.error(e) }
  }, [])

  // Session bootstrap: if a valid cookie already exists (page refresh), skip straight to
  // the yacht screen instead of forcing a re-login.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agent-portal/session')
        const data = await res.json().catch(() => ({ valid: false }))
        if (data.valid) {
          setAgentName(data.agentName ?? '')
          await loadYachts()
          setStep('yacht')
          loadGeneralPromo()
        }
      } finally {
        setCheckingSession(false)
      }
    })()
  }, [loadYachts, loadGeneralPromo])

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setLoginError('Enter your email and the password provided to you')
      return
    }
    setLoggingIn(true)
    setLoginError('')
    try {
      const res = await fetch('/api/agent-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoginError(data.error ?? 'Incorrect email or password')
        return
      }
      setAgentName(data.agentName ?? '')
      setPassword('')
      await loadYachts()
      setStep('yacht')
      loadGeneralPromo()
    } finally {
      setLoggingIn(false)
    }
  }

  function logout() {
    fetch('/api/agent-portal/logout', { method: 'POST' }).catch(() => {})
    setEmail('')
    setPassword('')
    setLoginError('')
    setYachtId(null)
    setYachts([])
    setAgentName('')
    setGeneralPromo(null)
    setYachtPromo(null)
    setStep('login')
  }

  let body: React.ReactNode
  if (checkingSession) {
    body = <FullScreenLoader />
  } else if (step === 'login') {
    body = (
      <LoginScreen
        email={email} setEmail={setEmail}
        password={password} setPassword={setPassword}
        error={loginError} onSubmit={handleLogin}
      />
    )
  } else if (step === 'yacht') {
    body = (
      <YachtScreen
        yachts={yachts}
        loading={yachtsLoading}
        agentName={agentName}
        onSelect={(id, target) => {
          setYachtId(id)
          setStep(target)
          fetch(`/api/agent-portal/promos?yachtId=${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(setYachtPromo)
            .catch(() => {})
        }}
        onLogout={logout}
      />
    )
  } else {
    body = (
      <AgentPortalContentScreen
        step={step} setStep={setStep} logout={logout} agentName={agentName}
        yachts={yachts} selectedYacht={selectedYacht}
        onSelectYacht={id => {
          setYachtId(id)
          fetch(`/api/agent-portal/promos?yachtId=${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(setYachtPromo)
            .catch(() => {})
        }}
      />
    )
  }

  return (
    <ContentProtection>
      {body}
      {generalPromo && <PromoPopup promo={generalPromo} onClose={() => setGeneralPromo(null)} />}
      {yachtPromo && <PromoPopup promo={yachtPromo} onClose={() => setYachtPromo(null)} />}
    </ContentProtection>
  )
}

// Deters casual copying — not real protection (nothing stops a phone camera or OS-level
// screenshot tool), but blocks right-click/text-select and blurs the screen when the tab/
// window loses focus (e.g. alt-tabbing to a screenshot tool) as a speed bump for the common case.
function ContentProtection({ children }: { children: React.ReactNode }) {
  const [obscured, setObscured] = useState(false)

  useEffect(() => {
    const obscure = () => setObscured(true)
    const reveal = () => setObscured(false)
    const onVisibilityChange = () => { if (document.hidden) obscure(); else reveal() }
    window.addEventListener('blur', obscure)
    window.addEventListener('focus', reveal)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('blur', obscure)
      window.removeEventListener('focus', reveal)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <div
      onContextMenu={e => e.preventDefault()}
      className={cn('select-none transition-[filter] duration-150', obscured && 'blur-2xl')}
      style={{ WebkitUserSelect: 'none' }}
    >
      {children}
    </div>
  )
}

function AgentPortalContentScreen({ step, setStep, logout, agentName, yachts, selectedYacht, onSelectYacht }: {
  step: Step; setStep: (s: Step) => void; logout: () => void; agentName: string
  yachts: YachtOption[]; selectedYacht: YachtOption | null; onSelectYacht: (id: string) => void
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-neutral-950 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 grid grid-cols-3 items-center">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setStep('yacht')}
              aria-label="Back to yacht selection"
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 hover:bg-white/90 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-black" />
            </button>
            <img src={SAMARA_LOGO} alt="Samara" className="h-5 w-auto object-contain shrink-0 brightness-0 invert" />
          </div>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setStep('media')}
              className={cn('text-xs transition-colors', step === 'media' ? 'text-white font-medium' : 'text-white/50 hover:text-white')}
            >
              Media Kit
            </button>
            <button
              onClick={() => setStep('calendar')}
              className={cn('text-xs transition-colors', step === 'calendar' ? 'text-white font-medium' : 'text-white/50 hover:text-white')}
            >
              Yacht Calendar
            </button>
          </div>

          <div className="flex items-center justify-end gap-3">
            {agentName && <span className="text-xs text-white/50 hidden sm:inline truncate max-w-[140px]">Hi, {agentName}</span>}
            <button onClick={logout} className="text-xs text-white/50 hover:text-white transition-colors shrink-0">
              Log out
            </button>
          </div>
        </div>
      </div>

      {yachts.length > 1 && (
        <div className="bg-white border-b sticky top-16 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center">
            <YachtSwitcher yachts={yachts} selectedYacht={selectedYacht} onSelect={onSelectYacht} />
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {step === 'media' && selectedYacht && (
          <MediaKitScreen yacht={selectedYacht} />
        )}

        {step === 'calendar' && selectedYacht && (
          <CalendarScreen yacht={selectedYacht} />
        )}
      </div>
    </div>
  )
}

// Lets an agent switch yachts from inside Media Kit/Calendar without going all the way
// back to the full-screen YachtScreen picker — just a small dropdown under the nav bar.
function YachtSwitcher({ yachts, selectedYacht, onSelect }: {
  yachts: YachtOption[]; selectedYacht: YachtOption | null; onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-black transition-colors py-1"
      >
        <span className="text-neutral-400 font-normal">Yacht:</span>
        {selectedYacht?.name ?? 'Select a yacht'}
        <ChevronDown className={cn('h-3.5 w-3.5 text-neutral-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 max-h-72 overflow-y-auto rounded-lg border bg-white shadow-lg z-30 py-1">
          {yachts.map(y => (
            <button
              key={y.id}
              onClick={() => { onSelect(y.id); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs transition-colors',
                y.id === selectedYacht?.id ? 'font-medium text-black bg-neutral-50' : 'text-neutral-600 hover:bg-neutral-50'
              )}
              style={y.id === selectedYacht?.id ? { color: GOLD_DARK } : undefined}
            >
              {y.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LoginScreen({ email, setEmail, password, setPassword, error, onSubmit }: {
  email: string; setEmail: (v: string) => void
  password: string; setPassword: (v: string) => void; error: string; onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <img src={FALLBACK_PHOTO_A} alt="Samara fleet" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/65" />

      <div className="relative w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl p-8">
        {/* brightness-0 (no invert) — the source logo's wordmark is white, which
            disappears against this white card; forcing it to a black silhouette
            keeps it visible without needing a separate logo asset. */}
        <img src={SAMARA_LOGO} alt="Samara" className="h-8 w-auto object-contain mx-auto mb-8 brightness-0" />

        <div className="mx-auto w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${GOLD}22` }}>
          <Lock className="h-5 w-5" style={{ color: GOLD_DARK }} />
        </div>
        <h1 className="text-xl font-bold mt-4 text-center">Agent Access</h1>
        <p className="text-muted-foreground text-sm mt-1.5 text-center">Log in with the email and password provided to you.</p>

        <div className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
            <input
              type="email"
              autoFocus
              className="w-full h-12 px-3.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#bdac7e]/40 focus:border-[#bdac7e] transition-shadow"
              placeholder="you@agency.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
            <input
              type="password"
              className="w-full h-12 px-3.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#bdac7e]/40 focus:border-[#bdac7e] transition-shadow"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <button
          onClick={onSubmit}
          className="mt-6 w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{ background: GOLD }}
          onMouseEnter={e => (e.currentTarget.style.background = GOLD_DARK)}
          onMouseLeave={e => (e.currentTarget.style.background = GOLD)}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function YachtScreen({ yachts, loading, agentName, onSelect, onLogout }: {
  yachts: YachtOption[]; loading: boolean; agentName: string
  onSelect: (id: string, target: 'media' | 'calendar') => void; onLogout: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeId && yachts.length) setActiveId(yachts[0].id)
  }, [yachts, activeId])

  const active = yachts.find(y => y.id === activeId) ?? null
  const activeIndex = active ? yachts.findIndex(y => y.id === active.id) : -1

  function prevYacht() { if (active) setActiveId(yachts[(activeIndex - 1 + yachts.length) % yachts.length].id) }
  function nextYacht() { if (active) setActiveId(yachts[(activeIndex + 1) % yachts.length].id) }

  if (loading) return <FullScreenLoader />

  if (!active) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center text-center px-6">
        <img src={SAMARA_LOGO} alt="Samara" className="h-6 w-auto object-contain brightness-0 invert mb-6" />
        <p className="text-white/70 text-sm">No yachts are available yet. Please check back later.</p>
        <button onClick={onLogout} className="mt-6 text-white/50 hover:text-white text-xs transition-colors">Log out</button>
      </div>
    )
  }

  const fallbackImage = activeIndex % 2 === 0 ? FALLBACK_PHOTO_A : FALLBACK_PHOTO_B

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap');`}</style>

      <img key={active.id} src={active.image ?? fallbackImage} alt={active.name} className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-5 sm:p-8 z-10">
        <div className="flex items-center bg-black/30 backdrop-blur-sm rounded-full pl-3 pr-4 py-2">
          <img src={SAMARA_LOGO} alt="Samara" className="h-4 sm:h-5 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-3">
          {agentName && (
            <span className="hidden sm:inline text-white/70 text-xs font-medium bg-black/30 backdrop-blur-sm px-4 py-2.5 rounded-full truncate max-w-[180px]">
              Hi, {agentName}
            </span>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-medium bg-black/30 backdrop-blur-sm px-4 py-2.5 rounded-full transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      </div>

      {/* Left content */}
      <div className="absolute inset-y-0 left-0 flex flex-col justify-center px-6 sm:px-14 lg:px-20 max-w-xl z-10">
        <p className="text-[#d9cda3] text-xs font-semibold uppercase tracking-[0.3em] mb-4">Travel Partner &amp; Press</p>
        <h1
          key={active.id}
          className="text-white font-black text-6xl sm:text-7xl lg:text-8xl leading-[0.95] tracking-tight animate-in fade-in slide-in-from-bottom-3 duration-500"
          style={{ fontFamily: "'Merriweather', serif" }}
        >
          {active.name}
        </h1>
        <p className="text-white/80 text-sm sm:text-base mt-5 max-w-sm">
          {[active.type, active.cabinCount ? `${active.cabinCount} Cabins` : null, active.capacity ? `${active.capacity} Guests` : null, active.length ? `${active.length}m` : null]
            .filter(Boolean).join(' · ')}
        </p>
        {active.description && (
          <p className="text-white/70 text-sm mt-3 max-w-sm leading-relaxed">{active.description}</p>
        )}
        {active.tagline && (
          <p className="flex items-center gap-1.5 text-[#d9cda3] text-xs sm:text-sm mt-4">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> {active.tagline}
          </p>
        )}
        <div className="flex items-center flex-wrap gap-3 mt-8">
          <button
            onClick={() => onSelect(active.id, 'media')}
            className="inline-flex items-center gap-2 bg-white text-sm font-semibold px-6 py-3.5 rounded-full hover:scale-105 transition-transform shadow-xl"
            style={{ color: GOLD_DARK }}
          >
            <FileStack className="h-4 w-4" /> See Resources
          </button>
          <button
            onClick={() => onSelect(active.id, 'calendar')}
            className="inline-flex items-center gap-2 bg-black/30 backdrop-blur-sm border border-white/30 text-white text-sm font-semibold px-6 py-3.5 rounded-full hover:bg-black/45 transition-colors"
          >
            <CalendarDays className="h-4 w-4" /> Yacht Calendar
          </button>
        </div>
      </div>

      {/* Floating card row — lower right, peeking off the bottom, hugs the right edge */}
      {yachts.length > 1 && (
        <div className="hidden sm:flex absolute bottom-8 sm:bottom-10 right-6 sm:right-10 flex-col items-end gap-3 z-10">
          <div className="flex items-end gap-3 sm:gap-4">
            <button
              onClick={prevYacht}
              aria-label="Previous yacht"
              className="self-center shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/40 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {yachts.map((y, i) => (
              <button
                key={y.id}
                onClick={() => setActiveId(y.id)}
                className={cn(
                  'group relative shrink-0 w-28 h-40 sm:w-36 sm:h-56 rounded-xl overflow-hidden border transition-all duration-300',
                  y.id === activeId ? 'border-white/70 shadow-2xl -translate-y-2' : 'border-white/10 opacity-70 hover:opacity-100 hover:-translate-y-1'
                )}
              >
                <img src={y.image ?? (i % 2 === 0 ? FALLBACK_PHOTO_A : FALLBACK_PHOTO_B)} alt={y.name} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute bottom-2.5 left-2.5 right-2.5">
                  <p className="text-white font-bold text-xs sm:text-sm leading-tight uppercase tracking-tight">{y.name}</p>
                </div>
              </button>
            ))}

            <button
              onClick={nextYacht}
              aria-label="Next yacht"
              className="self-center shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/40 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="w-full h-px bg-white/20">
            <div
              className="h-px bg-white transition-all duration-300"
              style={{ width: `${((activeIndex + 1) / yachts.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Colored file-type tile — shown when there's no real thumbnail to prioritize
// (PDF render failed, or a type without any thumbnail treatment at all), so a
// card still reads as "this is a PDF" instead of a generic blank icon.
function FileTypeBadge({ label, color }: { label: string; color: string }) {
  return (
    <div className="h-12 w-12 rounded-lg flex flex-col items-center justify-center text-white shrink-0" style={{ backgroundColor: color }}>
      <FileText className="h-4 w-4 mb-0.5" />
      <span className="text-[8px] font-bold tracking-wide">{label}</span>
    </div>
  )
}

// First-page-of-the-PDF thumbnail for the media grid. Loaded dynamically (pdfjs-dist
// is sizeable) and rendered off a CDN-hosted worker matching the installed version —
// avoids wiring pdf.worker.js through the bundler just for a thumbnail. Real preview
// always wins when it renders; the colored PDF tile is only a fallback for when it fails.
function PdfThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
        }
        const pdf = await pdfjsLib.getDocument(url).promise
        const page = await pdf.getPage(1)
        const unscaled = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: 500 / unscaled.width })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no 2d context')
        await page.render({ canvasContext: ctx, viewport }).promise
        if (!cancelled) setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [url])

  if (status === 'error') return <FileTypeBadge label="PDF" color="#DC2626" />
  return (
    <>
      <canvas ref={canvasRef} className={cn('w-full h-full object-cover object-top', status !== 'ready' && 'hidden')} />
      {status === 'loading' && <div className="h-12 w-12 rounded-lg bg-neutral-200 animate-pulse" />}
    </>
  )
}

// Fits a book-reader page size within the (now full-screen) preview modal's available
// area — always sized for an open-book two-page spread regardless of the PDF's own page
// orientation (portrait or landscape), matching the reference look; react-pageflip's
// `usePortrait` still auto-collapses to a single page on narrower viewports on top of this.
function computeFlipbookDims(pageWidthPt: number, pageHeightPt: number) {
  // ~56px header + ~76px page-indicator row + breathing room, taken off the actual viewport
  // rather than a fixed modal-box size now that the preview fills the whole screen.
  const maxContainerWidth = Math.min(1400, window.innerWidth - 64)
  const maxContainerHeight = window.innerHeight - 56 - 76 - 32
  const ratio = pageHeightPt / pageWidthPt
  const width = Math.min(maxContainerWidth / 2, maxContainerHeight / ratio)
  return { width: Math.round(width), height: Math.round(width * ratio) }
}

const FlipPage = forwardRef<HTMLDivElement, { src: string }>(function FlipPage({ src }, ref) {
  return (
    <div ref={ref} className="bg-white">
      <img src={src} alt="" className="w-full h-full object-contain select-none pointer-events-none" draggable={false} />
    </div>
  )
})

// Real page-turn "flipbook" reader for a PDF — every page is rendered to an image up
// front (pdfjs-dist, same worker setup as PdfThumbnail above), then handed to
// react-pageflip for the actual flip animation/drag interaction. Falls back to a plain
// iframe if rendering fails for any reason (e.g. a corrupt/unsupported PDF).
function PdfFlipbook({ url }: { url: string }) {
  const [pages, setPages] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [dims, setDims] = useState({ width: 400, height: 560 })
  const [pageIndex, setPageIndex] = useState(0)
  // react-pageflip doesn't ship a typed ref shape — `pageFlip()` returns the underlying
  // PageFlip instance (flipNext/flipPrev/etc.), per the library's own documented usage.
  const flipRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } } | null>(null)

  useEffect(() => {
    let cancelled = false
    setPages(null)
    setFailed(false)
    setPageIndex(0)
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
        }
        const pdf = await pdfjsLib.getDocument(url).promise
        const images: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('no 2d context')
          await page.render({ canvasContext: ctx, viewport }).promise
          images.push(canvas.toDataURL('image/jpeg', 0.85))
          if (i === 1) {
            const unscaled = page.getViewport({ scale: 1 })
            if (!cancelled) setDims(computeFlipbookDims(unscaled.width, unscaled.height))
          }
        }
        if (!cancelled) setPages(images)
      } catch (e) {
        console.error('[PdfFlipbook] failed to render', e)
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [url])

  if (failed) return <iframe src={url} title="PDF preview" className="flex-1 w-full bg-neutral-100" />

  if (!pages) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparing pages…
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 overflow-hidden bg-neutral-100 py-4">
      <HTMLFlipBook
        ref={flipRef as any}
        width={dims.width}
        height={dims.height}
        size="fixed"
        minWidth={200} maxWidth={1000} minHeight={280} maxHeight={1400}
        startPage={0}
        drawShadow
        flippingTime={500}
        usePortrait
        startZIndex={0}
        autoSize
        maxShadowOpacity={0.5}
        showCover
        mobileScrollSupport
        clickEventForward
        useMouseEvents
        swipeDistance={30}
        showPageCorners
        disableFlipByClick={false}
        className=""
        style={{}}
        onFlip={(e: { data: number }) => setPageIndex(e.data)}
      >
        {pages.map((src, i) => <FlipPage key={i} src={src} />)}
      </HTMLFlipBook>
      {pages.length > 1 && (
        <div className="flex items-center gap-4 shrink-0">
          <button onClick={() => flipRef.current?.pageFlip().flipPrev()} className="p-1.5 rounded-full bg-white shadow text-neutral-600 hover:text-black transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">{pageIndex + 1} / {pages.length}</span>
          <button onClick={() => flipRef.current?.pageFlip().flipNext()} className="p-1.5 rounded-full bg-white shadow text-neutral-600 hover:text-black transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function MediaKitScreen({ yacht }: { yacht: YachtOption }) {
  const [categories, setCategories] = useState<MediaCategoryRecord[]>([])
  const [activeCatId, setActiveCatId] = useState<string>('')
  const [files, setFiles] = useState<MediaFile[]>([])
  const [mediaFolders, setMediaFolders] = useState<MediaFolderRecord[]>([])
  const [loading, setLoading] = useState(true)
  // null = top level of the active category. Folders can nest to unlimited depth.
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [preview, setPreview] = useState<MediaFile | null>(null)

  useEffect(() => {
    fetch('/api/agent-portal/categories')
      .then(r => r.ok ? r.json() : [])
      .then((cats: MediaCategoryRecord[]) => {
        setCategories(cats)
        setActiveCatId(prev => prev || cats[0]?.id || '')
      })
      .catch(() => setCategories([]))
    fetch('/api/agent-portal/folders')
      .then(r => r.ok ? r.json() : [])
      .then(setMediaFolders)
      .catch(() => setMediaFolders([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/agent-portal/media?yachtId=${yacht.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [yacht.id])

  useEffect(() => { setActiveFolderId(null) }, [activeCatId])

  // A category with nothing uploaded for this yacht is just dead-end clutter for an
  // agent browsing — only offer the ones that actually have something to show.
  const visibleCategories = useMemo(
    () => categories.filter(c => files.some(f => f.categoryId === c.id)),
    [categories, files]
  )

  // Files load after categories (separate effect, keyed on yacht.id) — once they land,
  // make sure the active tab isn't one that turned out to be empty for this yacht.
  useEffect(() => {
    if (loading || visibleCategories.length === 0) return
    if (!visibleCategories.some(c => c.id === activeCatId)) setActiveCatId(visibleCategories[0].id)
  }, [loading, visibleCategories, activeCatId])

  function selectCategory(id: string) {
    setActiveCatId(id)
  }

  const activeCategory = visibleCategories.find(c => c.id === activeCatId) ?? null
  const categoryFiles = files.filter(f => f.categoryId === activeCatId)
  const categoryFolders = mediaFolders.filter(f => f.categoryId === activeCatId && (f.yachtId === null || f.yachtId === yacht.id))
  const currentFiles = categoryFiles.filter(f => (f.folderId ?? null) === activeFolderId)
  const currentFolders = categoryFolders.filter(f => (f.parentId ?? null) === activeFolderId)
  // Breadcrumb trail from category root down to the open folder.
  const folderPath = useMemo(() => {
    const path: MediaFolderRecord[] = []
    let current = activeFolderId ? categoryFolders.find(f => f.id === activeFolderId) ?? null : null
    while (current) {
      path.unshift(current)
      current = current.parentId ? categoryFolders.find(f => f.id === current!.parentId) ?? null : null
    }
    return path
  }, [mediaFolders, activeCatId, activeFolderId])

  function folderFileCount(folderId: string) {
    return categoryFiles.filter(f => f.folderId === folderId).length
  }

  function fileCard(f: MediaFile) {
    return (
      <button key={f.id} onClick={() => setPreview(f)} className="group text-left">
        <div className="relative aspect-[4/3] bg-neutral-100 overflow-hidden flex items-center justify-center">
          {f.type === 'image' ? (
            // unoptimized: skips the server-side sharp() resize pass entirely — that pass was
            // failing (503) on this box's limited RAM for large photos. Uploads are already
            // downscaled client-side before they reach R2, so this trades a slightly bigger
            // transfer for not depending on the server's memory headroom at request time.
            <Image src={f.url} alt={f.name} fill unoptimized sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition-opacity group-hover:opacity-90" />
          ) : f.type === 'video' ? (
            <div className="w-11 h-11 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-400 group-hover:text-neutral-600 transition-colors">
              <Play className="h-4 w-4 ml-0.5" />
            </div>
          ) : f.type === 'document' ? (
            <PdfThumbnail url={f.url} />
          ) : (
            <FileText className="h-8 w-8 text-neutral-300" />
          )}
        </div>
        <p className="text-sm mt-3 truncate">{f.name}</p>
        <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wide mt-0.5">
          {f.type === 'document' ? 'PDF' : f.type === 'video' ? 'Video' : 'Image'}
          {formatSize(f.sizeBytes) ? ` · ${formatSize(f.sizeBytes)}` : ''}
        </p>
      </button>
    )
  }

  return (
    <div>
      <div className="text-center mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">What's Included</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2" style={{ fontFamily: "'Merriweather', serif" }}>
          <span style={{ color: GOLD_DARK }}>{yacht.name}</span> Media Kit
        </h2>
        <p className="text-muted-foreground text-sm mt-3 max-w-md mx-auto">
          Everything you need to present and sell {yacht.name} to your clients
        </p>
      </div>

      <div className="flex justify-between gap-x-6 gap-y-2 flex-wrap border-b mb-8 max-w-3xl mx-auto">
        {visibleCategories.map(c => (
          <button
            key={c.id}
            onClick={() => selectCategory(c.id)}
            className={cn(
              'relative pb-3 text-sm whitespace-nowrap transition-colors',
              activeCatId === c.id ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            {c.name}
            {activeCatId === c.id && <span className="absolute left-0 right-0 -bottom-px h-px" style={{ background: GOLD_DARK }} />}
          </button>
        ))}
      </div>

      {!activeCategory ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nothing here yet.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-xs mb-6 flex-wrap">
            <button
              onClick={() => setActiveFolderId(null)}
              className={cn('flex items-center gap-1.5 transition-colors', !activeFolderId ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
            >
              <FolderOpen className="h-3.5 w-3.5" /> {activeCategory.name}
            </button>
            {folderPath.map(f => (
              <span key={f.id} className="flex items-center gap-2">
                <span className="text-muted-foreground/30">/</span>
                <button
                  onClick={() => setActiveFolderId(f.id)}
                  className={cn('transition-colors', f.id === activeFolderId ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          {currentFiles.length === 0 && currentFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nothing here yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8">
              {currentFolders.map(folder => (
                <button key={folder.id} onClick={() => setActiveFolderId(folder.id)} className="group text-left">
                  <div className="aspect-[4/3] rounded-lg flex items-center justify-center transition-colors" style={{ backgroundColor: `${GOLD}14` }}>
                    <FolderOpen className="h-16 w-16 transition-colors" style={{ color: GOLD_DARK }} />
                  </div>
                  <p className="text-sm mt-3 leading-tight">{folder.name}</p>
                  <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wide mt-0.5">
                    {folderFileCount(folder.id)} files
                  </p>
                </button>
              ))}
              {currentFiles.map(fileCard)}
            </div>
          )}
        </div>
      )}

      <div className="mt-16 -mb-10 relative left-1/2 -translate-x-1/2 w-screen bg-neutral-900 py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
          <div className="aspect-[4/3] bg-neutral-800 overflow-hidden order-2 sm:order-1">
            <img src={yacht.image ?? FALLBACK_PHOTO_A} alt={yacht.name} className="w-full h-full object-cover" />
          </div>
          <div className="order-1 sm:order-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">About this yacht</p>
            <h3 className="text-xl font-bold mt-2 text-white" style={{ fontFamily: "'Merriweather', serif" }}>{yacht.name}</h3>
            <p className="text-sm text-white/70 mt-3 leading-relaxed">
              {yacht.name} is a {yacht.cabinCount ? `${yacht.cabinCount}-cabin ` : ''}{(yacht.type ?? 'yacht').toLowerCase()}
              {yacht.tagline ? ` sailing ${yacht.tagline}` : ''}. Thoughtfully designed for both comfort and adventure, she pairs
              spacious social areas with intimate cabins — equally suited to family charters, dive expeditions, and press
              familiarization trips. This media kit gives your clients everything they need to picture their journey aboard her.
            </p>
          </div>
        </div>
      </div>

      {preview && (
        <div
          className={cn(
            'fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-50',
            preview.type !== 'document' && 'p-4'
          )}
          onClick={() => setPreview(null)}
        >
          {preview.type === 'document' && (
            <div className="bg-white w-full h-full flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0">
                <p className="text-sm font-medium truncate">{preview.name}</p>
                <div className="flex items-center gap-4 shrink-0">
                  <a
                    href={preview.url}
                    download={preview.name}
                    className="text-xs font-semibold hover:underline underline-offset-2"
                    style={{ color: GOLD_DARK }}
                  >
                    Download
                  </a>
                  <button onClick={() => setPreview(null)} aria-label="Close preview" className="text-muted-foreground/70 hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <PdfFlipbook url={preview.url} />
            </div>
          )}

          {preview.type === 'image' && (
            <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-end pb-3">
                <button onClick={() => setPreview(null)} aria-label="Close preview" className="text-white/70 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="aspect-[4/3] bg-neutral-100">
                <img src={preview.url} alt={preview.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between pt-3">
                <p className="text-sm text-white">{preview.name}</p>
                <a href={preview.url} download={preview.name} className="text-xs font-semibold text-white/80 hover:text-white transition-colors">
                  Download
                </a>
              </div>
            </div>
          )}

          {preview.type === 'video' && (
            <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between pb-3">
                <p className="text-sm text-white truncate">{preview.name}</p>
                <button onClick={() => setPreview(null)} aria-label="Close preview" className="text-white/70 hover:text-white transition-colors shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="aspect-video bg-black">
                <iframe src={toEmbedUrl(preview.url)} title={preview.name} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CalendarScreen({ yacht }: { yacht: YachtOption }) {
  const [view, setView] = useState<'calendar' | 'shared'>('calendar')
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<CalendarBooking[]>([])
  const [openTrips, setOpenTrips] = useState<CalendarOpenTrip[]>([])
  const months = useMemo(() => monthsAhead(12), [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/agent-portal/calendar?yachtId=${yacht.id}`)
      .then(r => r.ok ? r.json() : { bookings: [], openTrips: [] })
      .then(data => { setBookings(data.bookings ?? []); setOpenTrips(data.openTrips ?? []) })
      .catch(() => { setBookings([]); setOpenTrips([]) })
      .finally(() => setLoading(false))
  }, [yacht.id])

  const hasSharedTrip = openTrips.length > 0

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight">Availability — {yacht.name}</h2>
      <p className="text-muted-foreground text-sm mt-1 mb-5">
        {view === 'calendar' ? 'Booked vs. available dates for the next 12 months' : 'Cabin-by-cabin availability for upcoming shared/open-trip departures'}
      </p>

      {hasSharedTrip && (
        <div className="flex gap-6 border-b mb-8">
          <button
            onClick={() => setView('calendar')}
            className={cn('relative pb-3 text-sm transition-colors', view === 'calendar' ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
          >
            Availability Calendar
            {view === 'calendar' && <span className="absolute left-0 right-0 -bottom-px h-px" style={{ background: GOLD_DARK }} />}
          </button>
          <button
            onClick={() => setView('shared')}
            className={cn('relative pb-3 text-sm transition-colors', view === 'shared' ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
          >
            Shared Trip
            {view === 'shared' && <span className="absolute left-0 right-0 -bottom-px h-px" style={{ background: GOLD_DARK }} />}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
      ) : view === 'calendar' ? (
        <>
          <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground mb-6">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-white border border-neutral-300" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-emerald-500" /> On Hold</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-amber-400" /> Pending</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-red-500" /> Booked</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {months.map(({ year, monthIndex, label }) => {
              const totalDays = daysInMonth(year, monthIndex)
              const startWeekday = firstWeekday(year, monthIndex)
              const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]

              return (
                <div key={label} className="bg-white border rounded-xl p-4">
                  <p className="text-sm font-semibold mb-3">{label}</p>

                  <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-muted-foreground mb-1.5">
                    {MONTH_NAMES_SHORT.map((d, i) => <div key={i}>{d}</div>)}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={i} />
                      const status = statusForDate(bookings, new Date(year, monthIndex, day))
                      return (
                        <div
                          key={i}
                          className={cn('aspect-square rounded flex items-center justify-center text-[9px] font-medium', DAY_STATUS_STYLE[status])}
                        >
                          {day}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="space-y-5">
          {openTrips.map(trip => (
            <div key={trip.id} className="bg-white border rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                  <p className="font-semibold text-sm">{trip.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{trip.destination}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDateRange(trip.startDate, trip.endDate)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {trip.cabinStatuses.map(cabin => (
                  <div
                    key={cabin.id}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium',
                      cabin.bookingStatus ? 'bg-red-500 text-white' : 'bg-white border border-neutral-200 text-neutral-600'
                    )}
                  >
                    <span className="truncate">{cabin.name}</span>
                    <span className="text-[9px] uppercase tracking-wide opacity-80 shrink-0">
                      {cabin.bookingStatus ? 'Booked' : 'Available'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
