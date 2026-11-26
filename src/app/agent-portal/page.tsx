'use client'

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  Lock, ChevronLeft, ChevronRight, ChevronDown, FileText, X, FolderOpen, Play, Loader2,
  ZoomIn, ZoomOut, ArrowRight, ArrowUpRight, Menu, LogOut, Search, Download,
  CalendarDays, Ship,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEffectiveBookingStatus } from '@/lib/booking-status'
import { formatDateRange } from '@/lib/format'

// Colours, type and component classes (.ap-*) live in ./portal.css, scoped under .ap-root
// by ./layout.tsx — the portal keeps its own fixed light palette instead of the ERP theme.

// react-pageflip touches browser globals (document/HTMLElement) at module-evaluation time,
// which throws during Next.js's server-side render pass on a self-hosted (non-edge) Node
// server — loaded client-only to avoid that.
const HTMLFlipBook = dynamic(() => import('react-pageflip'), { ssr: false })

// Decorative photos, used when a yacht has no `image` set in the ERP yet.
const FALLBACK_PHOTOS = [
  '/agent-portal/samara1.webp',
  '/agent-portal/lounge-otium.webp',
  '/agent-portal/mischief-yacht-komodo.jpg',
  '/agent-portal/samara-II.webp',
]

type PortalRole = 'agent' | 'media'

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

// ── Routing ────────────────────────────────────────────────────────────────────────────
// Hash-based so the browser back button works between portal pages without adding real
// Next.js routes (everything stays behind the one session-gated client page).

type View = 'home' | 'resources' | 'yacht' | 'availability' | 'media'
interface Route { view: View; yachtId: string | null }
type Navigate = (route: Route) => void

function parseHash(hash: string): Route {
  const [head, id] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (head === 'resources') return { view: 'resources', yachtId: null }
  if (head === 'yacht' && id) return { view: 'yacht', yachtId: id }
  if (head === 'availability') return { view: 'availability', yachtId: id ?? null }
  if (head === 'media') return { view: 'media', yachtId: null }
  return { view: 'home', yachtId: null }
}

function routeToHash(route: Route): string {
  switch (route.view) {
    case 'resources': return '#/resources'
    case 'yacht': return `#/yacht/${encodeURIComponent(route.yachtId ?? '')}`
    case 'availability': return route.yachtId ? `#/availability/${encodeURIComponent(route.yachtId)}` : '#/availability'
    case 'media': return '#/media'
    default: return '#/'
  }
}

// ── Small helpers ──────────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null) {
  if (bytes == null) return null
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function yachtImage(yacht: YachtOption | null | undefined, index = 0) {
  return yacht?.image ?? FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length]
}

function yachtSpecs(y: YachtOption) {
  return [
    y.type,
    y.length ? `${y.length} m` : null,
    y.cabinCount ? `${y.cabinCount} cabins` : null,
    y.capacity ? `${y.capacity} guests` : null,
  ].filter(Boolean).join(' · ')
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function initials(name: string) {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join('') || '·'
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

// ── Brand ──────────────────────────────────────────────────────────────────────────────
// The one place the portal renders the Samara Yachting logo: the SAMARA / YACHTING wordmark.
// To switch to an image file later, set BRAND_LOGO to its /public paths (dark + light variant).
const BRAND_LOGO: { dark: string; light: string } | null = null

function BrandLogo({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  if (BRAND_LOGO) {
    return <img src={BRAND_LOGO[tone]} alt="Samara Yachting" className={cn('h-8 w-auto', className)} />
  }
  return (
    <span
      aria-label="Samara Yachting"
      className={cn('inline-flex flex-col items-center leading-none select-none transition-colors duration-300', tone === 'light' ? 'text-white' : 'text-(--ap-ink)', className)}
    >
      <span className="ap-serif text-[26px] font-semibold tracking-[0.12em] leading-[.8]">SAMARA</span>
      <span className="text-[8.5px] font-medium tracking-[0.46em] pl-[0.46em] mt-[9px]">YACHTING</span>
    </span>
  )
}

// ── Motion helpers ─────────────────────────────────────────────────────────────────────

/** Fades/slides its children in the first time they scroll into view. */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        io.disconnect()
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} data-visible={visible} style={{ transitionDelay: `${delay}ms` }} className={cn('ap-reveal', className)}>
      {children}
    </div>
  )
}

/** Cover image that fades in once loaded over a shimmering placeholder. Fills a positioned parent. */
function FadeImage({ src, alt = '', className, dark }: { src: string; alt?: string; className?: string; dark?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <>
      {!loaded && <span aria-hidden className={cn('absolute inset-0', dark ? 'ap-skeleton-dark' : 'ap-skeleton')} />}
      <img
        // Cached images can finish before React attaches onLoad — catch those on mount.
        ref={el => { if (el && el.complete && el.naturalWidth > 0 && !loaded) setLoaded(true) }}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-out', loaded ? 'opacity-100' : 'opacity-0', className)}
      />
    </>
  )
}

/** Moves the element at a fraction of the scroll speed (hero parallax). */
function useParallax<T extends HTMLElement>(factor = 0.3) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const y = Math.min(window.scrollY, window.innerHeight)
      el.style.transform = y > 0 ? `translate3d(0, ${y * factor}px, 0)` : ''
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [factor])
  return ref
}

function useScrolledPast(offset: number) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])
  return past
}

// ── Calendar logic ─────────────────────────────────────────────────────────────────────

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function firstWeekday(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).getDay()
}

// Months shown for a year: the current year starts at this month (no looking back), later
// years show January–December.
function monthsForYear(year: number) {
  const now = new Date()
  const first = year === now.getFullYear() ? now.getMonth() : 0
  return Array.from({ length: 12 - first }, (_, i) => {
    const d = new Date(year, first + i, 1)
    return { year, monthIndex: d.getMonth(), label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
  })
}

type DayStatus = 'past' | 'available' | 'onhold' | 'pending' | 'booked' | 'shared'

// Same status colours as the ERP's booking calendar (on hold = green, pending = orange).
const DAY_STATUS_STYLE: Record<DayStatus, string> = {
  past: 'bg-(--ap-surface) text-(--ap-line-strong)',
  available: 'bg-white border border-(--ap-line) text-(--ap-muted)',
  onhold: 'bg-success text-success-foreground',
  pending: 'bg-warning text-warning-foreground',
  booked: 'bg-destructive text-destructive-foreground',
  shared: 'bg-info text-info-foreground',
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

function inRange(startDate: string, endDate: string, date: Date) {
  const start = new Date(startDate.split('T')[0] + 'T00:00:00')
  const end = new Date(endDate.split('T')[0] + 'T00:00:00')
  // Inclusive of endDate — the checkout day is still a sailing day on the schedule.
  return date >= start && date <= end
}

// Private charters / blocking events win; otherwise any day inside a shared (open) trip's
// departure window shows as 'shared' while cabins are left, 'booked' once it's full.
// OPEN_TRIP bookings are per-cabin, so they don't make the whole yacht "booked" on their own.
function statusForDate(bookings: CalendarBooking[], openTrips: CalendarOpenTrip[], date: Date, today: Date): DayStatus {
  // Days already behind us are greyed out with no status — agents don't see booking history.
  if (date < today) return 'past'
  for (const b of bookings) {
    if (b.tripType === 'OPEN_TRIP') continue
    if (inRange(b.startDate, b.endDate, date)) {
      return dayStatusFromBookingStatus(getEffectiveBookingStatus(b.status, b.startDate, b.endDate))
    }
  }
  const trip = openTrips.find(t => inRange(t.startDate, t.endDate, date))
  if (trip) return trip.spotsAvailable > 0 && trip.status !== 'closed' ? 'shared' : 'booked'
  for (const b of bookings) {
    if (b.tripType === 'OPEN_TRIP' && inRange(b.startDate, b.endDate, date)) {
      return dayStatusFromBookingStatus(getEffectiveBookingStatus(b.status, b.startDate, b.endDate))
    }
  }
  return 'available'
}

// The API reports OpenTrip.status as stored in the DB, which isn't auto-flipped to 'closed'
// once the trip's dates have passed — so "closed" here also covers trips already behind us.
function isTripClosed(t: CalendarOpenTrip) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return t.status === 'closed' || new Date(t.endDate) < today
}

// ── Page ───────────────────────────────────────────────────────────────────────────────

function FullScreenLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-(--ap-bg)">
      <Loader2 className="h-6 w-6 animate-spin text-(--ap-faint)" />
    </div>
  )
}

export default function AgentPortalPage() {
  const [authed, setAuthed] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [loginRole, setLoginRole] = useState<PortalRole>('agent')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [role, setRole] = useState<PortalRole>('agent')
  const [accountName, setAccountName] = useState('')
  const [yachts, setYachts] = useState<YachtOption[]>([])
  const [yachtsLoading, setYachtsLoading] = useState(false)
  const [generalPromo, setGeneralPromo] = useState<PromoRecord | null>(null)
  const [yachtPromo, setYachtPromo] = useState<PromoRecord | null>(null)
  const [route, setRoute] = useState<Route>({ view: 'home', yachtId: null })
  const lastPromoYachtId = useRef<string | null>(null)

  // Keep `route` in sync with the URL hash. Scroll to top on a real page change, but not when
  // only the yacht picker on the availability page changes.
  useEffect(() => {
    let prev: Route | null = null
    const sync = () => {
      const next = parseHash(window.location.hash)
      const pageChanged = !prev || prev.view !== next.view || (next.view === 'yacht' && prev.yachtId !== next.yachtId)
      prev = next
      setRoute(next)
      if (pageChanged) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const navigate = useCallback<Navigate>(next => {
    const hash = routeToHash(next)
    if (window.location.hash === hash || (hash === '#/' && !window.location.hash)) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    window.location.hash = hash
  }, [])

  const loadYachts = useCallback(async () => {
    setYachtsLoading(true)
    try {
      const res = await fetch('/api/agent-portal/yachts')
      if (res.ok) setYachts(await res.json())
    } catch (e) { console.error(e) }
    finally { setYachtsLoading(false) }
  }, [])

  // Promos are trade offers, so only agents get the popups. The "General" one shows right
  // after sign-in (fresh login or session bootstrap on refresh).
  const enterPortal = useCallback((nextRole: PortalRole, name: string) => {
    setRole(nextRole)
    setAccountName(name)
    setAuthed(true)
    loadYachts()
    if (nextRole === 'agent') {
      fetch('/api/agent-portal/promos')
        .then(r => r.ok ? r.json() : null)
        .then(setGeneralPromo)
        .catch(() => {})
    }
  }, [loadYachts])

  // Session bootstrap: if a valid cookie already exists (page refresh), skip the login screen.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agent-portal/session')
        const data = await res.json().catch(() => ({ valid: false }))
        if (data.valid) enterPortal(data.role === 'media' ? 'media' : 'agent', data.name ?? '')
      } finally {
        setCheckingSession(false)
      }
    })()
  }, [enterPortal])

  // Yacht-specific promo — once per yacht, the first time an agent opens that yacht.
  useEffect(() => {
    if (!authed || role !== 'agent' || !route.yachtId || route.yachtId === lastPromoYachtId.current) return
    lastPromoYachtId.current = route.yachtId
    fetch(`/api/agent-portal/promos?yachtId=${route.yachtId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setYachtPromo)
      .catch(() => {})
  }, [authed, role, route.yachtId])

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
        body: JSON.stringify({ email, password, role: loginRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoginError(data.error ?? 'Incorrect email or password')
        return
      }
      setPassword('')
      enterPortal(data.role === 'media' ? 'media' : 'agent', data.name ?? '')
    } finally {
      setLoggingIn(false)
    }
  }

  function logout() {
    fetch('/api/agent-portal/logout', { method: 'POST' }).catch(() => {})
    setEmail('')
    setPassword('')
    setLoginError('')
    setYachts([])
    setAccountName('')
    setGeneralPromo(null)
    setYachtPromo(null)
    lastPromoYachtId.current = null
    setAuthed(false)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setRoute({ view: 'home', yachtId: null })
  }

  let body: React.ReactNode
  if (checkingSession) {
    body = <FullScreenLoader />
  } else if (!authed) {
    body = (
      <LoginScreen
        role={loginRole} setRole={r => { setLoginRole(r); setLoginError('') }}
        email={email} setEmail={setEmail}
        password={password} setPassword={setPassword}
        error={loginError} loading={loggingIn} onSubmit={handleLogin}
      />
    )
  } else {
    body = (
      <PortalShell
        role={role} route={route} navigate={navigate} accountName={accountName} onLogout={logout}
        yachts={yachts} yachtsLoading={yachtsLoading}
      />
    )
  }

  // Keyed per screen so login ↔ portal fades instead of snapping (opacity-only animation, so
  // it never becomes the containing block for the `fixed` modals inside).
  const screenKey = checkingSession ? 'loading' : authed ? 'portal' : 'login'

  return (
    <ContentProtection>
      <div key={screenKey} className="animate-[page-enter_0.5s_ease-out]">
        {body}
      </div>
      {generalPromo && <PromoPopup promo={generalPromo} onClose={() => setGeneralPromo(null)} />}
      {!generalPromo && yachtPromo && <PromoPopup promo={yachtPromo} onClose={() => setYachtPromo(null)} />}
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

function PromoPopup({ promo, onClose }: { promo: PromoRecord; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-(--ap-overlay) backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-0 sm:p-6 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label={promo.title}
        className="relative bg-white w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-(--ap-shadow-lg) animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95 duration-500 delay-150 fill-mode-both ease-out"
        onClick={e => e.stopPropagation()}
      >
        {promo.imageUrl && (
          <div className="aspect-[16/10] bg-(--ap-surface)">
            <img src={promo.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 h-9 w-9 bg-white/90 backdrop-blur flex items-center justify-center text-(--ap-ink) shadow-sm hover:bg-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-6 sm:p-7">
          <h3 className="ap-h2">{promo.title}</h3>
          {promo.description && <p className="ap-small !text-[14px] mt-2.5">{promo.description}</p>}
          <div className="flex items-center gap-3 mt-6">
            {promo.ctaLabel && promo.ctaUrl && (
              <a href={promo.ctaUrl} target="_blank" rel="noopener noreferrer" className="ap-btn" onClick={onClose}>
                {promo.ctaLabel} <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
            <button onClick={onClose} className="ap-btn ap-btn-secondary">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Login (kept to the original portal design, plus the Agent / Media switch) ──────────

const LOGIN_COPY: Record<PortalRole, { title: string; subtitle: string; placeholder: string }> = {
  agent: { title: 'Agent Access', subtitle: 'Log in with the email and password provided to you.', placeholder: 'you@agency.com' },
  media: { title: 'Media Access', subtitle: 'Log in with the press account provided by our marketing team.', placeholder: 'you@publication.com' },
}

function LoginScreen({ role, setRole, email, setEmail, password, setPassword, error, loading, onSubmit }: {
  role: PortalRole; setRole: (r: PortalRole) => void
  email: string; setEmail: (v: string) => void
  password: string; setPassword: (v: string) => void
  error: string; loading: boolean; onSubmit: () => void
}) {
  const copy = LOGIN_COPY[role]
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto">
      <img src={FALLBACK_PHOTOS[0]} alt="" className="absolute inset-0 w-full h-full object-cover motion-safe:animate-in motion-safe:zoom-in-110 duration-[2500ms] ease-out" />
      <div className="absolute inset-0 bg-black/65" />

      <div className="relative w-full max-w-sm mx-4 my-8 bg-white rounded-2xl shadow-2xl p-8 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-700 delay-150 ease-out fill-mode-both">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>

        <div className="mx-auto w-11 h-11 rounded-full flex items-center justify-center bg-(--ap-accent-soft)">
          <Lock className="h-5 w-5 text-(--ap-accent)" />
        </div>
        <h1 className="text-xl font-bold mt-4 text-center text-(--ap-ink)">{copy.title}</h1>
        <p className="text-neutral-500 text-sm mt-1.5 text-center">{copy.subtitle}</p>

        <div role="tablist" aria-label="Sign in as" className="mt-6 grid grid-cols-2 p-1 rounded-lg bg-neutral-100">
          {(['agent', 'media'] as const).map(r => (
            <button
              key={r}
              role="tab"
              type="button"
              aria-selected={role === r}
              onClick={() => setRole(r)}
              className={cn(
                'h-9 rounded-md text-sm font-medium transition-all',
                role === r ? 'bg-white text-(--ap-ink) shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              )}
            >
              {r === 'agent' ? 'Agent' : 'Media'}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); onSubmit() }}>
          <div className="space-y-1.5">
            <label htmlFor="agent-login-email" className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Email</label>
            <input
              id="agent-login-email"
              type="email"
              autoFocus
              autoComplete="email"
              className="w-full h-12 px-3.5 text-sm border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-2 focus:ring-(--ap-accent)/40 focus:border-(--ap-accent) transition-shadow"
              placeholder={copy.placeholder}
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="agent-login-password" className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Password</label>
            <input
              id="agent-login-password"
              type="password"
              autoComplete="current-password"
              className="w-full h-12 px-3.5 text-sm border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-2 focus:ring-(--ap-accent)/40 focus:border-(--ap-accent) transition-shadow"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-(--ap-error)">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="!mt-6 w-full h-12 rounded-lg text-primary-foreground text-sm font-semibold transition-colors bg-primary hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Shell: header + footer ─────────────────────────────────────────────────────────────

const NAV_ITEMS: { view: View; label: string; agentOnly?: boolean }[] = [
  { view: 'home', label: 'Overview' },
  { view: 'resources', label: 'Resource Library' },
  { view: 'availability', label: 'Availability', agentOnly: true },
  { view: 'media', label: 'Press & Media' },
]

function PortalShell({ role, route, navigate, accountName, onLogout, yachts, yachtsLoading }: {
  role: PortalRole; route: Route; navigate: Navigate; accountName: string; onLogout: () => void
  yachts: YachtOption[]; yachtsLoading: boolean
}) {
  const yacht = route.yachtId ? yachts.find(y => y.id === route.yachtId) ?? null : null
  // Media accounts never get the calendar — a stray #/availability link just lands on Overview.
  const view: View = route.view === 'availability' && role !== 'agent' ? 'home' : route.view
  const loading = yachtsLoading && yachts.length === 0
  const notFound = !loading && view === 'yacht' && !yacht

  let page: React.ReactNode
  if (loading) {
    page = <PageSkeleton />
  } else if (view === 'resources') {
    page = <ResourcesView yachts={yachts} navigate={navigate} />
  } else if (view === 'yacht') {
    page = yacht
      ? <YachtDetailView role={role} yacht={yacht} index={yachts.indexOf(yacht)} navigate={navigate} />
      : <NotFoundView navigate={navigate} />
  } else if (view === 'availability') {
    page = <AvailabilityView yachts={yachts} selected={yacht ?? yachts[0] ?? null} navigate={navigate} />
  } else if (view === 'media') {
    page = <MediaView navigate={navigate} />
  } else {
    page = <HomeView role={role} yachts={yachts} accountName={accountName} navigate={navigate} />
  }

  const pageKey = view === 'yacht' ? `yacht-${route.yachtId}` : view

  return (
    <div className="min-h-screen flex flex-col">
      {/* Every page opens on a full-bleed photo hero, so the header floats over it. */}
      <PortalHeader role={role} view={view} overHero={!notFound} navigate={navigate} accountName={accountName} onLogout={onLogout} />
      <main key={pageKey} className={cn('flex-1 animate-[page-enter_0.5s_ease-out]', notFound && 'pt-[72px]')}>
        {page}
      </main>
      <PortalFooter role={role} navigate={navigate} />
    </div>
  )
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="ap-skeleton-dark h-[440px]" />
      <div className="ap-container py-16 md:py-24">
        <div className="flex flex-col items-center gap-3 mb-12">
          <div className="ap-skeleton h-3 w-32" />
          <div className="ap-skeleton h-9 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="ap-skeleton h-[380px]" />)}
        </div>
      </div>
    </div>
  )
}

function PortalHeader({ role, view, overHero, navigate, accountName, onLogout }: {
  role: PortalRole; view: View; overHero: boolean; navigate: Navigate; accountName: string; onLogout: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const scrolled = useScrolledPast(24)
  const transparent = overHero && !scrolled && !menuOpen
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const activeView: View = view === 'yacht' ? 'resources' : view
  const items = NAV_ITEMS.filter(i => !i.agentOnly || role === 'agent')
  const roleLabel = role === 'media' ? 'Media' : 'Travel agent'

  useEffect(() => {
    if (!accountOpen) return
    function onClickOutside(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [accountOpen])

  // Lock page scroll behind the open mobile menu.
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [menuOpen])

  function go(next: View) {
    setMenuOpen(false)
    navigate({ view: next, yachtId: null })
  }

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        transparent ? 'ap-header-over bg-transparent border-transparent' : 'bg-white/90 backdrop-blur-xl border-(--ap-line)'
      )}
    >
      {transparent && <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />}
      <div className="ap-container relative h-[72px] flex items-center justify-between gap-6">
        <button onClick={() => go('home')} aria-label="Overview" className="shrink-0">
          <BrandLogo tone={transparent ? 'light' : 'dark'} />
        </button>

        <nav className="hidden md:flex items-stretch self-stretch gap-7 lg:gap-9" aria-label="Main">
          {items.map(item => (
            <button
              key={item.view}
              onClick={() => go(item.view)}
              aria-current={activeView === item.view ? 'page' : undefined}
              data-active={activeView === item.view}
              className="ap-tab"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:block relative" ref={accountRef}>
          <button
            onClick={() => setAccountOpen(o => !o)}
            aria-haspopup="true"
            aria-expanded={accountOpen}
            className={cn(
              'flex items-center gap-2.5 h-10 pl-1 pr-3 border transition-colors',
              transparent ? 'border-white/30 hover:border-white/60 text-white' : 'border-(--ap-line) hover:border-(--ap-line-strong) text-(--ap-ink)'
            )}
          >
            <span className={cn('h-8 w-8 text-[12px] font-semibold flex items-center justify-center', transparent ? 'bg-white text-(--ap-ink)' : 'bg-(--ap-ink) text-white')}>
              {initials(accountName)}
            </span>
            <span className="max-w-[160px] truncate text-[13px] font-medium hidden lg:inline">{accountName || 'Account'}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform duration-200', accountOpen && 'rotate-180')} />
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-(--ap-line) shadow-(--ap-shadow-lg) overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-200 origin-top-right">
              <div className="px-4 py-3.5 border-b border-(--ap-line)">
                <p className="text-[14px] font-semibold text-(--ap-ink) break-words">{accountName || 'Partner'}</p>
                <p className="ap-small">{roleLabel}</p>
              </div>
              <button
                onClick={() => { setAccountOpen(false); onLogout() }}
                className="w-full flex items-center gap-2 px-4 py-3 text-[14px] text-(--ap-body) hover:bg-(--ap-surface) transition-colors"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          )}
        </div>

        <button
          className={cn('md:hidden -mr-2 h-10 w-10 flex items-center justify-center transition-colors', transparent ? 'text-white hover:bg-white/10' : 'text-(--ap-ink) hover:bg-(--ap-surface)')}
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[72px] bottom-0 bg-white flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          <nav className="ap-container flex-1 py-4 flex flex-col" aria-label="Main">
            {items.map(item => (
              <button
                key={item.view}
                onClick={() => go(item.view)}
                className={cn(
                  'flex items-center justify-between text-left py-4 border-b border-(--ap-line) text-[18px] font-medium tracking-tight',
                  activeView === item.view ? 'text-(--ap-ink)' : 'text-(--ap-muted)'
                )}
              >
                {item.label}
                <ChevronRight className="h-4 w-4 text-(--ap-faint)" />
              </button>
            ))}
          </nav>
          <div className="ap-container py-5 border-t border-(--ap-line) flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-10 w-10 shrink-0 bg-(--ap-ink) text-white text-[13px] font-semibold flex items-center justify-center">
                {initials(accountName)}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-(--ap-ink) truncate">{accountName || 'Partner'}</p>
                <p className="ap-small">{roleLabel}</p>
              </div>
            </div>
            <button onClick={() => { setMenuOpen(false); onLogout() }} className="ap-btn ap-btn-secondary ap-btn-sm shrink-0">
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

function PortalFooter({ role, navigate }: { role: PortalRole; navigate: Navigate }) {
  const items = NAV_ITEMS.filter(i => i.view !== 'home' && (!i.agentOnly || role === 'agent'))
  return (
    <footer className="bg-(--ap-ink) text-white">
      <div className="ap-container py-12 md:py-14 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <BrandLogo tone="light" />
          <p className="text-[14px] text-white/60 mt-4 max-w-xs">Private journeys through the Indonesian archipelago.</p>
        </div>
        <div className="flex flex-col md:items-end gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {items.map(i => (
              <button key={i.view} onClick={() => navigate({ view: i.view, yachtId: null })} className="text-[14px] text-white/75 hover:text-white transition-colors">
                {i.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-white/45">© {new Date().getFullYear()} Samara Yachting · Partner portal</p>
        </div>
      </div>
    </footer>
  )
}

// ── Shared building blocks ─────────────────────────────────────────────────────────────

function PageHero({ eyebrow, title, image }: { eyebrow: string; title: string; image: string }) {
  const parallax = useParallax<HTMLDivElement>(0.25)
  return (
    <section className="relative h-[360px] md:h-[440px] flex items-end overflow-hidden bg-(--ap-ink)">
      <div ref={parallax} className="absolute inset-0 will-change-transform">
        <FadeImage src={image} dark className="object-[center_55%] motion-safe:animate-in motion-safe:zoom-in-105 duration-[1600ms]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-(--ap-ink)/90 via-(--ap-ink)/50 to-(--ap-ink)/5" />
      <div className="ap-container relative pb-10 md:pb-14 text-white">
        <p className="ap-eyebrow !text-white/70 animate-in fade-in duration-700 fill-mode-both">{eyebrow}</p>
        <h1 className="ap-h1 !text-white !text-[clamp(36px,5vw,60px)] mt-3 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-100 ease-out fill-mode-both">{title}</h1>
      </div>
    </section>
  )
}

function SectionTitle({ eyebrow, title, children, className }: {
  eyebrow: string; title: string; children?: React.ReactNode; className?: string
}) {
  return (
    <Reveal className={cn('text-center max-w-2xl mx-auto mb-10 md:mb-14', className)}>
      <p className="ap-eyebrow">{eyebrow}</p>
      <h2 className="ap-h1 !text-[clamp(30px,3.6vw,44px)] mt-3">{title}</h2>
      {children && <p className="ap-lead mt-3">{children}</p>}
    </Reveal>
  )
}

function EmptyState({ icon: Icon = FolderOpen, title, children }: { icon?: typeof FolderOpen; title: string; children?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-(--ap-line-strong) px-6 py-14 text-center">
      <div className="mx-auto h-11 w-11 bg-(--ap-surface) flex items-center justify-center">
        <Icon className="h-5 w-5 text-(--ap-muted)" strokeWidth={1.75} />
      </div>
      <p className="ap-h3 mt-4">{title}</p>
      {children && <p className="ap-small max-w-sm mx-auto mt-1.5">{children}</p>}
    </div>
  )
}

/** Photo + copy panel side by side (stacks on mobile). */
function MediaBanner({ image, imageAlt, children }: { image: string; imageAlt: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 bg-(--ap-surface)">
      <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[380px] overflow-hidden">
        <FadeImage src={image} alt={imageAlt} />
      </div>
      <div className="p-7 sm:p-10 lg:p-14 self-center">{children}</div>
    </div>
  )
}

/** Full-bleed photo tile with copy over a bottom fade — feature cards and the portfolio. */
function PhotoTile({ image, onClick, className, children }: {
  image: string; onClick: () => void; className?: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} className={cn('group relative overflow-hidden text-left bg-(--ap-ink)', className)}>
      <FadeImage src={image} dark className="transition-[opacity,transform] duration-[900ms] ease-out group-hover:scale-[1.05]" />
      <div className="absolute inset-0 bg-gradient-to-t from-(--ap-ink)/90 via-(--ap-ink)/25 to-transparent transition-opacity duration-500 group-hover:opacity-90" />
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 text-white transition-transform duration-500 ease-out group-hover:-translate-y-1">{children}</div>
    </button>
  )
}

function TileAction({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 mt-5 text-[13px] font-medium border-b border-white/60 pb-1 transition-[gap] group-hover:gap-3">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </span>
  )
}

function YachtCard({ yacht, index, onOpen }: { yacht: YachtOption; index: number; onOpen: () => void }) {
  const specs = yachtSpecs(yacht)
  return (
    <button onClick={onOpen} className="group h-full w-full text-left flex flex-col bg-white border border-(--ap-line) transition-[border-color,box-shadow,transform] duration-300 hover:border-(--ap-line-strong) hover:shadow-(--ap-shadow) hover:-translate-y-0.5">
      <div className="relative aspect-[4/3] overflow-hidden bg-(--ap-surface)">
        <FadeImage src={yachtImage(yacht, index)} alt={yacht.name} className="transition-[opacity,transform] duration-[900ms] ease-out group-hover:scale-[1.05]" />
      </div>
      <div className="p-5 md:p-6 flex-1 flex flex-col">
        <p className="ap-eyebrow !text-[11px]">{yacht.tagline || 'Samara fleet'}</p>
        <h3 className="ap-h2 !text-[22px] mt-2">{yacht.name}</h3>
        {specs && <p className="text-[13px] text-(--ap-ink)/70 mt-1">{specs}</p>}
        {yacht.description && <p className="ap-small !text-[14px] mt-3 line-clamp-3">{yacht.description}</p>}
        <span className="ap-link mt-auto pt-5">
          Explore resources <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  )
}

function NotFoundView({ navigate }: { navigate: Navigate }) {
  return (
    <div className="ap-container py-24 md:py-32">
      <EmptyState icon={Ship} title="This yacht isn't available">
        It may have been retired from the partner collection.
      </EmptyState>
      <div className="flex justify-center mt-6">
        <button className="ap-btn" onClick={() => navigate({ view: 'resources', yachtId: null })}>Back to the library</button>
      </div>
    </div>
  )
}

const SECTION = 'py-16 md:py-24'

// ── Overview ───────────────────────────────────────────────────────────────────────────

function HomeView({ role, yachts, accountName, navigate }: {
  role: PortalRole; yachts: YachtOption[]; accountName: string; navigate: Navigate
}) {
  const heroParallax = useParallax<HTMLDivElement>(0.35)
  return (
    <>
      <section className="relative h-[100svh] min-h-[600px] max-h-[1100px] flex items-end md:items-center overflow-hidden bg-(--ap-ink)">
        <div ref={heroParallax} className="absolute inset-0 will-change-transform">
          <FadeImage src={yachtImage(yachts[0], 0)} dark className="object-[center_52%] motion-safe:animate-in motion-safe:zoom-in-110 duration-[2400ms]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-(--ap-ink)/85 via-(--ap-ink)/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-(--ap-ink)/70 to-transparent md:hidden" />
        <div className="ap-container relative pb-28 md:pb-0 md:pt-[72px]">
          <div className="max-w-4xl text-white">
            <p className="ap-eyebrow !text-white/75 animate-in fade-in duration-1000 delay-200 fill-mode-both">
              {accountName ? `Welcome, ${accountName}` : 'Samara Yachting / Trade & Media'}
            </p>
            <h1 className="ap-display !text-white !text-[clamp(48px,8vw,104px)] mt-5 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300 ease-out fill-mode-both">
              Journeys worth<br />sharing.
            </h1>
            <p className="text-white/80 text-[15px] md:text-[17px] leading-relaxed mt-6 max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 ease-out fill-mode-both">
              Your dedicated space for discovering our fleet, planning private voyages, and accessing the tools to tell each yacht&apos;s story.
            </p>
            <button
              className="ap-btn ap-btn-light mt-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700 ease-out fill-mode-both"
              onClick={() => navigate({ view: 'resources', yachtId: null })}
            >
              Explore partner resources <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button
          onClick={() => document.getElementById('ap-home-next')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/75 hover:text-white transition-colors animate-in fade-in duration-1000 delay-1000 fill-mode-both"
          aria-label="Scroll to content"
        >
          <span className="text-[11px] uppercase tracking-[0.2em]">Scroll</span>
          <ChevronDown className="h-4 w-4 ap-scroll-cue" />
        </button>
      </section>

      <section id="ap-home-next" className={cn('ap-container scroll-mt-[72px]', SECTION)}>
        <SectionTitle eyebrow="The partner experience" title="Everything you need, beautifully considered.">
          One central destination for our trusted travel partners and members of the press.
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <Reveal>
          <PhotoTile image={yachtImage(yachts[1] ?? yachts[0], 1)} onClick={() => navigate({ view: 'resources', yachtId: null })} className="w-full h-[340px] md:h-[440px]">
            <p className="ap-eyebrow !text-white/70">01 / Discover</p>
            <h3 className="ap-h2 !text-white !text-[30px] mt-2">Resource Library</h3>
            <p className="text-[14px] text-white/80 mt-2 max-w-sm">Brochures, itineraries, imagery, yacht specifications, and essential trade documents.</p>
            <TileAction>Explore resources</TileAction>
          </PhotoTile>
          </Reveal>
          <Reveal delay={120}>
          {role === 'agent' ? (
            <PhotoTile image={yachtImage(yachts[2] ?? yachts[0], 2)} onClick={() => navigate({ view: 'availability', yachtId: null })} className="w-full h-[340px] md:h-[440px]">
              <p className="ap-eyebrow !text-white/70">02 / Plan</p>
              <h3 className="ap-h2 !text-white !text-[30px] mt-2">Yacht Availability</h3>
              <p className="text-[14px] text-white/80 mt-2 max-w-sm">A single starting point to explore charter windows and coordinate guest enquiries.</p>
              <TileAction>View calendar</TileAction>
            </PhotoTile>
          ) : (
            <PhotoTile image={yachtImage(yachts[2] ?? yachts[0], 2)} onClick={() => navigate({ view: 'media', yachtId: null })} className="w-full h-[340px] md:h-[440px]">
              <p className="ap-eyebrow !text-white/70">02 / Tell</p>
              <h3 className="ap-h2 !text-white !text-[30px] mt-2">Press &amp; Media</h3>
              <p className="text-[14px] text-white/80 mt-2 max-w-sm">Approved imagery, brand profiles and press resources.</p>
              <TileAction>Enter media library</TileAction>
            </PhotoTile>
          )}
          </Reveal>
        </div>
      </section>

      {yachts.length > 0 && (
        <section className={cn('ap-container !pt-0', SECTION)}>
          <SectionTitle eyebrow="Our portfolio" title="Distinct vessels. Singular experiences.">
            Explore each yacht through its own curated resource collection.
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {yachts.map((y, i) => (
              <Reveal key={y.id} delay={(i % 3) * 110}>
                <PhotoTile image={yachtImage(y, i)} onClick={() => navigate({ view: 'yacht', yachtId: y.id })} className="w-full h-[380px] md:h-[440px]">
                  <h3 className="ap-h2 !text-white !text-[26px]">{y.name}</h3>
                  <p className="text-[13px] text-white/75 mt-1.5">{yachtSpecs(y) || y.tagline}</p>
                  <TileAction>Discover collection</TileAction>
                </PhotoTile>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="bg-(--ap-surface)">
        <Reveal className="ap-container py-12 md:py-16 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="ap-eyebrow">For storytellers</p>
            <h3 className="ap-h2 mt-2">Stories from the archipelago.</h3>
            <p className="ap-small !text-[15px] mt-1.5">Discover approved imagery, brand profiles and press resources.</p>
          </div>
          <button className="ap-btn shrink-0 self-start md:self-auto" onClick={() => navigate({ view: 'media', yachtId: null })}>
            Enter media library <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </section>
    </>
  )
}

// ── Resource Library ───────────────────────────────────────────────────────────────────

function ResourcesView({ yachts, navigate }: { yachts: YachtOption[]; navigate: Navigate }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const types = useMemo(() => [...new Set(yachts.map(y => y.type).filter((t): t is string => !!t))].sort(), [yachts])

  const q = query.trim().toLowerCase()
  const filtered = yachts.filter(y =>
    (type === 'all' || y.type === type) &&
    (!q || [y.name, y.tagline, y.type].filter(Boolean).join(' ').toLowerCase().includes(q))
  )

  return (
    <>
      <PageHero eyebrow="The Samara collection" title="Resource Library" image={yachtImage(yachts[0], 0)} />
      <div className={cn('ap-container', SECTION)}>
        <SectionTitle eyebrow="Curated for our partners" title="Explore our yachts.">
          Select a yacht for marketing assets, itineraries, product details, rates, and documentation.
        </SectionTitle>

        <Reveal className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--ap-faint)" />
            <input
              className="ap-input !pl-10"
              placeholder="Search the yacht collection..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {types.length > 1 && (
            <div className="ap-scroll-x -mx-5 px-5 sm:mx-0 sm:px-0">
              <div className="flex gap-2">
                <button className="ap-chip" data-active={type === 'all'} onClick={() => setType('all')}>All collections</button>
                {types.map(t => (
                  <button key={t} className="ap-chip" data-active={type === t} onClick={() => setType(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </Reveal>

        {filtered.length === 0 ? (
          <EmptyState icon={Ship} title={yachts.length === 0 ? 'No yachts yet' : 'No yachts found'}>
            {yachts.length === 0 ? 'Please check back later.' : 'Try another search.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {filtered.map((y, i) => (
              <Reveal key={y.id} delay={(i % 3) * 110}>
                <YachtCard yacht={y} index={yachts.indexOf(y)} onOpen={() => navigate({ view: 'yacht', yachtId: y.id })} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function YachtDetailView({ role, yacht, index, navigate }: { role: PortalRole; yacht: YachtOption; index: number; navigate: Navigate }) {
  const image = yachtImage(yacht, index)
  const specs = yachtSpecs(yacht)

  const extraTabs: ExtraTab[] = [
    ...(role === 'agent' ? [{
      key: '__availability',
      label: 'Availability',
      count: 'Live calendar',
      note: 'Charter planning information is presented separately from the library. Please confirm dates directly with your Samara sales contact.',
      content: (
        <MediaBanner image={image} imageAlt={yacht.name}>
          <p className="ap-eyebrow">Reservations</p>
          <h3 className="ap-h2 mt-3">Plan a voyage aboard {yacht.name}.</h3>
          <p className="ap-small !text-[14px] mt-3 leading-relaxed">
            Review the charter calendar and the cabins still open on shared trips, then send your preferred travel dates to the reservations team.
          </p>
          <button className="ap-btn mt-6" onClick={() => navigate({ view: 'availability', yachtId: yacht.id })}>
            Open charter calendar <ArrowRight className="h-4 w-4" />
          </button>
        </MediaBanner>
      ),
    }] : []),
    {
      key: '__about',
      label: 'What We Love',
      count: 'Editorial note',
      note: 'An editorial summary to help travel designers tell the story behind each yacht.',
      content: (
        <MediaBanner image={image} imageAlt={yacht.name}>
          <p className="ap-eyebrow">Why we love it</p>
          <h3 className="ap-h2 mt-3">{yacht.name}</h3>
          <p className="text-[14px] leading-[1.75] text-(--ap-body) mt-3">
            {yacht.description || (
              <>
                {yacht.name} is a {yacht.cabinCount ? `${yacht.cabinCount}-cabin ` : ''}{(yacht.type ?? 'yacht').toLowerCase()}
                {yacht.tagline ? ` sailing ${yacht.tagline}` : ''}, pairing spacious social areas with intimate cabins —
                equally suited to family charters, dive expeditions, and press familiarization trips.
              </>
            )}
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mt-7">
            {[
              ['Type', yacht.type],
              ['Length', yacht.length ? `${yacht.length} m` : null],
              ['Cabins', yacht.cabinCount || null],
              ['Guests', yacht.capacity || null],
              ['Sailing', yacht.tagline],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="border-t border-(--ap-line-strong) pt-3">
                <dt className="text-[12px] text-(--ap-muted)">{k}</dt>
                <dd className="text-[14px] font-medium text-(--ap-ink) mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </MediaBanner>
      ),
    },
  ]

  return (
    <>
      <PageHero eyebrow="Partner resource library" title={yacht.name} image={image} />
      <div className="ap-container pb-20 md:pb-28">
        <nav className="flex items-center gap-1.5 text-[13px] text-(--ap-muted) pt-6" aria-label="Breadcrumb">
          <button className="hover:text-(--ap-ink) transition-colors" onClick={() => navigate({ view: 'resources', yachtId: null })}>Resource Library</button>
          <ChevronRight className="h-3.5 w-3.5 text-(--ap-faint)" />
          <span className="text-(--ap-ink) font-medium truncate">{yacht.name}</span>
        </nav>

        <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-6 mt-10 md:mt-12 mb-10 md:mb-12">
          <div>
            <p className="ap-eyebrow">A closer look</p>
            <h2 className="ap-h1 mt-3">{yacht.name}</h2>
            <p className="ap-lead mt-2 max-w-2xl">{[yacht.tagline, specs].filter(Boolean).join(' · ')}</p>
          </div>
          {role === 'agent' && (
            <button className="ap-btn ap-btn-secondary self-start md:self-auto shrink-0" onClick={() => navigate({ view: 'availability', yachtId: yacht.id })}>
              Check availability <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
        </Reveal>

        <MediaLibrary yachtId={yacht.id} subject={yacht.name} extraTabs={extraTabs} />
      </div>
    </>
  )
}

// ── Press & Media ──────────────────────────────────────────────────────────────────────

function MediaView({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <PageHero eyebrow="For the world's storytellers" title="Press & Media" image={FALLBACK_PHOTOS[2]} />
      <section className={cn('ap-container', SECTION)}>
        <Reveal>
        <MediaBanner image={FALLBACK_PHOTOS[3]} imageAlt="Samara at sea">
          <p className="ap-eyebrow">The stories behind the voyage</p>
          <h3 className="ap-h2 !text-[clamp(26px,3vw,34px)] mt-3">An invitation to discover.</h3>
          <p className="ap-small !text-[14px] mt-3 leading-relaxed">
            From Indonesian craftsmanship to the extraordinary places we sail, access materials designed to help journalists, editors, and collaborators tell our stories accurately and beautifully.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button className="ap-btn" onClick={() => document.getElementById('ap-press-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Browse media essentials <ArrowRight className="h-4 w-4 rotate-90" />
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={() => navigate({ view: 'resources', yachtId: null })}>
              Yacht collections
            </button>
          </div>
        </MediaBanner>
        </Reveal>

        <div id="ap-press-library" className="scroll-mt-24 mt-16 md:mt-24">
          <SectionTitle eyebrow="Media essentials" title="A story in every detail." />
          <MediaLibrary
            yachtId={null}
            emptyTitle="No press materials yet"
            emptyText="Brand and press materials haven't been published yet. Yacht-specific imagery is available in each yacht's collection."
          />
        </div>
      </section>
    </>
  )
}

// ── Yacht Availability (agents only) ───────────────────────────────────────────────────

function AvailabilityView({ yachts, selected, navigate }: {
  yachts: YachtOption[]; selected: YachtOption | null; navigate: Navigate
}) {
  return (
    <>
      <PageHero eyebrow="Plan the exceptional" title="Yacht Availability" image={yachtImage(selected ?? yachts[0], 1)} />
      <div className={cn('ap-container', SECTION, '!pt-10 md:!pt-14')}>
        {yachts.length === 0 || !selected ? (
          <EmptyState icon={CalendarDays} title="No yachts yet">Please check back later.</EmptyState>
        ) : (
          <>
            {yachts.length > 1 && (
              <div className="ap-scroll-x -mx-5 px-5 md:mx-0 md:px-0 mb-6">
                <div className="flex gap-2" role="tablist" aria-label="Yacht">
                  {yachts.map(y => (
                    <button
                      key={y.id}
                      role="tab"
                      aria-selected={y.id === selected.id}
                      className="ap-chip !h-10 !px-4"
                      data-active={y.id === selected.id}
                      onClick={() => navigate({ view: 'availability', yachtId: y.id })}
                    >
                      {y.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Reveal>
              <CalendarPanel key={selected.id} yacht={selected} />
            </Reveal>
          </>
        )}
      </div>
    </>
  )
}

// Document tile shown when a PDF's first page can't be rendered as a thumbnail.
function FileTypeBadge({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-(--ap-muted)">
      <FileText className="h-8 w-8" strokeWidth={1.5} />
      <span className="text-[11px] font-medium tracking-wide">{label}</span>
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

  if (status === 'error') return <FileTypeBadge label="PDF" />
  return (
    <>
      <canvas ref={canvasRef} className={cn('w-full h-full object-cover object-top', status !== 'ready' && 'hidden')} />
      {status === 'loading' && <div className="absolute inset-0 bg-(--ap-surface-2) animate-pulse" />}
    </>
  )
}

// Fits a book-reader page size within the (now full-screen) preview modal's available
// area. Desktop/tablet gets a real open-book two-page spread regardless of the PDF's own
// page orientation, matching the reference look. Mobile is explicitly forced to one page
// at a time instead — a 2-up spread on a narrow phone screen would shrink each page to
// near-unreadable, and react-pageflip's own responsive collapse isn't reliable enough to
// depend on here since it's always being fed spread-sized dimensions.
function computeFlipbookDims(pageWidthPt: number, pageHeightPt: number) {
  // ~56px header + ~76px page-indicator row + breathing room, taken off the actual viewport
  // rather than a fixed modal-box size now that the preview fills the whole screen.
  const isMobile = window.innerWidth < 640
  const maxContainerWidth = Math.min(1400, window.innerWidth - (isMobile ? 24 : 64))
  const maxContainerHeight = window.innerHeight - 56 - 76 - 32
  const ratio = pageHeightPt / pageWidthPt
  const width = isMobile
    ? Math.min(maxContainerWidth, maxContainerHeight / ratio)
    : Math.min(maxContainerWidth / 2, maxContainerHeight / ratio)
  return { width: Math.round(width), height: Math.round(width * ratio), spread: !isMobile }
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
const MIN_ZOOM = 1
const MAX_ZOOM = 2.5
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

function pinchDistance(touches: React.TouchList): number {
  const a = touches[0], b = touches[1]
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function PdfFlipbook({ url }: { url: string }) {
  const [pages, setPages] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [dims, setDims] = useState({ width: 400, height: 560, spread: true })
  const [pageIndex, setPageIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  // react-pageflip doesn't ship a typed ref shape — `pageFlip()` returns the underlying
  // PageFlip instance (flipNext/flipPrev/etc.), per the library's own documented usage.
  const flipRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } } | null>(null)

  // react-pageflip's own touch handling swallows single/double-finger gestures on the book
  // itself, which blocks the browser's native pinch-to-zoom right where you'd want it most —
  // so pinch is reimplemented by hand here. Capture phase + stopPropagation on a 2-finger
  // touch keeps react-pageflip from also trying to interpret it as a page-flip drag.
  const pinchStartDist = useRef<number | null>(null)
  const pinchStartZoom = useRef(1)
  function onTouchStartCapture(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.stopPropagation()
      pinchStartDist.current = pinchDistance(e.touches)
      pinchStartZoom.current = zoom
    }
  }
  function onTouchMoveCapture(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.stopPropagation()
      e.preventDefault()
      setZoom(clampZoom(pinchStartZoom.current * (pinchDistance(e.touches) / pinchStartDist.current)))
    }
  }
  function onTouchEndCapture(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchStartDist.current = null
  }

  useEffect(() => {
    let cancelled = false
    setPages(null)
    setFailed(false)
    setPageIndex(0)
    setZoom(1)
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
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100">
      <div
        className="flex-1 overflow-auto flex items-center justify-center py-4"
        onTouchStartCapture={onTouchStartCapture}
        onTouchMoveCapture={onTouchMoveCapture}
        onTouchEndCapture={onTouchEndCapture}
      >
        {/* autoSize makes the book fill this wrapper, and react-pageflip drops to single-page
            portrait whenever that width is < 2× the page width — so the wrapper must be given
            the full spread width explicitly, or a content-sized wrapper collapses it to 1 page. */}
        <div
          className="shrink-0"
          style={{ width: dims.width * zoom * (dims.spread ? 2 : 1), height: dims.height * zoom }}
        >
          <HTMLFlipBook
            ref={flipRef as any}
            width={dims.width * zoom}
            height={dims.height * zoom}
            size="fixed"
            minWidth={200} maxWidth={2500} minHeight={280} maxHeight={3500}
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
            useMouseEvents={zoom === 1}
            swipeDistance={30}
            showPageCorners
            disableFlipByClick={false}
            className=""
            style={{}}
            onFlip={(e: { data: number }) => setPageIndex(e.data)}
          >
            {pages.map((src, i) => <FlipPage key={i} src={src} />)}
          </HTMLFlipBook>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 shrink-0 py-3 bg-neutral-100 border-t">
        {pages.length > 1 && (
          <>
            <button onClick={() => flipRef.current?.pageFlip().flipPrev()} aria-label="Previous page" className="p-1.5 rounded-full bg-white shadow text-neutral-600 hover:text-black transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground w-12 text-center">{pageIndex + 1} / {pages.length}</span>
            <button onClick={() => flipRef.current?.pageFlip().flipNext()} aria-label="Next page" className="p-1.5 rounded-full bg-white shadow text-neutral-600 hover:text-black transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="w-px h-4 bg-neutral-300 mx-1" />
          </>
        )}
        <button
          onClick={() => setZoom(z => clampZoom(z - 0.25))}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          className="p-1.5 rounded-full bg-white shadow text-neutral-600 hover:text-black transition-colors disabled:opacity-40 disabled:hover:text-neutral-600"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => clampZoom(z + 0.25))}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          className="p-1.5 rounded-full bg-white shadow text-neutral-600 hover:text-black transition-colors disabled:opacity-40 disabled:hover:text-neutral-600"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}


// ── Media library (category sidebar + asset grid) ──────────────────────────────────────
// Used for a yacht's collection (that yacht's files + fleet-wide ones, as the media API
// returns them) and for Press & Media (fleet-wide files only, `yachtId: null`).

interface ExtraTab { key: string; label: string; count: string; note: string; content: React.ReactNode }

function MediaLibrary({ yachtId, subject, extraTabs = [], emptyTitle, emptyText }: {
  yachtId: string | null; subject?: string; extraTabs?: ExtraTab[]; emptyTitle?: string; emptyText?: string
}) {
  const [categories, setCategories] = useState<MediaCategoryRecord[]>([])
  const [files, setFiles] = useState<MediaFile[]>([])
  const [mediaFolders, setMediaFolders] = useState<MediaFolderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState('')
  // null = top level of the active category. Folders can nest to unlimited depth.
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [preview, setPreview] = useState<MediaFile | null>(null)

  // Mounted fresh per yacht (the page is keyed on it), so `loading` starts true — no reset here.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/agent-portal/categories').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/agent-portal/folders').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(yachtId ? `/api/agent-portal/media?yachtId=${yachtId}` : '/api/agent-portal/media').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([cats, folders, media]) => {
      if (cancelled) return
      setCategories(cats)
      setMediaFolders(folders)
      setFiles(media)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [yachtId])

  // A category with nothing uploaded is just dead-end clutter — only offer ones with files.
  const visibleCategories = useMemo(
    () => categories.filter(c => files.some(f => f.categoryId === c.id)),
    [categories, files]
  )

  const tabs = [
    ...visibleCategories.map(c => ({ key: c.id, label: c.name, count: files.filter(f => f.categoryId === c.id).length as number | null })),
    ...extraTabs.map(t => ({ key: t.key, label: t.label, count: null as number | null })),
  ]

  // Falls back to the first tab until one is picked (or if the picked one disappears).
  const activeKey = tabs.some(t => t.key === selectedKey) ? selectedKey : tabs[0]?.key ?? ''

  function selectTab(key: string) {
    setSelectedKey(key)
    setActiveFolderId(null)
  }

  const activeCategory = visibleCategories.find(c => c.id === activeKey) ?? null
  const activeExtra = extraTabs.find(t => t.key === activeKey) ?? null

  const categoryFiles = activeCategory ? files.filter(f => f.categoryId === activeCategory.id) : []
  const categoryFolders = activeCategory
    ? mediaFolders.filter(f => f.categoryId === activeCategory.id && (f.yachtId === null || (yachtId !== null && f.yachtId === yachtId)))
    : []
  const currentFiles = categoryFiles.filter(f => (f.folderId ?? null) === activeFolderId)
  const currentFolders = categoryFolders.filter(f => (f.parentId ?? null) === activeFolderId)

  // Breadcrumb trail from category root down to the open folder.
  const folderPath: MediaFolderRecord[] = []
  let cursor = activeFolderId ? categoryFolders.find(f => f.id === activeFolderId) ?? null : null
  while (cursor) {
    folderPath.unshift(cursor)
    const parentId: string | null = cursor.parentId
    cursor = parentId ? categoryFolders.find(f => f.id === parentId) ?? null : null
  }

  if (loading) return <MediaLibrarySkeleton />

  if (tabs.length === 0) {
    return <EmptyState title={emptyTitle ?? 'Nothing here yet'}>{emptyText}</EmptyState>
  }

  const heading = activeCategory?.name ?? activeExtra?.label ?? ''
  const countLabel = activeCategory ? plural(categoryFiles.length, 'resource') : activeExtra?.count ?? ''
  const note = activeCategory
    ? subject
      ? `A curated selection of ${activeCategory.name.toLowerCase()} resources for ${subject}. Select an asset to preview or download.`
      : `Approved ${activeCategory.name.toLowerCase()} for editorial and partner use. Select an asset to preview or download.`
    : activeExtra?.note ?? ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)] gap-6 md:gap-10 lg:gap-14">
      {/* Category nav: horizontal tabs on phones, sticky column from md: up. */}
      <nav aria-label="Resource categories" className="md:self-start md:sticky md:top-[96px]">
        <div className="md:hidden ap-scroll-x -mx-5 px-5 border-b border-(--ap-line)">
          <div className="flex gap-6 h-12">
            {tabs.map(t => (
              <button key={t.key} className="ap-tab" data-active={t.key === activeKey} onClick={() => selectTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="hidden md:block border-t border-(--ap-line)">
          {tabs.map(t => (
            <li key={t.key}>
              <button
                onClick={() => selectTab(t.key)}
                aria-current={t.key === activeKey ? 'true' : undefined}
                className={cn(
                  'relative w-full flex items-center justify-between gap-3 py-3.5 pl-4 pr-1 border-b border-(--ap-line) text-[14px] text-left transition-colors',
                  t.key === activeKey ? 'text-(--ap-ink) font-medium' : 'text-(--ap-muted) hover:text-(--ap-ink)'
                )}
              >
                <span
                  className={cn('absolute left-0 top-3 bottom-3 w-0.5 bg-(--ap-ink) transition-transform duration-300 origin-center', t.key === activeKey ? 'scale-y-100' : 'scale-y-0')}
                />
                <span className="truncate">{t.label}</span>
                {t.count !== null && <span className="text-[12px] text-(--ap-faint) tabular-nums">{t.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <div key={activeKey} className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="ap-h2">{heading}</h3>
            {countLabel && <span className="ap-badge">{countLabel}</span>}
          </div>
          {note && <p className="ap-note mt-4 mb-7">{note}</p>}

          {activeExtra ? activeExtra.content : activeCategory && (
            <>
              {categoryFolders.length > 0 && (folderPath.length > 0 || currentFolders.length > 0) && (
                <nav className="flex items-center gap-1.5 text-[13px] mb-5 flex-wrap" aria-label="Folders">
                  <button
                    onClick={() => setActiveFolderId(null)}
                    className={cn('flex items-center gap-1.5 transition-colors', !activeFolderId ? 'text-(--ap-ink) font-medium' : 'text-(--ap-muted) hover:text-(--ap-ink)')}
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> {activeCategory.name}
                  </button>
                  {folderPath.map(f => (
                    <span key={f.id} className="flex items-center gap-1.5">
                      <ChevronRight className="h-3.5 w-3.5 text-(--ap-faint)" />
                      <button
                        onClick={() => setActiveFolderId(f.id)}
                        className={cn('transition-colors', f.id === activeFolderId ? 'text-(--ap-ink) font-medium' : 'text-(--ap-muted) hover:text-(--ap-ink)')}
                      >
                        {f.name}
                      </button>
                    </span>
                  ))}
                </nav>
              )}

              {currentFiles.length === 0 && currentFolders.length === 0 ? (
                <EmptyState title="This folder is empty" />
              ) : (
                <div key={activeFolderId ?? 'root'} className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {currentFolders.map((folder, i) => (
                    <button
                      key={folder.id}
                      onClick={() => setActiveFolderId(folder.id)}
                      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                      className="group text-left bg-white border border-(--ap-line) flex flex-col transition-[border-color,box-shadow] hover:border-(--ap-line-strong) hover:shadow-(--ap-shadow) animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
                    >
                      <div className="aspect-[4/3] bg-(--ap-accent-soft) flex items-center justify-center">
                        <FolderOpen className="h-10 w-10 text-(--ap-accent) transition-transform duration-300 group-hover:scale-110" strokeWidth={1.5} />
                      </div>
                      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-(--ap-accent) uppercase tracking-[0.1em]">Folder · {plural(categoryFiles.filter(f => f.folderId === folder.id).length, 'file')}</p>
                          <p className="text-[14px] font-medium text-(--ap-ink) mt-1 truncate">{folder.name}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-(--ap-faint) transition-transform group-hover:translate-x-0.5 group-hover:text-(--ap-ink)" />
                      </div>
                    </button>
                  ))}
                  {currentFiles.map((f, i) => (
                    <AssetCard key={f.id} file={f} delay={Math.min(currentFolders.length + i, 8) * 40} onOpen={() => setPreview(f)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function MediaLibrarySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)] gap-6 md:gap-10 lg:gap-14" aria-busy="true" aria-label="Loading resources">
      <div className="hidden md:flex flex-col gap-0 border-t border-(--ap-line)">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="py-4 pl-4 border-b border-(--ap-line)"><div className="ap-skeleton h-3.5 w-28" /></div>
        ))}
      </div>
      <div className="md:hidden flex gap-6 h-12 items-center border-b border-(--ap-line)">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ap-skeleton h-3.5 w-20" />)}
      </div>
      <div>
        <div className="ap-skeleton h-7 w-44" />
        <div className="ap-skeleton h-4 w-full max-w-md mt-5 mb-7" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-(--ap-line)">
              <div className="ap-skeleton aspect-[4/3]" />
              <div className="p-4 space-y-2"><div className="ap-skeleton h-2.5 w-16" /><div className="ap-skeleton h-3.5 w-3/4" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AssetCard({ file, delay, onOpen }: { file: MediaFile; delay: number; onOpen: () => void }) {
  const typeLabel = file.type === 'document' ? 'PDF' : file.type === 'video' ? 'Video' : 'Image'
  const size = formatSize(file.sizeBytes)
  return (
    <button
      onClick={onOpen}
      style={{ animationDelay: `${delay}ms` }}
      className="group text-left bg-white border border-(--ap-line) flex flex-col transition-[border-color,box-shadow] hover:border-(--ap-line-strong) hover:shadow-(--ap-shadow) animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-(--ap-surface) flex items-center justify-center">
        {file.type === 'image' ? (
          <FadeImage src={file.url} alt={file.name} className="transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]" />
        ) : file.type === 'video' ? (
          <span className="h-12 w-12 bg-white flex items-center justify-center text-(--ap-ink) shadow-(--ap-shadow) transition-colors group-hover:bg-(--ap-ink) group-hover:text-white">
            <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
          </span>
        ) : file.type === 'document' ? (
          <PdfThumbnail url={file.url} />
        ) : (
          <FileText className="h-8 w-8 text-(--ap-faint)" />
        )}
      </div>
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-(--ap-accent) uppercase tracking-[0.1em]">{typeLabel}{size ? ` · ${size}` : ''}</p>
          <p className="text-[14px] font-medium text-(--ap-ink) mt-1 truncate">{file.name}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-(--ap-faint) transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-(--ap-ink)" />
      </div>
    </button>
  )
}

function PreviewModal({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const closeButton = (light: boolean) => (
    <button
      onClick={onClose}
      aria-label="Close preview"
      className={cn(
        'h-9 w-9 flex items-center justify-center transition-colors shrink-0',
        light ? 'bg-white/10 text-white hover:bg-white/20' : 'text-(--ap-muted) hover:bg-(--ap-surface) hover:text-(--ap-ink)'
      )}
    >
      <X className="h-4 w-4" />
    </button>
  )

  return (
    <div
      className={cn('fixed inset-0 bg-(--ap-overlay) backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200', file.type !== 'document' && 'p-4')}
      onClick={onClose}
    >
      {file.type === 'document' && (
        <div className="bg-white w-full h-full flex flex-col animate-in fade-in zoom-in-[0.98] duration-300" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-(--ap-line) shrink-0">
            <p className="text-[14px] font-medium text-(--ap-ink) truncate">{file.name}</p>
            <div className="flex items-center gap-2 shrink-0">
              <a href={file.url} download={file.name} className="ap-btn ap-btn-secondary ap-btn-sm">
                <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Download</span>
              </a>
              {closeButton(false)}
            </div>
          </div>
          <PdfFlipbook url={file.url} />
        </div>
      )}

      {file.type === 'image' && (
        <div className="max-w-5xl w-full animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 pb-3">
            <p className="text-[14px] text-white truncate">{file.name}</p>
            <div className="flex items-center gap-2">
              <a href={file.url} download={file.name} className="ap-btn ap-btn-glass ap-btn-sm">
                <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Download</span>
              </a>
              {closeButton(true)}
            </div>
          </div>
          <div className="flex items-center justify-center bg-black/30">
            <img src={file.url} alt={file.name} className="max-w-full max-h-[80vh] object-contain" />
          </div>
        </div>
      )}

      {file.type === 'video' && (
        <div className="max-w-5xl w-full animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 pb-3">
            <p className="text-[14px] text-white truncate">{file.name}</p>
            {closeButton(true)}
          </div>
          <div className="aspect-video bg-black">
            <iframe src={toEmbedUrl(file.url)} title={file.name} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Availability calendar ──────────────────────────────────────────────────────────────
// Live from the ERP via /api/agent-portal/calendar (bookings, open trips and blocking
// internal events) — same data and day-colour rules as the original portal calendar.

function useYachtCalendar(yachtId: string) {
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<CalendarBooking[]>([])
  const [openTrips, setOpenTrips] = useState<CalendarOpenTrip[]>([])

  // CalendarPanel is keyed on the yacht, so `loading` starts true on every switch — no reset.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/agent-portal/calendar?yachtId=${yachtId}`)
      .then(r => r.ok ? r.json() : { bookings: [], openTrips: [] })
      .then(data => {
        if (cancelled) return
        setBookings(data.bookings ?? [])
        setOpenTrips(data.openTrips ?? [])
      })
      .catch(() => { if (!cancelled) { setBookings([]); setOpenTrips([]) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [yachtId])

  return { loading, bookings, openTrips }
}

const LEGEND: { status: DayStatus; label: string; swatch: string }[] = [
  { status: 'past', label: 'Past date', swatch: 'bg-(--ap-surface-2)' },
  { status: 'available', label: 'Available', swatch: 'bg-white border border-(--ap-line-strong)' },
  { status: 'onhold', label: 'On Hold', swatch: 'bg-success' },
  { status: 'pending', label: 'Pending', swatch: 'bg-warning' },
  { status: 'booked', label: 'Booked', swatch: 'bg-destructive' },
  { status: 'shared', label: 'Shared Trip (available)', swatch: 'bg-info' },
]

function CalendarPanel({ yacht }: { yacht: YachtOption }) {
  const [view, setView] = useState<'calendar' | 'shared'>('calendar')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const { loading, bookings, openTrips } = useYachtCalendar(yacht.id)
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const thisYear = today.getFullYear()
  const [year, setYear] = useState(thisYear)
  // This year onwards only — up to the last year anything is scheduled (at least next year).
  const years = useMemo(() => {
    const lastYear = Math.max(
      thisYear + 1,
      ...bookings.map(b => new Date(b.endDate).getFullYear()),
      ...openTrips.map(t => new Date(t.endDate).getFullYear()),
    )
    return Array.from({ length: lastYear - thisYear + 1 }, (_, i) => thisYear + i)
  }, [bookings, openTrips, thisYear])
  const months = useMemo(() => monthsForYear(year), [year])

  // Shared Trip tab: upcoming departures only, soonest first, grouped by departure month.
  const upcomingTrips = useMemo(
    () => openTrips
      .filter(t => !isTripClosed(t) && new Date(t.startDate).getFullYear() <= year && new Date(t.endDate).getFullYear() >= year)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [openTrips, year]
  )
  const tripGroups = useMemo(() => {
    const groups: { label: string; trips: CalendarOpenTrip[] }[] = []
    for (const t of upcomingTrips) {
      if (onlyAvailable && t.spotsAvailable === 0) continue
      const d = new Date(t.startDate)
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      const last = groups[groups.length - 1]
      if (last?.label === label) last.trips.push(t)
      else groups.push({ label, trips: [t] })
    }
    return groups
  }, [upcomingTrips, onlyAvailable])
  const hasSharedTrip = openTrips.some(t => !isTripClosed(t))

  return (
    <div className="bg-white border border-(--ap-line)">
      <div className="px-5 sm:px-7 pt-6 sm:pt-7 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="ap-h2">Availability — {yacht.name}</h2>
          <p className="ap-small !text-[14px] mt-1">
            {view === 'calendar' ? `Booked vs. available dates for ${year}` : `Cabin-by-cabin availability for shared / open-trip departures in ${year}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Year">
          {years.map(y => (
            <button key={y} className="ap-chip !h-9" data-active={y === year} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
      </div>

      {(loading || hasSharedTrip) && (
        <div className="px-5 sm:px-7 mt-5 flex gap-7 h-11 border-b border-(--ap-line)" role="tablist">
          <button role="tab" aria-selected={view === 'calendar'} className="ap-tab" data-active={view === 'calendar'} onClick={() => setView('calendar')}>
            Availability Calendar
          </button>
          {loading ? (
            <span className="self-center ap-skeleton h-3.5 w-24" />
          ) : (
            <button role="tab" aria-selected={view === 'shared'} className="ap-tab gap-2" data-active={view === 'shared'} onClick={() => setView('shared')}>
              Shared Trip <span className="ap-badge !h-5 !px-1.5 !text-[11px] tabular-nums">{upcomingTrips.length}</span>
            </button>
          )}
        </div>
      )}

      <div className="p-5 sm:p-7">
        {loading ? (
          <CalendarSkeleton />
        ) : view === 'calendar' ? (
          <div className="animate-in fade-in duration-500">
            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-[12px] text-(--ap-muted) mb-5">
              {LEGEND.filter(l => l.status !== 'shared' || hasSharedTrip).map(l => (
                <span key={l.status} className="flex items-center gap-1.5">
                  <span className={cn('w-3 h-3 inline-block', l.swatch)} /> {l.label}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {months.map(({ monthIndex, label }, mi) => {
                const totalDays = daysInMonth(year, monthIndex)
                const startWeekday = firstWeekday(year, monthIndex)
                const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]

                return (
                  <div
                    key={label}
                    style={{ animationDelay: `${mi * 35}ms` }}
                    className="border border-(--ap-line) p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
                  >
                    <p className="text-[14px] font-semibold text-(--ap-ink) mb-3">{label}</p>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-(--ap-faint) mb-1.5">
                      {WEEKDAY_INITIALS.map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {cells.map((day, i) => {
                        if (day === null) return <div key={i} />
                        const status = statusForDate(bookings, openTrips, new Date(year, monthIndex, day), today)
                        return (
                          <div
                            key={i}
                            title={LEGEND.find(l => l.status === status)?.label}
                            className={cn('aspect-square flex items-center justify-center text-[10px] font-medium', DAY_STATUS_STYLE[status])}
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
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-[12px] text-(--ap-muted)">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 inline-block bg-white border border-(--ap-line-strong)" /> Available cabin</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 inline-block bg-destructive" /> Booked cabin</span>
              </div>
              <button className="ap-chip self-start" data-active={onlyAvailable} onClick={() => setOnlyAvailable(v => !v)}>
                Has cabins available
              </button>
            </div>

            {tripGroups.length === 0 ? (
              <EmptyState icon={CalendarDays} title={`No shared trips${onlyAvailable ? ' with open cabins' : ''} in ${year}`} />
            ) : (
              <div className="space-y-8">
                {tripGroups.map(group => (
                  <div key={group.label}>
                    <p className="ap-eyebrow !text-(--ap-muted) mb-3">{group.label}</p>
                    <div className="space-y-3">
                      {group.trips.map(trip => (
                        <div key={trip.id} className="border border-(--ap-line) p-4 sm:p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                            <div className="min-w-0">
                              <p className="text-[15px] font-semibold text-(--ap-ink)">{trip.title}</p>
                              <p className="ap-small mt-0.5">{[trip.destination, formatDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')}</p>
                            </div>
                            <span className={cn('ap-badge shrink-0 self-start', trip.spotsAvailable > 0 ? '!bg-info/10 !text-info' : '!bg-destructive/10 !text-destructive')}>
                              {trip.spotsAvailable > 0 ? `${trip.spotsAvailable} of ${trip.maxCapacity} cabins available` : 'Full'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {trip.cabinStatuses.map(cabin => (
                              <div
                                key={cabin.id}
                                className={cn(
                                  'flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-medium',
                                  cabin.bookingStatus ? 'bg-destructive text-destructive-foreground' : 'bg-white border border-(--ap-line) text-(--ap-ink)'
                                )}
                              >
                                <span className="truncate">{cabin.name}</span>
                                <span className="text-[10px] uppercase tracking-wide opacity-80 shrink-0">
                                  {cabin.bookingStatus ? 'Booked' : 'Available'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading calendar">
      <div className="flex gap-5 mb-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="ap-skeleton h-3 w-16" />)}
      </div>
      <div className="grid grid-cols-1 min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border border-(--ap-line) p-4">
            <div className="ap-skeleton h-4 w-28 mb-4" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, j) => <div key={j} className="ap-skeleton aspect-square" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
