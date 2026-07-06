'use client'

import { useMemo, useState } from 'react'
import {
  Lock, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, MapPin, FileStack,
  CalendarDays, LogOut, CheckCircle2, FileSpreadsheet, Newspaper, Quote, Check, X,
  FolderOpen, Video, Clapperboard, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const GOLD = '#bdac7e'
const GOLD_DARK = '#a8956a'

const SAMARA_LOGO = 'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png.webp'

// Dummy stand-in photography — real per-yacht photos to be dropped in later.
const DUMMY_PHOTO_A = 'https://samaraliveaboard.com/wp-content/uploads/2025/07/samara-1-main-deck-4.webp'
const DUMMY_PHOTO_B = 'https://otiumyacht.com/wp-content/uploads/2026/01/otium-2-1.webp'

type Step = 'login' | 'yacht' | 'media' | 'calendar'

interface YachtOption {
  id: string
  name: string
  tagline: string
  type: string
  cabins: number
  image: string
}

const YACHTS: YachtOption[] = [
  { id: 'samara-1', name: 'Samara I', tagline: 'Komodo · Raja Ampat', type: 'Phinisi', cabins: 10, image: DUMMY_PHOTO_A },
  { id: 'samara-2', name: 'Samara II', tagline: 'Komodo · Banda Sea', type: 'Phinisi', cabins: 8, image: DUMMY_PHOTO_B },
  { id: 'mischief', name: 'Mischief', tagline: 'Komodo', type: 'Phinisi', cabins: 6, image: DUMMY_PHOTO_A },
  { id: 'otium', name: 'Otium', tagline: 'Komodo · Raja Ampat', type: 'Schooner', cabins: 7, image: DUMMY_PHOTO_B },
]

interface MediaFile {
  id: string
  name: string
  meta: string
  image: string
  pages?: number
  file?: string
}

interface MediaCategory {
  id: string
  label: string
  icon: React.ElementType
  files: MediaFile[]
}

const MEDIA_CATEGORIES: MediaCategory[] = [
  {
    id: 'brochure', label: 'Brochures', icon: FileText,
    files: [
      { id: 'brochure-full', name: 'Full Fleet Brochure.pdf', meta: 'PDF · 8.2 MB', image: DUMMY_PHOTO_A, pages: 12, file: '/media-kit/brochure-full.pdf' },
      { id: 'brochure-onepager', name: 'One-Pager (EN).pdf', meta: 'PDF · 1.1 MB', image: DUMMY_PHOTO_B, pages: 1, file: '/media-kit/brochure-onepager.pdf' },
    ],
  },
  {
    id: 'itineraries', label: 'Itineraries', icon: MapPin,
    files: [
      { id: 'itin-komodo', name: 'Komodo & Whalesharks 4D3N.pdf', meta: 'PDF · 2.4 MB', image: DUMMY_PHOTO_A, pages: 6, file: '/media-kit/itin-komodo.pdf' },
      { id: 'itin-raja', name: 'Raja Ampat 7D6N.pdf', meta: 'PDF · 3.6 MB', image: DUMMY_PHOTO_B, pages: 8, file: '/media-kit/itin-raja.pdf' },
      { id: 'itin-banda', name: 'Banda Sea 10D9N.pdf', meta: 'PDF · 4.0 MB', image: DUMMY_PHOTO_A, pages: 9, file: '/media-kit/itin-banda.pdf' },
      { id: 'itin-spice', name: 'Spice Islands 8D7N.pdf', meta: 'PDF · 3.1 MB', image: DUMMY_PHOTO_B, pages: 7, file: '/media-kit/itin-spice.pdf' },
    ],
  },
  {
    id: 'deck-plans', label: 'Deck Plans', icon: FileStack,
    files: [
      { id: 'deck-plan', name: 'Deck Plan.pdf', meta: 'PDF · 850 KB', image: DUMMY_PHOTO_A, pages: 2, file: '/media-kit/deck-plan.pdf' },
    ],
  },
  {
    id: 'content', label: 'Content', icon: FolderOpen,
    files: [],
  },
  {
    id: 'rates', label: 'Rates & T&Cs', icon: FileSpreadsheet,
    files: [
      { id: 'rates-sheet', name: '2026 Rate Sheet.pdf', meta: 'PDF · 620 KB', image: DUMMY_PHOTO_A, pages: 3, file: '/media-kit/rates-sheet.pdf' },
      { id: 'rates-terms', name: 'Terms & Conditions.pdf', meta: 'PDF · 410 KB', image: DUMMY_PHOTO_B, pages: 5, file: '/media-kit/rates-terms.pdf' },
    ],
  },
  {
    id: 'press', label: 'Press Kit', icon: Newspaper,
    files: [
      { id: 'press-release', name: 'Press Release.pdf', meta: 'PDF · 1.8 MB', image: DUMMY_PHOTO_A, pages: 2, file: '/media-kit/press-release.pdf' },
      { id: 'press-coverage', name: 'Media Coverage Highlights.pdf', meta: 'PDF · 2.2 MB', image: DUMMY_PHOTO_B, pages: 4, file: '/media-kit/press-coverage.pdf' },
    ],
  },
  {
    id: 'testimonials', label: 'Testimonials', icon: Quote,
    files: [
      { id: 'testimonials-guest', name: 'Guest Testimonials.pdf', meta: 'PDF · 900 KB', image: DUMMY_PHOTO_A, pages: 3, file: '/media-kit/testimonials-guest.pdf' },
    ],
  },
]

interface ContentFolder {
  id: string
  label: string
  cover: string
  files: MediaFile[]
}

interface ContentSection {
  id: string
  label: string
  icon: React.ElementType
  cover: string
  folders: ContentFolder[]
}

const CONTENT_SECTIONS: ContentSection[] = [
  {
    id: 'pictures', label: 'Pictures', icon: ImageIcon, cover: DUMMY_PHOTO_A,
    folders: [
      {
        id: 'exterior', label: 'Exterior', cover: DUMMY_PHOTO_A,
        files: [
          { id: 'ext-1', name: 'Exterior 01.jpg', meta: 'JPG · 4.2 MB', image: DUMMY_PHOTO_A },
          { id: 'ext-2', name: 'Exterior 02.jpg', meta: 'JPG · 3.8 MB', image: DUMMY_PHOTO_B },
          { id: 'ext-3', name: 'Exterior 03.jpg', meta: 'JPG · 4.5 MB', image: DUMMY_PHOTO_A },
        ],
      },
      {
        id: 'main-deck', label: 'Main Deck', cover: DUMMY_PHOTO_B,
        files: [
          { id: 'deck-1', name: 'Main Deck 01.jpg', meta: 'JPG · 3.6 MB', image: DUMMY_PHOTO_B },
          { id: 'deck-2', name: 'Main Deck 02.jpg', meta: 'JPG · 4.0 MB', image: DUMMY_PHOTO_A },
        ],
      },
      {
        id: 'cabins', label: 'Cabins & Interior', cover: DUMMY_PHOTO_A,
        files: [
          { id: 'cabin-1', name: 'Master Cabin 01.jpg', meta: 'JPG · 3.9 MB', image: DUMMY_PHOTO_A },
          { id: 'cabin-2', name: 'Guest Cabin 01.jpg', meta: 'JPG · 3.5 MB', image: DUMMY_PHOTO_B },
          { id: 'cabin-3', name: 'Saloon 01.jpg', meta: 'JPG · 4.1 MB', image: DUMMY_PHOTO_A },
        ],
      },
      {
        id: 'sunset', label: 'Sunset & Lifestyle', cover: DUMMY_PHOTO_B,
        files: [
          { id: 'sunset-1', name: 'Sunset 01.jpg', meta: 'JPG · 4.4 MB', image: DUMMY_PHOTO_B },
          { id: 'sunset-2', name: 'Lifestyle 01.jpg', meta: 'JPG · 3.7 MB', image: DUMMY_PHOTO_A },
        ],
      },
    ],
  },
  {
    id: 'videos', label: 'Videos', icon: Video, cover: DUMMY_PHOTO_B,
    folders: [
      {
        id: 'walkthrough', label: 'Yacht Walkthrough', cover: DUMMY_PHOTO_A,
        files: [
          { id: 'walk-1', name: 'Full Walkthrough.mp4', meta: 'MP4 · 210 MB', image: DUMMY_PHOTO_A },
          { id: 'walk-2', name: 'Cabins Walkthrough.mp4', meta: 'MP4 · 96 MB', image: DUMMY_PHOTO_B },
        ],
      },
      {
        id: 'drone', label: 'Drone Footage', cover: DUMMY_PHOTO_B,
        files: [
          { id: 'drone-1', name: 'Aerial Sunset.mp4', meta: 'MP4 · 145 MB', image: DUMMY_PHOTO_B },
          { id: 'drone-2', name: 'Aerial Anchorage.mp4', meta: 'MP4 · 132 MB', image: DUMMY_PHOTO_A },
        ],
      },
    ],
  },
  {
    id: 'reels', label: 'Reels', icon: Clapperboard, cover: DUMMY_PHOTO_A,
    folders: [
      {
        id: 'instagram', label: 'Instagram Reels', cover: DUMMY_PHOTO_B,
        files: [
          { id: 'reel-1', name: 'Komodo Highlights.mp4', meta: 'MP4 · 38 MB', image: DUMMY_PHOTO_B },
          { id: 'reel-2', name: 'Sunset Sail.mp4', meta: 'MP4 · 29 MB', image: DUMMY_PHOTO_A },
        ],
      },
      {
        id: 'highlights', label: 'Trip Highlights', cover: DUMMY_PHOTO_A,
        files: [
          { id: 'reel-3', name: 'Guest Trip Recap.mp4', meta: 'MP4 · 44 MB', image: DUMMY_PHOTO_A },
        ],
      },
    ],
  },
]

const CALENDAR_YEAR = 2026
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function firstWeekday(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).getDay()
}

type DayStatus = 'available' | 'onhold' | 'pending' | 'booked'
interface TripBlock { start: number; end: number; status: DayStatus }

// Preview-only deterministic mock trips — stands in for real multi-day booking data.
function monthTripBlocks(yachtId: string, monthIndex: number, totalDays: number): TripBlock[] {
  const seed = yachtId.charCodeAt(0) + yachtId.length * 13 + monthIndex * 29
  const statuses: DayStatus[] = ['booked', 'onhold', 'pending', 'booked']
  const blocks: TripBlock[] = []
  let day = 1 + (seed % 3)
  let i = 0
  while (day <= totalDays) {
    const length = 3 + ((seed + i * 7) % 5) // 3–7 day trips
    const end = Math.min(day + length - 1, totalDays)
    blocks.push({ start: day, end, status: statuses[(seed + i) % statuses.length] })
    i++
    const gap = 2 + ((seed + i * 5) % 4) // 2–5 day gap between trips
    day = end + 1 + gap
  }
  return blocks
}

function statusForDay(blocks: TripBlock[], day: number): DayStatus {
  const block = blocks.find(b => day >= b.start && day <= b.end)
  return block ? block.status : 'available'
}

const DAY_STATUS_STYLE: Record<DayStatus, string> = {
  available: 'bg-white border border-neutral-200 text-neutral-500',
  onhold: 'bg-emerald-500 text-white',
  pending: 'bg-amber-400 text-white',
  booked: 'bg-red-500 text-white',
}

interface SharedTripCabin { name: string; status: 'available' | 'booked' }
interface SharedTrip { id: string; name: string; destination: string; dateRange: string; cabins: SharedTripCabin[] }

function cabinList(bookedNumbers: number[]): SharedTripCabin[] {
  return Array.from({ length: 10 }, (_, i) => {
    const n = i + 1
    return { name: n === 1 ? 'Master Cabin' : `Cabin ${n}`, status: bookedNumbers.includes(n) ? 'booked' : 'available' }
  })
}

// Preview-only — Samara I is the only vessel currently sold as shared/open-trip departures.
const SAMARA_1_SHARED_TRIPS: SharedTrip[] = [
  { id: 'st-1', name: 'Komodo & Whalesharks 4D3N', destination: 'Labuan Bajo · Komodo National Park', dateRange: 'Aug 12–15, 2026', cabins: cabinList([1, 2, 3, 7]) },
  { id: 'st-2', name: 'Komodo National Park 4D3N', destination: 'Labuan Bajo · Komodo', dateRange: 'Sep 2–5, 2026', cabins: cabinList([4, 5, 6]) },
  { id: 'st-3', name: 'Raja Ampat 7D6N', destination: 'Sorong · Raja Ampat', dateRange: 'Oct 10–16, 2026', cabins: cabinList([1, 2, 3, 4, 5, 6, 8, 9]) },
  { id: 'st-4', name: 'Banda Sea 10D9N', destination: 'Ambon · Banda Islands', dateRange: 'Nov 5–14, 2026', cabins: cabinList([2, 9]) },
]

export default function AgentPortalPage() {
  const [step, setStep] = useState<Step>('login')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [yachtId, setYachtId] = useState<string | null>(null)

  const selectedYacht = useMemo(() => YACHTS.find(y => y.id === yachtId) ?? null, [yachtId])

  function handleLogin() {
    if (!password.trim()) {
      setLoginError('Enter the password provided to you')
      return
    }
    setLoginError('')
    setStep('yacht')
  }

  function logout() {
    setPassword('')
    setLoginError('')
    setYachtId(null)
    setStep('login')
  }

  if (step === 'login') {
    return <LoginScreen password={password} setPassword={setPassword} error={loginError} onSubmit={handleLogin} />
  }

  if (step === 'yacht') {
    return <YachtScreen onSelect={(id, target) => { setYachtId(id); setStep(target) }} onLogout={logout} />
  }

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

          <div className="flex justify-end">
            <button onClick={logout} className="text-xs text-white/50 hover:text-white transition-colors shrink-0">
              Log out
            </button>
          </div>
        </div>
      </div>

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

function LoginScreen({ password, setPassword, error, onSubmit }: {
  password: string; setPassword: (v: string) => void; error: string; onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <img src={DUMMY_PHOTO_A} alt="Samara fleet" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/65" />

      <div className="relative w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl p-8">
        <img src={SAMARA_LOGO} alt="Samara" className="h-8 w-auto object-contain mx-auto mb-8" />

        <div className="mx-auto w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${GOLD}22` }}>
          <Lock className="h-5 w-5" style={{ color: GOLD_DARK }} />
        </div>
        <h1 className="text-xl font-bold mt-4 text-center">Agent Access</h1>
        <p className="text-muted-foreground text-sm mt-1.5 text-center">Enter the password shared with your agency to continue.</p>

        <div className="mt-8 space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
          <input
            type="password"
            autoFocus
            className="w-full h-12 px-3.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#bdac7e]/40 focus:border-[#bdac7e] transition-shadow"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSubmit()}
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
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

        <p className="text-[11px] text-muted-foreground text-center mt-6">Preview only — password is not yet verified against real accounts</p>
      </div>
    </div>
  )
}

function YachtScreen({ onSelect, onLogout }: { onSelect: (id: string, target: 'media' | 'calendar') => void; onLogout: () => void }) {
  const [activeId, setActiveId] = useState(YACHTS[0].id)
  const active = YACHTS.find(y => y.id === activeId)!
  const activeIndex = YACHTS.findIndex(y => y.id === activeId)

  function prevYacht() { setActiveId(YACHTS[(activeIndex - 1 + YACHTS.length) % YACHTS.length].id) }
  function nextYacht() { setActiveId(YACHTS[(activeIndex + 1) % YACHTS.length].id) }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap');`}</style>

      <img key={active.id} src={active.image} alt={active.name} className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-5 sm:p-8 z-10">
        <div className="flex items-center bg-black/30 backdrop-blur-sm rounded-full pl-3 pr-4 py-2">
          <img src={SAMARA_LOGO} alt="Samara" className="h-4 sm:h-5 w-auto object-contain" />
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-medium bg-black/30 backdrop-blur-sm px-4 py-2.5 rounded-full transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" /> Log out
        </button>
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
          {active.type} · {active.cabins} cabins · {active.tagline}
        </p>
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
      <div className="hidden sm:flex absolute bottom-8 sm:bottom-10 right-6 sm:right-10 flex-col items-end gap-3 z-10">
        <div className="flex items-end gap-3 sm:gap-4">
          <button
            onClick={prevYacht}
            aria-label="Previous yacht"
            className="self-center shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/40 hover:bg-white/10 flex items-center justify-center text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {YACHTS.map(y => (
            <button
              key={y.id}
              onClick={() => setActiveId(y.id)}
              className={cn(
                'group relative shrink-0 w-28 h-40 sm:w-36 sm:h-56 rounded-xl overflow-hidden border transition-all duration-300',
                y.id === activeId ? 'border-white/70 shadow-2xl -translate-y-2' : 'border-white/10 opacity-70 hover:opacity-100 hover:-translate-y-1'
              )}
            >
              <img src={y.image} alt={y.name} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute bottom-2.5 left-2.5 right-2.5">
                <p className="text-white/70 text-[9px] sm:text-[10px] font-medium truncate">{y.tagline}</p>
                <p className="text-white font-bold text-xs sm:text-sm leading-tight uppercase tracking-tight mt-0.5">{y.name}</p>
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
            style={{ width: `${((activeIndex + 1) / YACHTS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}


type PreviewKind = 'document' | 'image' | 'video'
interface PreviewState { file: MediaFile; kind: PreviewKind }

function MediaKitScreen({ yacht }: { yacht: YachtOption }) {
  const [activeCat, setActiveCat] = useState(MEDIA_CATEGORIES[0].id)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [contentSectionId, setContentSectionId] = useState<string | null>(null)
  const [contentFolderId, setContentFolderId] = useState<string | null>(null)

  const category = MEDIA_CATEGORIES.find(c => c.id === activeCat)!
  const activeSection = contentSectionId ? CONTENT_SECTIONS.find(s => s.id === contentSectionId) ?? null : null
  const activeFolder = activeSection && contentFolderId ? activeSection.folders.find(f => f.id === contentFolderId) ?? null : null

  function selectCategory(id: string) {
    setActiveCat(id)
    setContentSectionId(null)
    setContentFolderId(null)
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const currentFiles: MediaFile[] = activeCat === 'content' ? (activeFolder ? activeFolder.files : []) : category.files

  function toggleAll() {
    const allSelected = currentFiles.length > 0 && currentFiles.every(f => selected.has(f.id))
    setSelected(prev => {
      const next = new Set(prev)
      currentFiles.forEach(f => allSelected ? next.delete(f.id) : next.add(f.id))
      return next
    })
  }

  const allInCatSelected = currentFiles.length > 0 && currentFiles.every(f => selected.has(f.id))

  const selectionToolbar = currentFiles.length > 0 && (
    <div className="flex items-center justify-between mb-5 text-[11px] text-muted-foreground/70">
      <span>{selected.size > 0 ? `${selected.size} selected` : `${currentFiles.length} item${currentFiles.length === 1 ? '' : 's'}`}</span>
      <div className="flex items-center gap-2.5">
        <button onClick={toggleAll} className="hover:text-foreground transition-colors">
          {allInCatSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-muted-foreground/30">·</span>
        <button
          disabled={selected.size === 0}
          title="Preview only — download not yet wired up"
          className={cn('transition-colors', selected.size === 0 ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:text-foreground')}
        >
          Download{selected.size > 0 && ` (${selected.size})`}
        </button>
      </div>
    </div>
  )

  function fileCard(f: MediaFile, kind: PreviewKind) {
    const isSelected = selected.has(f.id)
    return (
      <div key={f.id} className="group">
        <div className="relative aspect-[4/3] bg-neutral-100 overflow-hidden">
          <button onClick={() => setPreview({ file: f, kind })} className="absolute inset-0 w-full h-full">
            <img src={f.image} alt={f.name} className="w-full h-full object-cover transition-opacity group-hover:opacity-90" />
            {kind === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-11 h-11 rounded-full border border-white/80 flex items-center justify-center">
                  <Play className="h-4 w-4 text-white ml-0.5" fill="white" />
                </div>
              </div>
            )}
          </button>
          <button
            onClick={() => toggle(f.id)}
            aria-label={isSelected ? 'Deselect' : 'Select'}
            className={cn(
              'absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
              isSelected ? 'bg-neutral-900 border-neutral-900' : 'border-white/90 bg-black/20 backdrop-blur-sm hover:border-white'
            )}
          >
            {isSelected && <Check className="h-3 w-3 text-white" />}
          </button>
        </div>
        <p className="text-sm mt-3 truncate">{f.name}</p>
        <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wide mt-0.5">{f.meta}</p>
      </div>
    )
  }

  return (
    <div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap');`}</style>

      <div className="text-center mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">What's Included</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2" style={{ fontFamily: "'Merriweather', serif" }}>Media Kit</h2>
        <p className="text-muted-foreground text-sm mt-3 max-w-md mx-auto">
          Everything you need to present and sell {yacht.name} to your clients
        </p>
      </div>

      <div className="flex justify-between gap-x-6 gap-y-2 flex-wrap border-b mb-8 max-w-3xl mx-auto">
        {MEDIA_CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => selectCategory(c.id)}
            className={cn(
              'relative pb-3 text-sm whitespace-nowrap transition-colors',
              activeCat === c.id ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            {c.label}
            {activeCat === c.id && <span className="absolute left-0 right-0 -bottom-px h-px" style={{ background: GOLD_DARK }} />}
          </button>
        ))}
      </div>

      {activeCat === 'content' ? (
        <div>
          <div className="flex items-center gap-2 text-xs mb-6">
            <button
              onClick={() => { setContentSectionId(null); setContentFolderId(null) }}
              className={cn('transition-colors', !activeSection ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
            >
              Content
            </button>
            {activeSection && (
              <>
                <span className="text-muted-foreground/30">/</span>
                <button
                  onClick={() => setContentFolderId(null)}
                  className={cn('transition-colors', !activeFolder ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
                >
                  {activeSection.label}
                </button>
              </>
            )}
            {activeFolder && (
              <>
                <span className="text-muted-foreground/30">/</span>
                <span className="text-foreground font-medium">{activeFolder.label}</span>
              </>
            )}
          </div>

          {!activeSection && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {CONTENT_SECTIONS.map(s => (
                <button key={s.id} onClick={() => setContentSectionId(s.id)} className="group text-left">
                  <div className="aspect-[4/3] bg-neutral-100 overflow-hidden">
                    <img src={s.cover} alt={s.label} className="w-full h-full object-cover transition-opacity group-hover:opacity-90" />
                  </div>
                  <p className="text-sm mt-3">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wide mt-0.5">{s.folders.length} folders</p>
                </button>
              ))}
            </div>
          )}

          {activeSection && !activeFolder && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {activeSection.folders.map(f => (
                <button key={f.id} onClick={() => setContentFolderId(f.id)} className="group text-left">
                  <div className="aspect-square bg-neutral-100 overflow-hidden">
                    <img src={f.cover} alt={f.label} className="w-full h-full object-cover transition-opacity group-hover:opacity-90" />
                  </div>
                  <p className="text-sm mt-3 leading-tight">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wide mt-0.5">{f.files.length} files</p>
                </button>
              ))}
            </div>
          )}

          {activeFolder && (
            <>
              {selectionToolbar}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8">
                {activeFolder.files.map(f => fileCard(f, activeSection!.id === 'pictures' ? 'image' : 'video'))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {selectionToolbar}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8">
            {category.files.map(f => fileCard(f, 'document'))}
          </div>
        </>
      )}

      <div className="mt-16 -mb-10 relative left-1/2 -translate-x-1/2 w-screen bg-neutral-900 py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
          <div className="aspect-[4/3] bg-neutral-800 overflow-hidden order-2 sm:order-1">
            <img src={yacht.image} alt={yacht.name} className="w-full h-full object-cover" />
          </div>
          <div className="order-1 sm:order-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">About this yacht</p>
            <h3 className="text-xl font-bold mt-2 text-white" style={{ fontFamily: "'Merriweather', serif" }}>{yacht.name}</h3>
            <p className="text-sm text-white/70 mt-3 leading-relaxed">
              {yacht.name} is a {yacht.cabins}-cabin {yacht.type.toLowerCase()} sailing {yacht.tagline}. Thoughtfully
              designed for both comfort and adventure, she pairs spacious social areas with intimate cabins — equally
              suited to family charters, dive expeditions, and press familiarization trips. This media kit gives your
              clients everything they need to picture their journey aboard her, from detailed deck plans to real
              onboard photography.
            </p>
          </div>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreview(null)}
        >
          {preview.kind === 'document' && (
            <div className="bg-white w-full max-w-3xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0">
                <p className="text-sm font-medium truncate">{preview.file.name}</p>
                <div className="flex items-center gap-4 shrink-0">
                  {preview.file.file && (
                    <a
                      href={preview.file.file}
                      download={preview.file.name}
                      className="text-xs font-semibold hover:underline underline-offset-2"
                      style={{ color: GOLD_DARK }}
                    >
                      Download
                    </a>
                  )}
                  <button onClick={() => setPreview(null)} aria-label="Close preview" className="text-muted-foreground/70 hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {preview.file.file ? (
                <iframe src={preview.file.file} title={preview.file.name} className="flex-1 w-full bg-neutral-100" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No file attached yet</div>
              )}
            </div>
          )}

          {preview.kind === 'image' && (
            <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-end pb-3">
                <button onClick={() => setPreview(null)} aria-label="Close preview" className="text-white/70 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="aspect-[4/3] bg-neutral-100">
                <img src={preview.file.image} alt={preview.file.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between pt-3">
                <div>
                  <p className="text-sm text-white">{preview.file.name}</p>
                  <p className="text-[11px] text-white/60 uppercase tracking-wide mt-0.5">{preview.file.meta}</p>
                </div>
                <button disabled title="Preview only — download not yet wired up" className="text-xs text-white/40 cursor-not-allowed">
                  Download
                </button>
              </div>
            </div>
          )}

          {preview.kind === 'video' && (
            <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-end pb-3">
                <button onClick={() => setPreview(null)} aria-label="Close preview" className="text-white/70 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative aspect-video bg-neutral-900">
                <img src={preview.file.image} alt={preview.file.name} className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full border border-white/80 flex items-center justify-center">
                    <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3">
                <div>
                  <p className="text-sm text-white">{preview.file.name}</p>
                  <p className="text-[11px] text-white/60 uppercase tracking-wide mt-0.5">{preview.file.meta}</p>
                </div>
                <button disabled title="Preview only — download not yet wired up" className="text-xs text-white/40 cursor-not-allowed">
                  Download
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CalendarScreen({ yacht }: { yacht: YachtOption }) {
  const hasSharedTrip = yacht.id === 'samara-1'
  const [view, setView] = useState<'calendar' | 'shared'>('calendar')

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight">Availability — {yacht.name}</h2>
      <p className="text-muted-foreground text-sm mt-1 mb-5">
        {view === 'calendar' ? `Booked vs. available dates for ${CALENDAR_YEAR} — no guest details are shown` : 'Cabin-by-cabin availability for upcoming shared/open-trip departures'}
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

      {view === 'calendar' ? (
        <>
          <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground mb-6">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-white border border-neutral-300" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-emerald-500" /> On Hold</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-amber-400" /> Pending</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block bg-red-500" /> Booked</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {MONTH_NAMES.map((name, monthIndex) => {
              const totalDays = daysInMonth(CALENDAR_YEAR, monthIndex)
              const startWeekday = firstWeekday(CALENDAR_YEAR, monthIndex)
              const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]
              const blocks = monthTripBlocks(yacht.id, monthIndex, totalDays)

              return (
                <div key={name} className="bg-white border rounded-xl p-4">
                  <p className="text-sm font-semibold mb-3">{name}</p>

                  <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-muted-foreground mb-1.5">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={i} />
                      const status = statusForDay(blocks, day)
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
          {SAMARA_1_SHARED_TRIPS.map(trip => (
            <div key={trip.id} className="bg-white border rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                  <p className="font-semibold text-sm">{trip.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{trip.destination}</p>
                </div>
                <span className="text-xs text-muted-foreground">{trip.dateRange}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {trip.cabins.map(cabin => (
                  <div
                    key={cabin.name}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium',
                      cabin.status === 'available' ? 'bg-white border border-neutral-200 text-neutral-600' : 'bg-red-500 text-white'
                    )}
                  >
                    <span className="truncate">{cabin.name}</span>
                    <span className="text-[9px] uppercase tracking-wide opacity-80 shrink-0">
                      {cabin.status === 'available' ? 'Available' : 'Booked'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        Sample data for preview — will be wired to live booking data
      </div>
    </div>
  )
}
