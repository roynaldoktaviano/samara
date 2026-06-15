'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import {
  User, Users, Ship, Map, Plus, Trash2,
  ChevronLeft, ChevronRight, Check, Search, X, Loader2, Tag, AlertCircle, CalendarIcon, Crown, ChevronsUpDown,
} from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { NATIONALITIES } from '@/lib/nationalities'

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Source  = 'AGENT' | 'DIRECT'
type TripType = 'PRIVATE_CHARTER' | 'OPEN_TRIP'
type Phase   = 'source' | 'agentInfo' | 'tripType' | 'steps'

interface YachtOpt   { id: string; name: string; model?: string; capacity: number; dailyRate: number; status: string; canDiving?: boolean; extraBedTiers?: { nights: number; price: number }[] }
interface AgentOpt        { id: string; name: string; commissionOpenTrip: number; commissionPrivateCharter: number }
interface AgentContactOpt { id: string; name: string; email?: string | null; whatsapp?: string | null }
interface CustomerOpt{ id: string; name: string; phone?: string; email?: string; isChild?: boolean; dateOfBirth?: string | null }
interface CabinOpt   { id: string; name: string; capacity: number; price: number; extraBeds: number; deck?: string; bedType?: string; pricingTiers?: { nights: number; price: number }[] }
interface OpenTripOpt{
  id: string; title: string; description?: string
  yachtId: string; startDate: string; endDate: string
  destination: string; pricePerCabin: number
  maxCapacity: number; spotsAvailable: number; status: string
  yacht: { name: string }
  _count?: { bookings: number }
}

interface SelectedGuest {
  customerId: string
  name: string
  phone?: string
  cabinId: string
  isLead: boolean
  isChild?: boolean
  isInfant?: boolean
}
interface ServiceEntry { tempId: string; name: string; price: string; qty: string }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
  preselectedDate?: string
  preselectedOpenTripId?: string
  preselectedYachtId?: string
  completeBookingId?: string  // if set, wizard is in "complete on-hold booking" mode
}

function getAgeYears(dob: string | Date | null | undefined): number | null {
  if (!dob) return null
  const d = typeof dob === 'string' ? new Date(dob) : dob
  if (isNaN(d.getTime())) return null
  return new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970
}

/* ─── Step nav config ────────────────────────────────────────────────────── */
const STEPS = [
  { num: 1, label: 'Trip Info' },
  { num: 2, label: 'Guests & Cabins' },
  { num: 3, label: 'Pricing' },
]

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const ACCENT = '#bdac7e'

/* ─── Currency ───────────────────────────────────────────────────────────── */
type CurrencyCode = 'USD' | 'EUR' | 'IDR'

const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string; rateToUSD: number; step: number; decimals: number }> = {
  USD: { symbol: '$',  label: 'USD — US Dollar',           rateToUSD: 1,        step: 100,    decimals: 2 },
  EUR: { symbol: '€',  label: 'EUR — Euro',                rateToUSD: 1.09,     step: 100,    decimals: 2 },
  IDR: { symbol: 'Rp', label: 'IDR — Indonesian Rupiah',   rateToUSD: 0.000063, step: 100000, decimals: 0 },
}

const fmtAmt   = (n: number, c: CurrencyCode) =>
  `${CURRENCIES[c].symbol}${n.toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[c].decimals })}`

const TODAY = new Date().toISOString().split('T')[0]

export function BookingWizard({ open, onOpenChange, onSuccess, preselectedDate, preselectedOpenTripId, preselectedYachtId, completeBookingId }: Props) {
  /* phase state */
  const [phase,   setPhase]   = useState<Phase>('source')
  const [source,  setSource]  = useState<Source | null>(null)
  const [tripType,setTrip]    = useState<TripType | null>(null)
  const [step,    setStep]    = useState(1)

  /* agent state */
  const [agentId,        setAgentId]        = useState('')
  const [agentContactId, setAgentContactId] = useState('')
  const [agentContacts,  setAgentContacts]  = useState<AgentContactOpt[]>([])
  const [agentOpen,      setAgentOpen]      = useState(false)
  const [contactOpen,    setContactOpen]    = useState(false)
  const [addingContact,  setAddingContact]  = useState(false)
  const [newCName,       setNewCName]       = useState('')
  const [newCPhone,      setNewCPhone]      = useState('')
  const [newCEmail,      setNewCEmail]      = useState('')
  const [savingContact,  setSavingContact]  = useState(false)

  /* step-1 PC */
  const [yachtId,    setYachtId]    = useState('')
  const [startDate,  setStart]      = useState(preselectedDate ?? '')
  const [endDate,    setEnd]        = useState('')
  const [destination,setDest]       = useState('')
  const [notes,      setNotes]      = useState('')

  /* step-1 OT */
  const [openTripId, setOTId]   = useState('')

  /* on-hold mode */
  const [isOnHold,           setIsOnHold]           = useState(false)
  const [holdGuestName,      setHoldGuestName]      = useState('')
  const [holdGuestPhone,     setHoldGuestPhone]     = useState('')
  const [holdSearch,         setHoldSearch]         = useState('')
  const [holdCustomerId,     setHoldCustomerId]     = useState<string | null>(null)
  const [holdIsNew,          setHoldIsNew]          = useState(false)
  const [holdCabinId,        setHoldCabinId]        = useState<string | null>(null)
  const [holdUntil,          setHoldUntil]          = useState('')

  /* step-2 */
  const [guests,    setGuests]  = useState<SelectedGuest[]>([])
  const [custSearch,setCSearch]       = useState('')
  const [custFocused,setCustFocused]  = useState(false)
  const [crewReq,   setCrewReq] = useState(false)
  const [hasDiving, setHasDiving] = useState(false)

  /* step-3 */
  const [currency,       setCurrency]   = useState<CurrencyCode>('USD')
  const [basePrice,      setBase]       = useState('')
  const [discPct,        setDisc]       = useState('0')
  const [discMode,       setDiscMode]   = useState<'percent' | 'amount'>('percent')
  const [discFixed,      setDiscFixed]  = useState('')
  const [services,       setSvc]        = useState<ServiceEntry[]>([])
  const [deposit,        setDeposit]    = useState('')
  const [depositDueDate, setDepDue]     = useState('')
  const [finalDueDate,   setFinalDue]   = useState('')

  /* exchange rate (manual, non-USD only) */
  const [manualRate,   setManualRate]   = useState<number>(1)
  const [baseFocused,  setBaseFocused]  = useState(false)
  const [svcFocused,   setSvcFocused]   = useState<string | null>(null)

  /* voucher */
  const [voucherApplied, setVoucherApplied] = useState<{ id: string; code: string; name: string; type: string; value: number } | null>(null)
  const [voucherError,   setVoucherError]   = useState('')

  /* remote data */
  const [yachts,    setYachts]    = useState<YachtOpt[]>([])
  const [agents,    setAgents]    = useState<AgentOpt[]>([])
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [cabins,    setCabins]    = useState<CabinOpt[]>([])
  const [openTrips, setOpenTrips] = useState<OpenTripOpt[]>([])
  const [openTripsLoading, setOpenTripsLoading] = useState(false)
  const [tripSearch,   setTripSearch]   = useState('')
  const [tripPage,     setTripPage]     = useState(1)
  const [tripSort,     setTripSort]     = useState<'nearest'|'furthest'|'longest'|'shortest'>('nearest')
  const [tripDateFrom, setTripDateFrom] = useState('')
  const [tripDateTo,   setTripDateTo]   = useState('')
  const [activeVouchers, setActiveVouchers] = useState<Array<{ id: string; code: string; name: string; type: string; value: number; minBooking: number | null; maxUses: number | null; usedCount: number }>>([])
  const [bookedCustomerIds,     setBookedCustomerIds]     = useState<string[]>([])
  const [existingCabinOccupancy,setExistingCabinOccupancy]= useState<Record<string,number>>({})
  const [cabinSalesperson,      setCabinSalesperson]      = useState<Record<string,string>>({})
  // original cabin occupancy from the on-hold booking being completed — excluded from "blocked by other" check
  const [originalHoldCabins,    setOriginalHoldCabins]    = useState<Record<string,number>>({})
  const [submitting,       setSubmitting]        = useState(false)
  const [completeLoading,  setCompleteLoading]   = useState(false)

  /* extra beds per cabin (cabinId → requested count) */
  const [cabinExtraBeds, setCabinExtraBeds] = useState<Record<string, number>>({})

  /* yacht date conflict — null = no conflict, isOpenTrip = true means it's overrideable */
  const [yachtConflict, setYachtConflict] = useState<{ name: string; start: string; end: string; isOpenTrip?: boolean } | null>(null)

  /* open trip conflict (private charter override) */
  type OpenTripConflict = { id: string; title: string; startDate: string; endDate: string }
  const [openTripConflicts, setOpenTripConflicts] = useState<OpenTripConflict[]>([])
  const [showOpenTripConflictDialog, setShowOpenTripConflictDialog] = useState(false)

  /* blocked date ranges for the selected yacht (for calendar display) */
  const [blockedRanges,       setBlockedRanges]       = useState<{ from: Date; to: Date }[]>([])
  const [openTripFreeRanges,  setOpenTripFreeRanges]  = useState<{ from: Date; to: Date }[]>([])
  const [startPickerOpen, setStartPickerOpen] = useState(false)
  const [endPickerOpen,   setEndPickerOpen]   = useState(false)

  /* DnD state */
  const [dragGuest,  setDragGuest]  = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [dropError,  setDropError]  = useState<string | null>(null)

  /* quick guest creation */
  const [showQuickAdd,        setShowQuickAdd]        = useState(false)
  const [quickFirstName,      setQuickFirstName]      = useState('')
  const [quickLastName,       setQuickLastName]       = useState('')
  const [quickDob,            setQuickDob]            = useState('')
  const [quickPhone,          setQuickPhone]          = useState('')
  const [quickEmail,          setQuickEmail]          = useState('')
  const [quickPhoneSameAsLead, setQuickPhoneSameAsLead] = useState(false)
  const [quickEmailSameAsLead, setQuickEmailSameAsLead] = useState(false)
  const [quickSetAsLead,       setQuickSetAsLead]       = useState(false)
  const [quickIsChild,         setQuickIsChild]         = useState(false)
  const [quickNationality,     setQuickNationality]     = useState('')
  const [quickNatOpen,         setQuickNatOpen]         = useState(false)
  const [quickNatQuery,        setQuickNatQuery]        = useState('')
  const [quickSaving,         setQuickSaving]         = useState(false)

  /* pre-select open trip from calendar — still ask source first */
  useEffect(() => {
    if (!open || !preselectedOpenTripId) return
    setTrip('OPEN_TRIP')
    setOTId(preselectedOpenTripId)
  }, [open, preselectedOpenTripId])

  /* pre-select yacht when opened from calendar with a specific yacht */
  useEffect(() => {
    if (!open || !preselectedYachtId) return
    setYachtId(preselectedYachtId)
    setTrip('PRIVATE_CHARTER')
  }, [open, preselectedYachtId])

  /* complete on-hold booking: pre-fill trip info and jump to step 2.
     Fetches booking, cabins, and occupancy all inline so the loading screen
     stays up until every piece of data is ready. */
  useEffect(() => {
    if (!open || !completeBookingId) return
    setCompleteLoading(true)
    ;(async () => {
      try {
        const b = await fetch(`/api/bookings/${completeBookingId}`).then(r => r.json())
        const bTripType: TripType = b.tripType ?? 'PRIVATE_CHARTER'
        setSource(b.source ?? 'DIRECT')
        setTrip(bTripType)
        setYachtId(b.yacht?.id ?? b.yachtId ?? '')
        setOTId(b.openTripId ?? '')
        setStart(b.startDate?.split('T')[0] ?? '')
        setEnd(b.endDate?.split('T')[0] ?? '')
        setDest(b.destination ?? '')
        setNotes(b.notes ?? '')
        setAgentId(b.agentId ?? '')
        setAgentContactId(b.agentContactId ?? '')
        setIsOnHold(false)
        setPhase('steps')

        if (b.guests?.length) {
          setGuests(b.guests.map((g: any) => ({
            customerId: g.customer?.id ?? g.customerId,
            name:       g.customer?.name ?? '',
            phone:      g.customer?.phone ?? '',
            cabinId:    g.cabin?.id ?? g.cabinId ?? '',
            isLead:     g.isLead ?? true,
          })))
          const holdCabOcc: Record<string, number> = {}
          b.guests.forEach((g: any) => {
            const cid = g.cabin?.id ?? g.cabinId
            if (cid) holdCabOcc[cid] = (holdCabOcc[cid] ?? 0) + 1
          })
          setOriginalHoldCabins(holdCabOcc)
        } else {
          setGuests([])
          setOriginalHoldCabins({})
        }
        setStep(2)

        // Fetch cabins + occupancy inline so the loading screen doesn't drop early
        if (bTripType === 'OPEN_TRIP' && b.openTripId) {
          const otData = await fetch(`/api/open-trips/${b.openTripId}`).then(r => r.json()).catch(() => null)
          if (otData) {
            const ids: string[] = []
            const occ: Record<string, number> = {}
            const sales: Record<string, string> = {}
            if (Array.isArray(otData.bookings)) {
              otData.bookings.forEach((bk: any) => {
                if (bk.customerId) ids.push(bk.customerId)
                bk.guests?.forEach((g: any) => {
                  if (g.customerId) ids.push(g.customerId)
                  const cabId = g.cabin?.id ?? g.cabinId
                  if (cabId) occ[cabId] = (occ[cabId] ?? 0) + 1
                })
              })
            }
            if (Array.isArray(otData.cabins)) {
              otData.cabins.forEach((c: any) => {
                if (c.occupied > 0) occ[c.id] = c.occupied
                if (c.salesperson) sales[c.id] = c.salesperson
                c.guests?.forEach((g: any) => { if (g.id) ids.push(g.id) })
              })
            }
            setBookedCustomerIds([...new Set(ids)])
            setExistingCabinOccupancy(occ)
            setCabinSalesperson(sales)

            const cabinYachtId = otData.yachtId ?? b.yacht?.id ?? b.yachtId ?? ''
            if (cabinYachtId) {
              const cabinsData = await fetch(`/api/cabins?yachtId=${cabinYachtId}`).then(r => r.json()).catch(() => [])
              setCabins(Array.isArray(cabinsData) ? cabinsData : [])
            }
          }
        } else if (bTripType === 'PRIVATE_CHARTER') {
          const cabinYachtId = b.yacht?.id ?? b.yachtId ?? ''
          if (cabinYachtId) {
            const cabinsData = await fetch(`/api/cabins?yachtId=${cabinYachtId}`).then(r => r.json()).catch(() => [])
            setCabins(Array.isArray(cabinsData) ? cabinsData : [])
          }
        }
      } catch {}
      setCompleteLoading(false)
    })()
  }, [open, completeBookingId])

  /* fetch on open */
  useEffect(() => {
    if (!open) return
    setOpenTripsLoading(true)
    Promise.allSettled([
      fetch('/api/yachts').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/customers').then(r => r.json()),
      fetch('/api/open-trips').then(r => r.json()),
      fetch('/api/vouchers').then(r => r.json()),
    ]).then(([y, a, c, ot, v]) => {
      if (y.status  === 'fulfilled') setYachts(Array.isArray(y.value)  ? y.value  : [])
      if (a.status  === 'fulfilled') setAgents(Array.isArray(a.value)  ? a.value  : [])
      if (c.status  === 'fulfilled') setCustomers(Array.isArray(c.value)? c.value : [])
      if (ot.status === 'fulfilled') setOpenTrips(Array.isArray(ot.value)? ot.value: [])
      if (v.status  === 'fulfilled') setActiveVouchers(Array.isArray(v.value) ? v.value.filter((x: any) => x.isActive) : [])
      setOpenTripsLoading(false)
    })
  }, [open])

  /* fetch agent contacts when agentId changes */
  useEffect(() => {
    if (!agentId) { setAgentContacts([]); setAgentContactId(''); return }
    fetch(`/api/agents/${agentId}/contacts`)
      .then(r => r.json())
      .then(d => setAgentContacts(Array.isArray(d) ? d : []))
      .catch(() => setAgentContacts([]))
  }, [agentId])

  const handleAddContact = async () => {
    if (!newCName.trim() || !agentId) return
    setSavingContact(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCName.trim(), whatsapp: newCPhone.trim() || null, email: newCEmail.trim() || null }),
      })
      if (!res.ok) return
      const c = await res.json()
      setAgentContacts(prev => [...prev, c])
      setAgentContactId(c.id)
      setAddingContact(false)
      setNewCName(''); setNewCPhone(''); setNewCEmail('')
    } finally {
      setSavingContact(false)
    }
  }

  /* fetch cabins when yacht changes — skipped when completing an on-hold booking (handled inline) */
  useEffect(() => {
    if (completeBookingId) return
    const id = tripType === 'PRIVATE_CHARTER' ? yachtId
             : openTrips.find(t => t.id === openTripId)?.yachtId ?? ''
    if (!id) { setCabins([]); return }
    fetch(`/api/cabins?yachtId=${id}`).then(r => r.json()).then(d => {
      setCabins(Array.isArray(d) ? d : [])
    })
  }, [yachtId, openTripId, tripType, openTrips, completeBookingId])

  /* fetch already-booked customers for selected open trip — skipped when completing an on-hold booking (handled inline) */
  useEffect(() => {
    if (completeBookingId) return
    if (!openTripId) { setBookedCustomerIds([]); setExistingCabinOccupancy({}); setCabinSalesperson({}); return }
    fetch(`/api/open-trips/${openTripId}`)
      .then(r => r.json())
      .then((data: any) => {
        const ids: string[] = []
        const occ: Record<string, number> = {}
        const sales: Record<string, string> = {}
        if (Array.isArray(data?.bookings)) {
          data.bookings.forEach((b: any) => {
            if (b.customerId) ids.push(b.customerId)
            b.guests?.forEach((g: any) => {
              if (g.customerId) ids.push(g.customerId)
              const cabId = g.cabin?.id ?? g.cabinId
              if (cabId) occ[cabId] = (occ[cabId] ?? 0) + 1
            })
          })
        }
        // Use pre-computed cabin occupancy (source of truth — no SALES filter)
        if (Array.isArray(data?.cabins)) {
          data.cabins.forEach((c: any) => {
            if (c.occupied > 0) occ[c.id] = c.occupied
            if (c.salesperson) sales[c.id] = c.salesperson
            c.guests?.forEach((g: any) => { if (g.id) ids.push(g.id) })
          })
        }
        setBookedCustomerIds([...new Set(ids)])
        setExistingCabinOccupancy(occ)
        setCabinSalesperson(sales)
      })
      .catch(() => {})
  }, [openTripId, completeBookingId])

  /* yacht date conflict check — Private Charter only */
  useEffect(() => {
    if (tripType !== 'PRIVATE_CHARTER' || !yachtId || !startDate || !endDate) {
      setYachtConflict(null)
      return
    }
    const s = new Date(startDate).getTime()
    const e = new Date(endDate).getTime()
    const overlaps = (a: string, b: string) => new Date(a).getTime() < e && new Date(b).getTime() > s

    // Check existing bookings for this yacht (hard block)
    fetch(`/api/bookings?yachtId=${yachtId}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) { setYachtConflict(null); return }
        const bookingConflict = data.find(b =>
          b.status !== 'cancelled' &&
          b.tripType !== 'OPEN_TRIP' &&
          overlaps(b.startDate, b.endDate)
        )
        if (bookingConflict) {
          setYachtConflict({ name: bookingConflict.bookingCode, start: bookingConflict.startDate, end: bookingConflict.endDate, isOpenTrip: false })
          return
        }
        // Check open trips — soft warning only (overrideable)
        const otConflict = openTrips.find(t =>
          t.yachtId === yachtId &&
          t.status !== 'cancelled' &&
          overlaps(t.startDate, t.endDate)
        )
        setYachtConflict(otConflict
          ? { name: otConflict.title, start: otConflict.startDate, end: otConflict.endDate, isOpenTrip: true }
          : null
        )
      })
      .catch(() => setYachtConflict(null))
  }, [tripType, yachtId, startDate, endDate, openTrips])

  /* load blocked date ranges for the selected yacht (calendar display) */
  useEffect(() => {
    if (!yachtId || tripType !== 'PRIVATE_CHARTER') {
      setBlockedRanges([]); setOpenTripFreeRanges([]); return
    }
    const yachtOpenTrips = openTrips.filter(t => t.yachtId === yachtId && t.status !== 'cancelled')
    // open trips with ≥1 booking → red (blocked); 0 bookings → blue (available but scheduled)
    const otBooked = yachtOpenTrips
      .filter(t => (t._count?.bookings ?? 0) > 0)
      .map(t => ({ from: new Date(t.startDate), to: new Date(t.endDate) }))
    const otFree = yachtOpenTrips
      .filter(t => (t._count?.bookings ?? 0) === 0)
      .map(t => ({ from: new Date(t.startDate), to: new Date(t.endDate) }))
    setOpenTripFreeRanges(otFree)
    fetch(`/api/bookings?yachtId=${yachtId}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) { setBlockedRanges(otBooked); return }
        const bkRanges = data
          .filter(b => b.status !== 'cancelled')
          .map(b => ({ from: new Date(b.startDate), to: new Date(b.endDate) }))
        setBlockedRanges([...otBooked, ...bkRanges])
      })
      .catch(() => setBlockedRanges(otBooked))
  }, [yachtId, tripType, openTrips])

  /* auto base price — computed in USD then converted to selected currency */
  useEffect(() => {
    let usdPrice = 0
    const ot = openTrips.find(t => t.id === openTripId)
    if (tripType === 'OPEN_TRIP' && ot) {
      const nights = Math.max(1, Math.ceil(
        (new Date(ot.endDate).getTime() - new Date(ot.startDate).getTime()) / 86400000
      ))
      const assignedCabinIds = [...new Set(guests.filter(g => g.cabinId).map(g => g.cabinId))]
      const cabinTotal = assignedCabinIds.reduce((sum, id) => {
        const c = cabins.find(x => x.id === id)
        if (!c) return sum
        const tier = c.pricingTiers?.find(t => t.nights === nights)
        return sum + (tier ? tier.price : c.price * nights)
      }, 0)
      usdPrice = cabinTotal > 0
        ? cabinTotal
        : assignedCabinIds.length * (ot.pricePerCabin ?? 0)
      // add extra bed cost
      const yacht = yachts.find(x => x.id === ot.yachtId)
      const extraTier = yacht?.extraBedTiers?.find(t => t.nights === nights)
      if (extraTier) {
        const totalExtraBeds = Object.values(cabinExtraBeds).reduce((s, n) => s + n, 0)
        usdPrice += totalExtraBeds * extraTier.price
      }
    } else if (tripType === 'PRIVATE_CHARTER') {
      const y = yachts.find(x => x.id === yachtId)
      if (y && startDate && endDate) {
        const days = Math.max(1, Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
        ))
        usdPrice = y.dailyRate * days
        // add extra bed cost for private charter
        const nights = Math.max(1, days - 1)
        const extraTier = y.extraBedTiers?.find(t => t.nights === nights)
          ?? (y.extraBedTiers && y.extraBedTiers.length > 0
            ? y.extraBedTiers.reduce((a, b) => Math.abs(b.nights - nights) < Math.abs(a.nights - nights) ? b : a)
            : undefined)
        if (extraTier) {
          const totalExtraBeds = Object.values(cabinExtraBeds).reduce((s, n) => s + n, 0)
          usdPrice += totalExtraBeds * extraTier.price
        }
      }
    }
    if (usdPrice > 0) {
      setBase(usdPrice.toFixed(2))
    }
  }, [tripType, openTripId, yachtId, startDate, endDate, guests, cabins, yachts, openTrips, cabinExtraBeds])

  /* sync start date whenever wizard opens */
  useEffect(() => {
    if (!open) return
    setStart(preselectedDate ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* reset on close */
  useEffect(() => {
    if (open) return
    setPhase('source'); setSource(null); setTrip(null); setStep(1)
    setAgentId('')
    setYachtId(''); setStart(''); setEnd(''); setDest(''); setNotes('')
    setOTId(''); setGuests([]); setCSearch(''); setCustFocused(false); setCrewReq(false); setHasDiving(false)
    setCurrency('USD'); setBase(''); setDisc('0'); setDiscMode('percent'); setDiscFixed(''); setSvc([]); setDeposit(''); setDepDue(''); setFinalDue('')
    setManualRate(1); setBaseFocused(false); setSvcFocused(null)
    setVoucherApplied(null); setVoucherError('')
    setBookedCustomerIds([]); setExistingCabinOccupancy({})
    setOriginalHoldCabins({})
    setCabinExtraBeds({})
    setDragGuest(null); setDropTarget(null); setDropError(null)
    setShowQuickAdd(false); setQuickFirstName(''); setQuickLastName(''); setQuickPhone(''); setQuickEmail('')
    setBlockedRanges([]); setOpenTripFreeRanges([]); setStartPickerOpen(false); setEndPickerOpen(false)
  }, [open])

  /* voucher remove */
  const removeVoucher = () => {
    setVoucherApplied(null)
    setVoucherError('')
    setDisc('0')
  }

  /* computed */
  const discountAmt = useMemo(() => {
    const b = parseFloat(basePrice) || 0
    if (voucherApplied) {
      return voucherApplied.type === 'PERCENTAGE' ? b * voucherApplied.value / 100 : voucherApplied.value
    }
    if (discMode === 'amount') return parseFloat(discFixed) || 0
    return b * (parseFloat(discPct) || 0) / 100
  }, [basePrice, discPct, discFixed, discMode, voucherApplied])

  const total = useMemo(() => {
    const b = parseFloat(basePrice) || 0
    const s = services.reduce((sum, x) => sum + (parseFloat(x.price) || 0) * (parseInt(x.qty) || 1), 0)
    return Math.max(0, b - discountAmt) + s
  }, [basePrice, discountAmt, services])

  const selectedYacht   = yachts.find(y => y.id === yachtId)
  const selectedOT      = openTrips.find(t => t.id === openTripId)

  /* trip nights for open trip (endDate - startDate in full days) */
  const tripNights = useMemo(() => {
    if (!selectedOT) return 0
    return Math.max(1, Math.ceil(
      (new Date(selectedOT.endDate).getTime() - new Date(selectedOT.startDate).getTime()) / 86400000
    ))
  }, [selectedOT])
  const filteredCusts = customers.filter(c =>
    !guests.some(g => g.customerId === c.id) &&
    !bookedCustomerIds.includes(c.id) &&
    (c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
     (c.phone ?? '').includes(custSearch))
  )

  /* cabin occupancy map: cabinId → guest count (infants don't count) */
  const cabinOccupancy = guests.reduce<Record<string, number>>((acc, g) => {
    if (g.cabinId && !g.isInfant) acc[g.cabinId] = (acc[g.cabinId] ?? 0) + 1
    return acc
  }, {})

  /* guest helpers */
  const addGuest = (c: CustomerOpt) => {
    const age = getAgeYears(c.dateOfBirth)
    const isInfant = age !== null && age < 4
    setGuests(prev => [
      ...prev,
      { customerId: c.id, name: c.name, phone: c.phone, cabinId: '', isLead: prev.length === 0, isChild: c.isChild, isInfant },
    ])
    setCSearch('')
  }
  const removeGuest = (id: string) =>
    setGuests(prev => {
      const removing = prev.find(g => g.customerId === id)
      let next = prev.filter(g => g.customerId !== id)
      // if an adult is removed from a cabin, evict any children left alone in that cabin
      if (removing && !removing.isChild && removing.cabinId) {
        const stillHasAdult = next.some(g => g.cabinId === removing.cabinId && !g.isChild)
        if (!stillHasAdult)
          next = next.map(g => g.cabinId === removing.cabinId && g.isChild ? { ...g, cabinId: '' } : g)
      }
      if (next.length > 0 && !next.some(g => g.isLead)) next[0].isLead = true
      return next
    })
  const updateGuest = (id: string, patch: Partial<SelectedGuest>) =>
    setGuests(prev => prev.map(g => g.customerId === id ? { ...g, ...patch } : g))

  const setLead = (id: string) =>
    setGuests(prev => prev.map(g => ({ ...g, isLead: g.customerId === id })))

  const createAndAddGuest = async () => {
    const firstName = quickFirstName.trim()
    const lastName  = quickLastName.trim()
    if (!firstName) return
    const leadCustomer = customers.find(c => c.id === guests.find(g => g.isLead)?.customerId)
    const resolvedPhone = quickPhoneSameAsLead ? (leadCustomer?.phone ?? '') : quickPhone.trim()
    const resolvedEmail = quickEmailSameAsLead ? (leadCustomer?.email ?? '') : quickEmail.trim()
    const ageYears = getAgeYears(quickDob)
    const isChild  = quickDob ? (ageYears !== null && ageYears < 12) : quickIsChild
    const isInfant = quickDob ? (ageYears !== null && ageYears < 4)  : false
    setQuickSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone: resolvedPhone || null, email: resolvedEmail || null, dateOfBirth: quickDob || null, isChild, nationality: quickNationality || null }),
      })
      if (res.ok) {
        const created: CustomerOpt = await res.json()
        setCustomers(prev => [created, ...prev])
        addGuest(created)
        if (quickSetAsLead) setLead(created.id)
        setShowQuickAdd(false)
        setQuickFirstName(''); setQuickLastName(''); setQuickDob('')
        setQuickPhone(''); setQuickEmail(''); setQuickIsChild(false)
        setQuickNationality(''); setQuickNatQuery('')
        setQuickPhoneSameAsLead(false); setQuickEmailSameAsLead(false); setQuickSetAsLead(false)
      }
    } finally { setQuickSaving(false) }
  }

  /* service helpers */
  const addSvc    = () => setSvc(s => [...s, { tempId: Date.now().toString(), name: '', price: '', qty: '1' }])
  const removeSvc = (id: string) => setSvc(s => s.filter(x => x.tempId !== id))
  const updateSvc = (id: string, p: Partial<ServiceEntry>) =>
    setSvc(s => s.map(x => x.tempId === id ? { ...x, ...p } : x))

  /* validation */
  const canNext = () => {
    if (phase === 'agentInfo') return !!agentId
    if (step === 1) {
      if (tripType === 'PRIVATE_CHARTER') return !!(yachtId && startDate && endDate) && (!yachtConflict || !!yachtConflict.isOpenTrip)
      return !!openTripId
    }
    if (step === 2) {
      if (isOnHold) return holdGuestName.trim().length > 0 && !!holdUntil && (tripType !== 'OPEN_TRIP' || !!holdCabinId)
      if (guests.length === 0) return false
      if (tripType === 'OPEN_TRIP') return guests.every(g => !!g.cabinId)
      return true // PC: cabin optional
    }
    if (step === 3) return !!(parseFloat(basePrice) > 0) && !!depositDueDate && !!finalDueDate
    return true
  }

  /* on-hold submit — creates/finds customer by name+phone, saves booking with status=on_hold */
  const handleOnHoldSubmit = async () => {
    setSubmitting(true)
    try {
      const ot = openTrips.find(t => t.id === openTripId)
      const payload = {
        tripType,
        source,
        agentId: source === 'AGENT' ? agentId : undefined,
        yachtId: tripType === 'PRIVATE_CHARTER' ? yachtId : ot?.yachtId,
        openTripId: tripType === 'OPEN_TRIP' ? openTripId : undefined,
        startDate: tripType === 'OPEN_TRIP' ? ot?.startDate : startDate,
        endDate:   tripType === 'OPEN_TRIP' ? ot?.endDate   : endDate,
        destination: tripType === 'OPEN_TRIP' ? ot?.destination : destination,
        totalPrice: 0,
        depositPaid: 0,
        isOnHold: true,
        holdCustomerId: holdCustomerId ?? undefined,
        holdCabinId:    holdCabinId ?? undefined,
        holdGuest: { name: holdGuestName.trim(), phone: holdGuestPhone.trim() },
        holdUntil: holdUntil || undefined,
        depositDueDate: depositDueDate || undefined,
        finalDueDate:   finalDueDate   || undefined,
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Failed to save on-hold booking')
        return
      }

      window.dispatchEvent(new CustomEvent('booking-created'))
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      alert('Failed to save on-hold booking')
    } finally {
      setSubmitting(false)
    }
  }

  /* submit */
  const handleSubmit = async (confirmCloseOpenTrips = false) => {
    setSubmitting(true)
    try {
      const resolvedAgentId      = source === 'AGENT' ? agentId        : undefined
      const resolvedContactId    = source === 'AGENT' && agentContactId && agentContactId !== 'none' ? agentContactId : undefined
      let ot = openTrips.find(t => t.id === openTripId)
      // Fallback: fetch open trip directly if not in local state (e.g. race condition on load)
      if (!ot && openTripId && tripType === 'OPEN_TRIP') {
        ot = await fetch(`/api/open-trips/${openTripId}`).then(r => r.ok ? r.json() : null).catch(() => null)
      }

      const extraNote = (() => {
        const lines = Object.entries(cabinExtraBeds)
          .filter(([, n]) => n > 0)
          .map(([cid, n]) => `Extra bed ×${n} (${cabins.find(c => c.id === cid)?.name ?? cid})`)
        return lines.length ? `[Extra Beds] ${lines.join(', ')}` : ''
      })()
      const resolvedNotes = [notes, extraNote].filter(Boolean).join('\n') || undefined

      // ── Complete on-hold booking via PATCH ──
      if (completeBookingId) {
        const payload = {
          completeBooking: true,
          totalPrice:    total,
          depositPaid:   parseFloat(deposit) || 0,
          discount:      discountAmt,
          currency,
          exchangeRate:  currency !== 'USD' ? manualRate : undefined,
          depositDueDate: depositDueDate || undefined,
          finalDueDate:   finalDueDate   || undefined,
          crewRequired:  crewReq,
          hasDiving:     tripType === 'PRIVATE_CHARTER' ? hasDiving : false,
          notes:         resolvedNotes,
          guests: guests.map(g => ({ customerId: g.customerId, cabinId: g.cabinId || undefined, isLead: g.isLead })),
          services: services.filter(s => s.name.trim()).map(s => ({ name: s.name, price: s.price, qty: parseInt(s.qty) || 1 })),
        }
        const res = await fetch(`/api/bookings/${completeBookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          alert(err.error || 'Failed to complete booking')
          return
        }
        window.dispatchEvent(new CustomEvent('booking-created'))
        onSuccess?.()
        onOpenChange(false)
        return
      }

      const payload = {
        tripType,
        source,
        agentId:        resolvedAgentId,
        agentContactId: resolvedContactId,
        yachtId: tripType === 'PRIVATE_CHARTER' ? yachtId : ot?.yachtId,
        openTripId: tripType === 'OPEN_TRIP' ? openTripId : undefined,
        startDate: tripType === 'OPEN_TRIP' ? ot?.startDate : startDate,
        endDate:   tripType === 'OPEN_TRIP' ? ot?.endDate   : endDate,
        destination: tripType === 'OPEN_TRIP' ? ot?.destination : destination,
        totalPrice:    total,
        depositPaid:   parseFloat(deposit) || 0,
        discount:      discountAmt,
        voucherCode:   voucherApplied?.code ?? undefined,
        currency,
        exchangeRate:  currency !== 'USD' ? manualRate : undefined,
        depositDueDate: depositDueDate || undefined,
        finalDueDate:   finalDueDate   || undefined,
        crewRequired:  crewReq,
        hasDiving:     tripType === 'PRIVATE_CHARTER' ? hasDiving : false,
        notes:         resolvedNotes,
        guests: guests.map(g => ({ customerId: g.customerId, cabinId: g.cabinId || undefined, isLead: g.isLead })),
        services: services.filter(s => s.name.trim()).map(s => ({ name: s.name, price: s.price, qty: parseInt(s.qty) || 1 })),
        confirmCloseOpenTrips,
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 409 && err.conflict && err.openTrips?.length) {
          setOpenTripConflicts(err.openTrips)
          setShowOpenTripConflictDialog(true)
          return
        }
        console.error('Booking failed:', err)
        alert(err.error ?? 'Failed to save booking. Please try again.')
        return
      }

      window.dispatchEvent(new CustomEvent('booking-created'))
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Step indicator ── */
  const stepIndicator = () => (
    <div className="flex items-center justify-center gap-0 mb-4">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div
              className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0')}
              style={step >= s.num
                ? { backgroundColor: ACCENT, color: 'white' }
                : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              {step > s.num ? <Check className="w-2.5 h-2.5" /> : s.num}
            </div>
            <span
              className="text-[11px] whitespace-nowrap font-medium"
              style={{ color: step === s.num ? ACCENT : 'var(--muted-foreground)' }}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="h-px w-8 mx-2 transition-colors"
              style={{ backgroundColor: step > s.num ? ACCENT : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  )

  /* ════════════════════════════════════════════
     PHASE: SOURCE
  ════════════════════════════════════════════ */
  const phaseSource = () => (
    <div className="space-y-6 py-2">
      <div className="text-center">
        <h3 className="text-xl font-semibold">New Booking</h3>
        <p className="text-sm text-muted-foreground mt-1">How is this booking coming in?</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {([
          { val: 'DIRECT' as Source, icon: User,  label: 'Direct',    desc: 'Customer books directly' },
          { val: 'AGENT'  as Source, icon: Users, label: 'Via Agent', desc: 'Through a travel agent' },
        ] as const).map(({ val, icon: Icon, label, desc }) => (
          <button
            key={val}
            onClick={() => {
              setSource(val)
              if (preselectedOpenTripId) {
                // trip already pre-selected from calendar — skip tripType
                setPhase(val === 'AGENT' ? 'agentInfo' : 'steps')
                if (val !== 'AGENT') setStep(1)
              } else {
                setPhase(val === 'AGENT' ? 'agentInfo' : 'tripType')
              }
            }}
            className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-border bg-card hover:shadow-md text-center cursor-pointer transition-all"
            style={{ borderColor: undefined }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${ACCENT}1a` }}>
              <Icon className="w-8 h-8" style={{ color: ACCENT }} />
            </div>
            <div>
              <div className="font-semibold text-base">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  /* ════════════════════════════════════════════
     PHASE: AGENT INFO
  ════════════════════════════════════════════ */
  const selectedAgent   = agents.find(a => a.id === agentId)
  const selectedContact = agentContacts.find(c => c.id === agentContactId)

  const phaseAgentInfo = () => (
    <div className="space-y-5 py-2">
      <button
        onClick={() => { setPhase('source'); setSource(null) }}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center">
        <div className="flex justify-center mb-3">
          <Badge style={{ backgroundColor: ACCENT, color: 'white' }} className="px-3 py-1">Via Agent</Badge>
        </div>
        <h3 className="text-xl font-semibold">Agent Information</h3>
        <p className="text-sm text-muted-foreground mt-1">Select a travel agent for this booking</p>
      </div>

      {/* Agent Company combobox */}
      <div className="space-y-1.5">
        <Label>Agent Company <span className="text-destructive">*</span></Label>
        <Popover open={agentOpen} onOpenChange={setAgentOpen}>
          <PopoverTrigger asChild>
            <button
              className="w-full flex items-center justify-between px-3 py-2 h-10 rounded-md border border-input bg-background text-sm hover:bg-accent/30 transition-colors"
            >
              {selectedAgent ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{selectedAgent.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
                    style={{ backgroundColor: `${ACCENT}18`, color: ACCENT }}>
                    {tripType === 'OPEN_TRIP' ? selectedAgent.commissionOpenTrip : selectedAgent.commissionPrivateCharter}%
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">Select agent company…</span>
              )}
              <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
            <Command>
              <CommandInput placeholder="Search agent…" />
              <CommandList>
                <CommandEmpty>
                  <p className="text-muted-foreground text-sm">No agents found.</p>
                </CommandEmpty>
                <CommandGroup>
                  {agents.map(a => (
                    <CommandItem
                      key={a.id}
                      value={a.name}
                      onSelect={() => { setAgentId(a.id); setAgentContactId(''); setAgentOpen(false) }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Check className={cn('w-4 h-4 shrink-0', agentId === a.id ? 'opacity-100' : 'opacity-0')}
                        style={{ color: ACCENT }} />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                        style={{ backgroundColor: `${ACCENT}18`, color: ACCENT }}>
                        {tripType === 'OPEN_TRIP' ? a.commissionOpenTrip : a.commissionPrivateCharter}%
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {agents.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
            No agents registered yet. Please add an agent first via the <strong>Agents</strong> menu.
          </p>
        )}
      </div>

      {/* Contact Person combobox — shown after agent selected */}
      {agentId && (
        <div className="space-y-1.5">
          <Label>
            Contact Person
            <span className="ml-1.5 text-muted-foreground font-normal text-xs">(optional)</span>
          </Label>
          <Popover open={contactOpen} onOpenChange={v => { setContactOpen(v); if (!v) setAddingContact(false) }}>
            <PopoverTrigger asChild>
              <button
                className="w-full flex items-center justify-between px-3 py-2 h-10 rounded-md border border-input bg-background text-sm hover:bg-accent/30 transition-colors"
              >
                {selectedContact ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{selectedContact.name}</span>
                    {(selectedContact.whatsapp || selectedContact.email) && (
                      <span className="text-xs text-muted-foreground truncate">
                        · {selectedContact.whatsapp || selectedContact.email}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Select contact person…</span>
                )}
                <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
              {addingContact ? (
                <div className="p-3 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" style={{ color: ACCENT }} /> Add Contact Person
                  </p>
                  <Input
                    placeholder="Name *"
                    value={newCName}
                    onChange={e => setNewCName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="WhatsApp"
                    value={newCPhone}
                    onChange={e => setNewCPhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Email"
                    value={newCEmail}
                    onChange={e => setNewCEmail(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      style={{ backgroundColor: ACCENT }}
                      onClick={handleAddContact}
                      disabled={!newCName.trim() || savingContact}
                    >
                      {savingContact ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => { setAddingContact(false); setNewCName(''); setNewCPhone(''); setNewCEmail('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Command>
                  <CommandInput placeholder="Search contact…" />
                  <CommandList>
                    {agentContacts.length > 0 ? (
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => { setAgentContactId(''); setContactOpen(false) }}
                          className="text-muted-foreground cursor-pointer"
                        >
                          <Check className={cn('w-4 h-4 shrink-0 mr-2', !agentContactId ? 'opacity-100' : 'opacity-0')}
                            style={{ color: ACCENT }} />
                          — None —
                        </CommandItem>
                        {agentContacts.map(c => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => { setAgentContactId(c.id); setContactOpen(false) }}
                            className="cursor-pointer"
                          >
                            <Check className={cn('w-4 h-4 shrink-0 mr-2', agentContactId === c.id ? 'opacity-100' : 'opacity-0')}
                              style={{ color: ACCENT }} />
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{c.name}</p>
                              {(c.whatsapp || c.email) && (
                                <p className="text-xs text-muted-foreground truncate">{c.whatsapp || c.email}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ) : (
                      <CommandEmpty>No contacts yet.</CommandEmpty>
                    )}
                  </CommandList>
                  <div className="border-t p-1">
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors"
                      style={{ color: ACCENT }}
                      onClick={() => setAddingContact(true)}
                    >
                      <Plus className="w-4 h-4" /> Add new contact
                    </button>
                  </div>
                </Command>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )

  /* ════════════════════════════════════════════
     PHASE: TRIP TYPE
  ════════════════════════════════════════════ */
  const phaseTripType = () => (
    <div className="space-y-5 py-2">
      <button
        onClick={() => setPhase(source === 'AGENT' ? 'agentInfo' : 'source')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center">
        <div className="flex justify-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs">{source === 'AGENT' ? 'Via Agent' : 'Direct'}</Badge>
        </div>
        <h3 className="text-xl font-semibold">Select Trip Type</h3>
        <p className="text-sm text-muted-foreground mt-1">Choose the type of booking</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {([
          {
            val: 'PRIVATE_CHARTER' as TripType,
            icon: Ship,
            label: 'Private Charter',
            desc: 'Exclusive use of the yacht. Choose your dates, destination, and guests.',
          },
          {
            val: 'OPEN_TRIP' as TripType,
            icon: Map,
            label: 'Open Trip',
            desc: 'Join a pre-scheduled trip. Dates and yacht are already set.',
          },
        ] as const).map(({ val, icon: Icon, label, desc }) => (
          <button
            key={val}
            onClick={() => { setTrip(val); setPhase('steps'); setStep(1) }}
            className="flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-border bg-card hover:shadow-md text-left cursor-pointer transition-all"
            onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${ACCENT}1a` }}>
              <Icon className="w-6 h-6" style={{ color: ACCENT }} />
            </div>
            <div>
              <div className="font-semibold">{label}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  /* ════════════════════════════════════════════
     STEP 1 — PRIVATE CHARTER
  ════════════════════════════════════════════ */
  const step1PC = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Yacht <span className="text-destructive">*</span></Label>
        <Select value={yachtId} onValueChange={setYachtId}>
          <SelectTrigger><SelectValue placeholder="Select yacht" /></SelectTrigger>
          <SelectContent>
            {yachts.filter(y => y.status === 'available').map(y => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}{y.model ? ` (${y.model})` : ''} — Cap. {y.capacity} | ${y.dailyRate.toLocaleString()}/day
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(() => {
        const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
        const toDateStr = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const displayDate = (s: string) =>
          s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null
        const disabledStart = [{ before: todayMidnight }, ...blockedRanges]
        const endMin = startDate ? (() => { const d = new Date(startDate + 'T00:00:00'); d.setDate(d.getDate() + 1); return d })() : todayMidnight
        const disabledEnd = [{ before: endMin }, ...blockedRanges]

        const DateBtn = ({ value, placeholder, open, onOpenChange }: { value: string; placeholder: string; open: boolean; onOpenChange: (v: boolean) => void }) => (
          <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                  !value && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="h-4 w-4 shrink-0 opacity-40" />
                <span className="flex-1">{displayDate(value) ?? placeholder}</span>
                {value && (
                  <X className="h-3 w-3 opacity-40 hover:opacity-80" onClick={e => { e.stopPropagation(); onOpenChange(false); if (placeholder.includes('Start')) { setStart(''); setEnd('') } else setEnd('') }} />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {(blockedRanges.length > 0 || openTripFreeRanges.length > 0) && (
                <div className="px-3 pt-2.5 pb-0.5 flex flex-col gap-1">
                  {blockedRanges.length > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-sm bg-red-200 border border-red-300" />
                      Slot occupied by booking / open trip
                    </p>
                  )}
                  {openTripFreeRanges.length > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-sm bg-blue-200 border border-blue-300" />
                      Open trip scheduled (available)
                    </p>
                  )}
                </div>
              )}
              {placeholder.includes('Start') ? (
                <Calendar
                  mode="single"
                  selected={startDate ? new Date(startDate + 'T00:00:00') : undefined}
                  onSelect={d => { if (!d) return; setStart(toDateStr(d)); if (endDate && toDateStr(d) >= endDate) setEnd(''); setStartPickerOpen(false) }}
                  disabled={disabledStart}
                  defaultMonth={startDate ? new Date(startDate + 'T00:00:00') : todayMidnight}
                  modifiers={{ booked: blockedRanges, openFree: openTripFreeRanges }}
                  modifiersClassNames={{ booked: 'bg-red-100 text-red-500 line-through', openFree: 'bg-blue-100 text-blue-600' }}
                  className="p-3"
                />
              ) : (
                <Calendar
                  mode="single"
                  selected={endDate ? new Date(endDate + 'T00:00:00') : undefined}
                  onSelect={d => { if (!d) return; setEnd(toDateStr(d)); setEndPickerOpen(false) }}
                  disabled={disabledEnd}
                  defaultMonth={endDate ? new Date(endDate + 'T00:00:00') : (startDate ? new Date(startDate + 'T00:00:00') : todayMidnight)}
                  modifiers={{ booked: blockedRanges, openFree: openTripFreeRanges }}
                  modifiersClassNames={{ booked: 'bg-red-100 text-red-500 line-through', openFree: 'bg-blue-100 text-blue-600' }}
                  className="p-3"
                />
              )}
            </PopoverContent>
          </Popover>
        )

        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date <span className="text-destructive">*</span></Label>
              <DateBtn value={startDate} placeholder="Start date" open={startPickerOpen} onOpenChange={setStartPickerOpen} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date <span className="text-destructive">*</span></Label>
              <DateBtn value={endDate} placeholder="End date" open={endPickerOpen} onOpenChange={setEndPickerOpen} />
            </div>
          </div>
        )
      })()}

      {yachtConflict && (
        <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${yachtConflict.isOpenTrip ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              {yachtConflict.isOpenTrip ? 'Open trip scheduled on these dates' : 'Yacht unavailable on these dates'}
            </p>
            <p className={`text-xs mt-0.5 ${yachtConflict.isOpenTrip ? 'text-amber-600' : 'text-red-600'}`}>
              There is already a schedule for <span className="font-medium">{yachtConflict.name}</span> on{' '}
              {new Date(yachtConflict.start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' – '}
              {new Date(yachtConflict.end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {yachtConflict.isOpenTrip && ' — the open trip will be closed automatically when the booking is confirmed.'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Destination</Label>
        <Input placeholder="e.g. Raja Ampat, Komodo..." value={destination} onChange={e => setDest(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Input placeholder="Special requests, remarks..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

    </div>
  )

  /* ════════════════════════════════════════════
     STEP 1 — OPEN TRIP
  ════════════════════════════════════════════ */
  const step1OT = () => {
    const PAGE_SIZE = 6
    const resetFilters = () => { setTripSearch(''); setTripDateFrom(''); setTripDateTo(''); setTripSort('nearest'); setTripPage(1) }
    const hasActiveFilter = tripSearch || tripDateFrom || tripDateTo || tripSort !== 'nearest'

    // 1. hide closed/cancelled
    let result = openTrips.filter(t => t.status !== 'closed' && t.status !== 'cancelled')

    // 2. text search
    const q = tripSearch.trim().toLowerCase()
    if (q) result = result.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.destination.toLowerCase().includes(q) ||
      t.yacht.name.toLowerCase().includes(q)
    )

    // 3. date range filter
    if (tripDateFrom) result = result.filter(t => t.startDate.slice(0, 10) >= tripDateFrom)
    if (tripDateTo)   result = result.filter(t => t.startDate.slice(0, 10) <= tripDateTo)

    // 4. sort
    result = [...result].sort((a, b) => {
      const nights = (t: OpenTripOpt) =>
        Math.round((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000)
      if (tripSort === 'nearest')  return a.startDate.localeCompare(b.startDate)
      if (tripSort === 'furthest') return b.startDate.localeCompare(a.startDate)
      if (tripSort === 'longest')  return nights(b) - nights(a)
      if (tripSort === 'shortest') return nights(a) - nights(b)
      return 0
    })

    const totalPages = Math.max(1, Math.ceil(result.length / PAGE_SIZE))
    const safePage   = Math.min(tripPage, totalPages)
    const paged      = result.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

    const statusBadge = (t: OpenTripOpt) =>
      t.status === 'full'
        ? <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">Full</Badge>
        : <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: '#4a9f6e', color: '#4a9f6e' }}>Open</Badge>

    const SORT_LABELS: Record<string, string> = {
      nearest: 'Nearest', furthest: 'Furthest', longest: 'Longest', shortest: 'Shortest',
    }

    return (
      <div className="space-y-2.5">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8 h-9 text-sm"
            placeholder="Search by trip name, destination, or yacht…"
            value={tripSearch}
            onChange={e => { setTripSearch(e.target.value); setTripPage(1) }}
          />
          {tripSearch && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setTripSearch(''); setTripPage(1) }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* From date */}
          <div className="relative flex items-center">
            <CalendarIcon className="absolute left-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={tripDateFrom}
              onChange={e => { setTripDateFrom(e.target.value); setTripPage(1) }}
              className="h-8 pl-7 pr-2 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'light' }}
              placeholder="From"
            />
          </div>
          <span className="text-xs text-muted-foreground">—</span>
          {/* To date */}
          <div className="relative flex items-center">
            <CalendarIcon className="absolute left-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={tripDateTo}
              onChange={e => { setTripDateTo(e.target.value); setTripPage(1) }}
              min={tripDateFrom || undefined}
              className="h-8 pl-7 pr-2 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'light' }}
            />
          </div>

          {/* Sort */}
          <Select value={tripSort} onValueChange={v => { setTripSort(v as typeof tripSort); setTripPage(1) }}>
            <SelectTrigger className="h-8 text-xs w-36 gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nearest">🗓 Nearest date</SelectItem>
              <SelectItem value="furthest">🗓 Furthest date</SelectItem>
              <SelectItem value="longest">⬆ Longest trip</SelectItem>
              <SelectItem value="shortest">⬇ Shortest trip</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear all */}
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}

          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {result.length} trip{result.length !== 1 ? 's' : ''}
            {hasActiveFilter && tripSort !== 'nearest' && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: `${ACCENT}18`, color: ACCENT }}>
                {SORT_LABELS[tripSort]}
              </span>
            )}
          </span>
        </div>

        {/* Loading */}
        {openTripsLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : result.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
            <Search className="w-8 h-8 opacity-30" />
            <p className="text-sm">{hasActiveFilter ? 'No trips match your filters.' : 'No open trips available.'}</p>
            {hasActiveFilter && (
              <button onClick={resetFilters} className="text-xs underline" style={{ color: ACCENT }}>Clear filters</button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {paged.map(t => {
                const selected = openTripId === t.id
                const isFull   = t.status === 'full'
                const nights   = Math.round((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000)
                return (
                  <button
                    key={t.id}
                    onClick={() => !isFull && setOTId(t.id)}
                    disabled={isFull}
                    className={cn(
                      'w-full text-left rounded-xl border transition-all duration-150',
                      isFull ? 'border-border bg-muted/20 opacity-50 cursor-not-allowed'
                        : selected ? 'shadow-sm'
                        : 'border-border bg-card hover:border-foreground/20 hover:shadow-sm'
                    )}
                    style={!isFull && selected ? { borderColor: ACCENT, backgroundColor: `${ACCENT}06` } : {}}
                  >
                    <div className="flex items-start justify-between px-3.5 pt-3 pb-1.5 gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {selected && !isFull && (
                          <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: ACCENT }}>
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-sm leading-tight line-clamp-2">{t.title}</span>
                          <div className="mt-1">{statusBadge(t)}</div>
                        </div>
                      </div>
                      {isFull ? (
                        <span className="text-[10px] font-semibold bg-red-100 text-red-600 rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">Sold Out</span>
                      ) : (
                        <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap">
                          {t.spotsAvailable}/{t.maxCapacity} cabin(s)
                        </span>
                      )}
                    </div>
                    <div className="px-3.5 pb-3 text-xs text-muted-foreground space-y-0.5 border-t border-border/50 pt-1.5 mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <Ship className="w-3 h-3 shrink-0 opacity-50" />
                        <span className="truncate">{t.yacht.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CalendarIcon className="w-3 h-3 shrink-0 opacity-50" />
                        <span>{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</span>
                        <span className="text-[10px] bg-muted rounded px-1 py-px shrink-0">{nights}N</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Map className="w-3 h-3 shrink-0 opacity-50" />
                        <span className="truncate">{t.destination}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, result.length)} of {result.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTripPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </button>
                  <span className="px-2 text-xs text-muted-foreground">{safePage} / {totalPages}</span>
                  <button
                    onClick={() => setTripPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════════
     STEP 2 — GUESTS & CABINS (drag-and-drop)
  ════════════════════════════════════════════ */
  const step2 = () => {
    const unassigned = guests.filter(g => !g.cabinId)

    const dndStart = (e: React.DragEvent, customerId: string) => {
      e.dataTransfer.setData('guestId', customerId)
      setDragGuest(customerId); setDropError(null)
    }
    const dndEnd = () => { setDragGuest(null); setDropTarget(null) }

    const dndDrop = (e: React.DragEvent, targetId: string | 'unassigned') => {
      e.preventDefault()
      const gId = e.dataTransfer.getData('guestId') || dragGuest
      if (!gId) return
      setDragGuest(null); setDropTarget(null)
      if (targetId === 'unassigned') { updateGuest(gId, { cabinId: '' }); return }
      const cabin   = cabins.find(c => c.id === targetId)
      const already = guests.find(g => g.customerId === gId)?.cabinId === targetId
      const extOccDrop = existingCabinOccupancy[targetId] ?? 0
      const myOccDrop  = cabinOccupancy[targetId] ?? 0
      const adjustedExtOccDrop = completeBookingId
        ? Math.max(0, extOccDrop - (originalHoldCabins[targetId] ?? 0))
        : extOccDrop
      if (!already && adjustedExtOccDrop > 0) {
        setDropError(`${cabin?.name} is already reserved by ${cabinSalesperson[targetId] || 'another booking'}`)
        return
      }
      const droppingGuest = guests.find(g => g.customerId === gId)
      const effectiveCapDrop = (cabin?.capacity ?? 0) + (cabin ? (cabinExtraBeds[cabin.id] ?? 0) : 0)
      // Infants don't count toward capacity — skip the full check for them
      if (!already && !droppingGuest?.isInfant && myOccDrop >= effectiveCapDrop) {
        setDropError(`${cabin?.name} is full (capacity ${effectiveCapDrop})`)
        return
      }
      // Infant/Child cannot be in a cabin without at least one adult
      if (droppingGuest?.isChild && !already) {
        const hasAdultInCabin = guests.some(g => g.cabinId === targetId && !g.isChild)
        if (!hasAdultInCabin) {
          setDropError(droppingGuest.isInfant
            ? `Infants must be accompanied by an adult in the same cabin`
            : `Children must be accompanied by an adult in the same cabin`)
          return
        }
      }
      updateGuest(gId, { cabinId: targetId })
    }

    // called as a function, not a component — avoids React unmount on parent re-render
    const pill = (g: SelectedGuest, inCabin?: boolean) => (
      <div
        key={g.customerId}
        draggable
        onDragStart={e => dndStart(e, g.customerId)}
        onDragEnd={dndEnd}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing select-none',
          dragGuest === g.customerId ? 'opacity-40' : 'opacity-100',
          g.isLead ? 'border-[#bdac7e] bg-[#bdac7e]/10 text-foreground' : 'bg-muted/60 border-border',
        )}
      >
        {g.isLead && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />}
        {g.isInfant && <span className="text-[9px] font-bold text-rose-500 shrink-0 bg-rose-50 px-1 rounded">Infant</span>}
        {g.isChild && !g.isInfant && <span className="text-[9px] font-bold text-blue-600 shrink-0 bg-blue-50 px-1 rounded">Child</span>}
        <span className="truncate max-w-24">{g.name}</span>
        <button onClick={e => { e.stopPropagation(); removeGuest(g.customerId) }}
          className="ml-0.5 text-muted-foreground hover:text-destructive shrink-0">
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    )

    return (
      <div className="space-y-4">
        {/* On Hold checkbox — hidden in complete-booking mode */}
        {completeBookingId ? null : <label className={cn(
          'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer select-none transition-colors',
          isOnHold ? 'border-amber-300 bg-amber-50' : 'border-border hover:bg-muted/30',
        )}>
          <input
            type="checkbox"
            checked={isOnHold}
            onChange={e => {
              setIsOnHold(e.target.checked)
              if (!e.target.checked) {
                setHoldCustomerId(null); setHoldGuestName(''); setHoldGuestPhone(''); setHoldSearch(''); setHoldIsNew(false); setHoldCabinId(null); setHoldUntil('')
              }
            }}
            className="h-4 w-4 rounded border-border accent-amber-500 cursor-pointer"
          />
          <div>
            <span className="text-sm font-medium text-foreground">On Hold</span>
            <span className="text-[11px] text-muted-foreground ml-2">Save without pricing, continue later</span>
          </div>
        </label>}

        {/* On Hold simplified form */}
        {isOnHold && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
            {/* selected customer pill */}
            {holdCustomerId && !holdIsNew && (
              <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-amber-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-amber-700">{holdGuestName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{holdGuestName}</p>
                    {holdGuestPhone && <p className="text-xs text-muted-foreground">{holdGuestPhone}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setHoldCustomerId(null); setHoldGuestName(''); setHoldGuestPhone(''); setHoldSearch('') }}
                  className="ml-3 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors shrink-0 text-xs"
                >✕</button>
              </div>
            )}

            {/* search input */}
            {!holdCustomerId && !holdIsNew && (
              <div className="px-4 pt-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 bg-white border-amber-200 focus-visible:ring-amber-300"
                    placeholder="Search by name or phone number..."
                    value={holdSearch}
                    onChange={e => setHoldSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* inline results list */}
            {!holdCustomerId && !holdIsNew && (() => {
              const q = holdSearch.toLowerCase()
              const matches = customers.filter(c =>
                c.name.toLowerCase().includes(q) ||
                (c.phone ?? '').includes(holdSearch)
              )
              return (
                <div className="border-t border-amber-100 flex flex-col">
                  <div className="overflow-y-auto max-h-52 divide-y divide-amber-50">
                    {matches.map(c => (
                      <button key={c.id}
                        onMouseDown={e => {
                          e.preventDefault()
                          setHoldCustomerId(c.id)
                          setHoldGuestName(c.name)
                          setHoldGuestPhone(c.phone ?? '')
                          setHoldSearch('')
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-amber-50 transition-colors flex items-center justify-between gap-2 group">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-[11px] font-semibold text-muted-foreground group-hover:bg-amber-100 group-hover:text-amber-700 transition-colors">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate font-medium">{c.name}</span>
                        </div>
                        {c.phone && <span className="text-muted-foreground text-xs shrink-0">{c.phone}</span>}
                      </button>
                    ))}
                    {matches.length === 0 && holdSearch && (
                      <div className="px-4 py-2.5 text-sm text-muted-foreground">Guest not found</div>
                    )}
                  </div>
                  <button
                    onMouseDown={e => { e.preventDefault(); setHoldIsNew(true); setHoldGuestName(holdSearch); setHoldSearch('') }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-[#bdac7e] hover:bg-amber-50 transition-colors flex items-center gap-2 border-t border-amber-100 shrink-0">
                    <span className="h-5 w-5 rounded-full border-2 border-[#bdac7e] flex items-center justify-center text-[11px] leading-none shrink-0">+</span>
                    Add new guest
                  </button>
                </div>
              )
            })()}

            {/* new guest mini-form */}
            {holdIsNew && (() => {
              const q = holdGuestPhone.trim().toLowerCase()
              const dupMatch = q
                ? customers.find(c =>
                    (c.phone && c.phone.replace(/\s/g, '') === holdGuestPhone.replace(/\s/g, '')) ||
                    (c.email && c.email.toLowerCase() === q)
                  )
                : null
              return (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">New Guest</p>
                    <button type="button"
                      onClick={() => { setHoldIsNew(false); setHoldGuestName(''); setHoldGuestPhone('') }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      ← Search guest
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Name <span className="text-destructive">*</span></Label>
                    <Input
                      className="bg-white border-amber-200 focus-visible:ring-amber-300"
                      placeholder="Full name..."
                      value={holdGuestName}
                      onChange={e => setHoldGuestName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">No. HP / Email</Label>
                    <Input
                      className={cn('bg-white border-amber-200 focus-visible:ring-amber-300', dupMatch && 'border-orange-400')}
                      placeholder="0812345678 atau email@..."
                      value={holdGuestPhone}
                      onChange={e => setHoldGuestPhone(e.target.value)}
                    />
                    {dupMatch && (
                      <div className="flex items-center justify-between rounded-md bg-orange-50 border border-orange-200 px-3 py-2 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-orange-800">Already registered as <span className="font-bold">{dupMatch.name}</span></p>
                          <p className="text-[11px] text-orange-600 mt-0.5">Select this guest or use a different name</p>
                        </div>
                        <button
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault()
                            setHoldCustomerId(dupMatch.id)
                            setHoldGuestName(dupMatch.name)
                            setHoldGuestPhone(dupMatch.phone ?? '')
                            setHoldIsNew(false)
                          }}
                          className="text-xs font-semibold text-orange-700 hover:text-orange-900 shrink-0 underline underline-offset-2">
                          Select
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Hold deadline + due dates */}
        {isOnHold && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                Hold Until <span className="text-red-500">*</span>
              </Label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                min={new Date().toISOString().slice(0, 16)}
                value={holdUntil}
                onChange={e => setHoldUntil(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Booking will be automatically cancelled if this deadline is passed.</p>
            </div>
          </div>
        )}

        {/* Cabin picker for Open Trip on-hold */}
        {isOnHold && tripType === 'OPEN_TRIP' && cabins.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-amber-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Select Cabin</p>
              {holdCabinId && (
                <span className="text-[11px] text-green-700 font-medium">
                  ✓ {cabins.find(c => c.id === holdCabinId)?.name}
                </span>
              )}
            </div>
            <div className={cn('p-3 grid gap-2', cabins.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
              {cabins.map(c => {
                const extOcc  = existingCabinOccupancy[c.id] ?? 0
                const isOccupied = extOcc > 0
                const isSelected = holdCabinId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isOccupied}
                    onClick={() => setHoldCabinId(isSelected ? null : c.id)}
                    className={cn(
                      'rounded-xl border-2 p-3 text-left transition-all',
                      isOccupied
                        ? 'border-red-200 bg-red-50/60 opacity-60 cursor-not-allowed'
                        : isSelected
                          ? 'border-green-500 bg-green-50 shadow-sm'
                          : 'border-border hover:border-green-400 hover:bg-green-50/40 cursor-pointer',
                    )}
                  >
                    <p className="text-xs font-semibold truncate">{c.name}</p>
                    {c.deck && <p className="text-[10px] text-muted-foreground">{c.deck}</p>}
                    <p className={cn(
                      'text-[10px] font-semibold mt-1',
                      isOccupied ? 'text-red-600' : isSelected ? 'text-green-700' : 'text-muted-foreground',
                    )}>
                      {isOccupied ? 'Occupied' : isSelected ? '● On Hold' : 'Available'}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Normal guest search + cabin grid — hidden when on hold */}
        {!isOnHold && (<>
        <div className="space-y-1.5">
          <Label>Add Guests <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search customer by name or phone…"
              value={custSearch}
              onChange={e => setCSearch(e.target.value)}
              onFocus={() => setCustFocused(true)}
              onBlur={() => setCustFocused(false)}
            />
          </div>
          {(custSearch || custFocused) && (
            <div className="border rounded-lg bg-popover shadow-md z-10 relative flex flex-col">
              {filteredCusts.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {custSearch && customers.some(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) && bookedCustomerIds.includes(c.id))
                    ? '⚠ Already booked on this trip'
                    : custSearch ? 'No guest found' : 'All guests already added'}
                </div>
              ) : (
                <div className="overflow-y-auto max-h-48">
                  {filteredCusts.slice(0, 10).map(c => {
                    const cAge = getAgeYears(c.dateOfBirth)
                    const cIsInfant = cAge !== null && cAge < 4
                    const cIsChild  = !cIsInfant && (c.isChild === true || (cAge !== null && cAge < 12))
                    return (
                      <button key={c.id}
                        onMouseDown={e => { e.preventDefault(); addGuest(c); setCustFocused(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{c.name}</span>
                          {cIsInfant && <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-200 px-1 rounded shrink-0">Infant</span>}
                          {cIsChild  && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1 rounded shrink-0">Child</span>}
                        </span>
                        {c.phone && <span className="text-muted-foreground text-xs shrink-0">{c.phone}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                onMouseDown={e => { e.preventDefault(); setShowQuickAdd(true); setQuickFirstName(custSearch); setCSearch(''); setCustFocused(false) }}
                className="w-full text-left px-3 py-2.5 text-sm font-medium text-[#bdac7e] hover:bg-accent transition-colors flex items-center gap-2 border-t shrink-0">
                <Plus className="h-3.5 w-3.5" /> {custSearch ? `Add "${custSearch}" as new guest` : 'Add new guest'}
              </button>
            </div>
          )}

          {/* Inline quick-add form */}
          {showQuickAdd && (() => {
            const leadGuest     = guests.find(g => g.isLead)
            const leadCustomer  = customers.find(c => c.id === leadGuest?.customerId)
            const hasLead       = !!leadCustomer
            const ageYears       = getAgeYears(quickDob)
            const isInfantPreview = ageYears !== null && ageYears < 4
            const isChildPreview  = ageYears !== null && ageYears >= 4 && ageYears < 12
            return (
            <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Guest</p>
                <button onClick={() => { setShowQuickAdd(false); setQuickIsChild(false); setQuickNationality(''); setQuickNatQuery('') }}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">First Name *</Label>
                  <Input className="h-8 text-sm mt-1" value={quickFirstName} onChange={e => setQuickFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <Label className="text-xs">Last Name</Label>
                  <Input className="h-8 text-sm mt-1" value={quickLastName} onChange={e => setQuickLastName(e.target.value)} placeholder="Last name" />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Date of Birth <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    {!quickDob && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" className="h-3 w-3 accent-[#bdac7e]"
                          checked={quickIsChild}
                          onChange={e => setQuickIsChild(e.target.checked)} />
                        <span className="text-[10px] text-muted-foreground">Is Child</span>
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="date" className="h-8 text-sm flex-1" value={quickDob}
                      onChange={e => { setQuickDob(e.target.value); if (e.target.value) setQuickIsChild(false) }}
                      max={new Date().toISOString().split('T')[0]} />
                    {isInfantPreview && (
                      <span className="text-[10px] font-semibold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                        Infant · {ageYears} yr
                      </span>
                    )}
                    {isChildPreview && (
                      <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                        Child · {ageYears} yr
                      </span>
                    )}
                    {ageYears !== null && !isChildPreview && !isInfantPreview && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{ageYears} yr</span>
                    )}
                    {!quickDob && quickIsChild && (
                      <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                        Child
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  {hasLead && (
                    <label className="flex items-center gap-1 mt-0.5 mb-1 cursor-pointer">
                      <input type="checkbox" className="h-3 w-3 accent-[#bdac7e]" checked={quickPhoneSameAsLead}
                        onChange={e => { setQuickPhoneSameAsLead(e.target.checked); if (e.target.checked) setQuickPhone('') }} />
                      <span className="text-[10px] text-muted-foreground">Same as {leadCustomer?.name ?? 'lead'}</span>
                    </label>
                  )}
                  <Input className="h-8 text-sm" value={quickPhoneSameAsLead ? (leadCustomer?.phone ?? '') : quickPhone}
                    onChange={e => { if (!quickPhoneSameAsLead) setQuickPhone(e.target.value) }}
                    disabled={quickPhoneSameAsLead} placeholder="+62 812..." />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  {hasLead && (
                    <label className="flex items-center gap-1 mt-0.5 mb-1 cursor-pointer">
                      <input type="checkbox" className="h-3 w-3 accent-[#bdac7e]" checked={quickEmailSameAsLead}
                        onChange={e => { setQuickEmailSameAsLead(e.target.checked); if (e.target.checked) setQuickEmail('') }} />
                      <span className="text-[10px] text-muted-foreground">Same as {leadCustomer?.name ?? 'lead'}</span>
                    </label>
                  )}
                  <Input className="h-8 text-sm" value={quickEmailSameAsLead ? (leadCustomer?.email ?? '') : quickEmail}
                    onChange={e => { if (!quickEmailSameAsLead) setQuickEmail(e.target.value) }}
                    disabled={quickEmailSameAsLead} placeholder="email@..." />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Nationality</Label>
                  <Popover open={quickNatOpen} onOpenChange={v => { setQuickNatOpen(v); if (!v) setQuickNatQuery('') }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal px-3 mt-1">
                        <span className={quickNationality ? '' : 'text-muted-foreground'}>
                          {quickNationality || 'Select nationality'}
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 border-b px-3 py-2">
                          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <input
                            autoFocus
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            placeholder="Search nationality…"
                            value={quickNatQuery}
                            onChange={e => setQuickNatQuery(e.target.value)}
                          />
                        </div>
                        <div
                          className="overflow-y-scroll p-1 overscroll-contain"
                          style={{ maxHeight: 200 }}
                          onWheel={e => e.stopPropagation()}
                        >
                          {(quickNatQuery.trim()
                            ? NATIONALITIES.filter(n => n.toLowerCase().includes(quickNatQuery.toLowerCase()))
                            : NATIONALITIES
                          ).map(n => (
                            <button key={n} type="button"
                              onClick={() => { setQuickNationality(n === quickNationality ? '' : n); setQuickNatOpen(false); setQuickNatQuery('') }}
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
                            >
                              <Check className={`h-3.5 w-3.5 shrink-0 ${quickNationality === n ? 'opacity-100' : 'opacity-0'}`} />
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                {hasLead && ageYears !== null && !isChildPreview ? (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" className="h-3 w-3 accent-[#bdac7e]" checked={quickSetAsLead}
                      onChange={e => setQuickSetAsLead(e.target.checked)} />
                    <span className="text-[10px] text-muted-foreground">Set as group lead</span>
                  </label>
                ) : <span />}
                <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs" disabled={!quickFirstName.trim() || quickSaving} onClick={createAndAddGuest}>
                  {quickSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Add Guest
                </Button>
                </div>
              </div>
            </div>
            )
          })()}
        </div>

        {/* Lead Guest selector — booking level */}
        {guests.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-[#bdac7e]/40 bg-[#bdac7e]/5 px-3 py-2">
            <Crown className="h-4 w-4 text-[#bdac7e] shrink-0" />
            <Label className="text-sm shrink-0">Lead Guest</Label>
            <Select
              value={guests.find(g => g.isLead)?.customerId ?? ''}
              onValueChange={id => setLead(id)}
            >
              <SelectTrigger className="h-8 text-sm flex-1 border-[#bdac7e]/30 bg-background">
                <SelectValue placeholder="Select lead guest…" />
              </SelectTrigger>
              <SelectContent>
                {guests.filter(g => !g.isChild).map(g => (
                  <SelectItem key={g.customerId} value={g.customerId}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {dropError && (
          <p className="text-xs text-destructive bg-destructive/8 rounded-lg px-3 py-2 border border-destructive/20">{dropError}</p>
        )}

        <div className="flex gap-3" style={{ minHeight: 200 }}>
          {/* Unassigned pool */}
          <div
            onDragOver={e => { e.preventDefault(); setDropTarget('unassigned') }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => dndDrop(e, 'unassigned')}
            className={cn(
              'w-44 shrink-0 rounded-xl border-2 border-dashed p-3 flex flex-col gap-1.5 transition-colors',
              dropTarget === 'unassigned' ? 'border-[#bdac7e] bg-[#bdac7e]/5' : 'border-muted-foreground/25',
            )}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
              Guests ({guests.length})
            </p>
            <p className="text-[10px] text-muted-foreground">
              {tripType === 'OPEN_TRIP' ? 'Cabin required ↓' : 'Drag to cabin (optional) →'}
            </p>
            <div className="flex flex-col gap-1 mt-1">
              {unassigned.map(g => pill(g))}
            </div>
            {guests.length > 0 && unassigned.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic mt-1">All assigned ✓</p>
            )}
          </div>

          {/* Cabin grid */}
          <div className="flex-1 min-w-0">
            {cabins.length === 0 ? (
              <div className="h-full border-2 border-dashed rounded-xl flex items-center justify-center text-sm text-muted-foreground">
                No cabins for this yacht
              </div>
            ) : (
              (() => {
                const activeYachtId = tripType === 'OPEN_TRIP'
                  ? openTrips.find(t => t.id === openTripId)?.yachtId
                  : yachtId
                const activeYacht = yachts.find(y => y.id === activeYachtId)
                const extraBedTierPrice = (() => {
                  if (!activeYacht?.extraBedTiers?.length) return 0
                  if (tripType === 'OPEN_TRIP') {
                    const t = activeYacht.extraBedTiers.find(t => t.nights === tripNights)
                    return t?.price ?? 0
                  }
                  if (startDate && endDate) {
                    const nights = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) - 1)
                    const t = activeYacht.extraBedTiers.find(t => t.nights === nights)
                      ?? activeYacht.extraBedTiers.reduce((a, b) => Math.abs(b.nights - nights) < Math.abs(a.nights - nights) ? b : a)
                    return t?.price ?? 0
                  }
                  return 0
                })()
                return (
              <div className={cn('grid gap-2', cabins.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : cabins.length <= 6 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
                {cabins.map(c => {
                  const myOcc      = cabinOccupancy[c.id] ?? 0
                  const extOcc     = existingCabinOccupancy[c.id] ?? 0
                  // In complete-booking mode, subtract the on-hold booking's own cabin slots
                  // so they don't appear as "blocked by another booking"
                  const adjustedExtOcc = completeBookingId
                    ? Math.max(0, extOcc - (originalHoldCabins[c.id] ?? 0))
                    : extOcc
                  const totalOcc   = myOcc + adjustedExtOcc

                  // For open trips: external booking blocks the whole cabin; local occupancy respects cabin capacity
                  const isBlockedByOther = tripType === 'OPEN_TRIP' && adjustedExtOcc > 0
                  const effectiveCap = c.capacity + (cabinExtraBeds[c.id] ?? 0)
                  const isFull = isBlockedByOther || totalOcc >= effectiveCap
                  const isOver      = dropTarget === c.id
                  const cabinGuests = guests.filter(g => g.cabinId === c.id)
                  const infantsInCabin = cabinGuests.filter(g => g.isInfant).length
                  const available   = Math.max(0, effectiveCap - totalOcc)
                  // dragging guest — determine if it's an infant so we can allow drop on full cabins
                  const draggingIsInfant = !!dragGuest && !!guests.find(g => g.customerId === dragGuest)?.isInfant

                  return (
                    <div
                      key={c.id}
                      onDragOver={e => {
                        const isAlready = guests.find(g => g.customerId === dragGuest)?.cabinId === c.id
                        if (!isBlockedByOther && (!isFull || draggingIsInfant || isAlready)) {
                          e.preventDefault(); setDropTarget(c.id)
                        }
                      }}
                      onDragLeave={e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                      }}
                      onDrop={e => dndDrop(e, c.id)}
                      className={cn(
                        'rounded-xl border-2 p-3 transition-all min-h-28',
                        isBlockedByOther
                          ? 'border-red-300 bg-red-50/60 opacity-75 cursor-not-allowed'
                          : isOver && (draggingIsInfant || !isFull)
                          ? 'border-[#bdac7e] bg-[#bdac7e]/8 shadow-md scale-[1.01]'
                          : isFull
                          ? 'border-orange-300 bg-orange-50/40'
                          : 'border-border hover:border-muted-foreground/40',
                      )}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{c.name}</p>
                          {c.deck && <p className="text-[10px] text-muted-foreground">{c.deck}</p>}
                          {c.bedType && <p className="text-[10px] text-muted-foreground">{c.bedType}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {isFull && !isBlockedByOther && infantsInCabin > 0 && (
                            <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 text-rose-600 bg-rose-50 border border-rose-200">
                              +{infantsInCabin} 👶
                            </span>
                          )}
                          <span className={cn(
                            'text-[10px] font-bold rounded-full px-1.5 py-0.5',
                            isBlockedByOther ? 'text-red-600 bg-red-100'
                            : isFull         ? 'text-orange-600 bg-orange-100'
                            :                  'text-muted-foreground bg-muted',
                          )}>
                            {isBlockedByOther ? 'Booked' : isFull ? 'Full' : `${available} left`}
                          </span>
                        </div>
                      </div>
                      {(() => {
                        if (tripType === 'OPEN_TRIP' && tripNights > 0) {
                          const tier = c.pricingTiers?.find(t => t.nights === tripNights)
                          const display = tier ? tier.price : (c.price > 0 ? c.price * tripNights : 0)
                          if (!display) return null
                          return (
                            <p className="text-[10px] font-semibold" style={{ color: ACCENT }}>
                              ${display.toLocaleString()} ({tripNights}N{tier ? '' : ' est.'})
                            </p>
                          )
                        }
                        return c.price > 0
                          ? <p className="text-[10px] font-semibold" style={{ color: ACCENT }}>${c.price.toLocaleString()}/night</p>
                          : null
                      })()}
                      {/* occupancy bar */}
                      <div className="w-full h-1 rounded-full bg-muted my-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: isBlockedByOther ? '100%' : `${Math.min(100, (totalOcc / effectiveCap) * 100)}%`,
                            backgroundColor: isBlockedByOther ? '#ef4444' : isFull ? '#f97316' : ACCENT,
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {isBlockedByOther && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                            Reserved by {cabinSalesperson[c.id] || 'another booking'}
                          </span>
                        )}
                        {!isBlockedByOther && cabinGuests.map(g => pill(g, true))}
                        {!isFull && !isBlockedByOther && cabinGuests.length === 0 && (
                          <span className="text-[10px] text-muted-foreground/60 italic">drop here</span>
                        )}
                        {isFull && !isBlockedByOther && cabinGuests.length === 0 && (
                          <span className="text-[10px] text-muted-foreground/60 italic">infant only</span>
                        )}
                      </div>
                      {!isBlockedByOther && myOcc > effectiveCap && (
                        <p className="text-[10px] text-red-600 font-medium mt-1">
                          ⚠ Over capacity — {myOcc - effectiveCap} guest(s) need to be moved
                        </p>
                      )}
                      {/* Extra beds stepper — only when cabin has guests and extraBeds available */}
                      {!isBlockedByOther && cabinGuests.length > 0 && c.extraBeds > 0 && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-border">
                          <div>
                            <span className="text-[10px] text-muted-foreground font-medium">Extra bed</span>
                            {extraBedTierPrice > 0 && (
                              <span className="text-[10px] ml-1" style={{ color: ACCENT }}>(+${extraBedTierPrice.toLocaleString()}/bed)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                const newVal = Math.max(0, (cabinExtraBeds[c.id] ?? 0) - 1)
                                setCabinExtraBeds(prev => ({ ...prev, [c.id]: newVal }))
                                // evict last non-lead guest if cabin is now over capacity
                                const newCap = c.capacity + newVal
                                setGuests(prev => {
                                  const inCabin = prev.filter(g => g.cabinId === c.id)
                                  if (inCabin.length <= newCap) return prev
                                  // remove last non-lead guest from cabin
                                  let evicted = false
                                  return [...prev].reverse().map(g => {
                                    if (!evicted && g.cabinId === c.id && !g.isLead) { evicted = true; return { ...g, cabinId: '' } }
                                    return g
                                  }).reverse()
                                })
                              }}
                              className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted text-xs font-bold leading-none"
                            >−</button>
                            <span className="text-[11px] font-semibold w-4 text-center">{cabinExtraBeds[c.id] ?? 0}</span>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setCabinExtraBeds(prev => ({ ...prev, [c.id]: Math.min(c.extraBeds, (prev[c.id] ?? 0) + 1) })) }}
                              className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted text-xs font-bold leading-none"
                            >+</button>
                            <span className="text-[10px] text-muted-foreground">/ {c.extraBeds}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
                )
              })()
            )}
          </div>
        </div>

        </>)}

        {tripType === 'PRIVATE_CHARTER' && yachts.find(y => y.id === yachtId)?.canDiving && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Diving</Label>
                <p className="text-xs text-muted-foreground">Guests will be participating in diving activities</p>
              </div>
              <Switch checked={hasDiving} onCheckedChange={setHasDiving} />
            </div>
          </>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════════
     STEP 3 — PRICING
  ════════════════════════════════════════════ */
  const step3 = () => {
    const b       = parseFloat(basePrice) || 0
    const da      = discountAmt
    const svc     = services.reduce((sum, x) => sum + (parseFloat(x.price) || 0) * (parseInt(x.qty) || 1), 0)

    // Extra bed cost (for breakdown display)
    const totalExtraBeds = Object.values(cabinExtraBeds).reduce((s, n) => s + n, 0)
    const extraBedCost = (() => {
      if (totalExtraBeds === 0) return 0
      const activeYachtId = tripType === 'OPEN_TRIP' ? openTrips.find(t => t.id === openTripId)?.yachtId : yachtId
      const ay = yachts.find(y => y.id === activeYachtId)
      if (!ay?.extraBedTiers?.length) return 0
      let nights = 0
      if (tripType === 'OPEN_TRIP') {
        const ot = openTrips.find(t => t.id === openTripId)
        nights = ot ? Math.max(1, Math.ceil((new Date(ot.endDate).getTime() - new Date(ot.startDate).getTime()) / 86400000)) : 0
      } else if (startDate && endDate) {
        nights = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) - 1)
      }
      const tier = ay.extraBedTiers.find(t => t.nights === nights)
        ?? ay.extraBedTiers.reduce((a, b) => Math.abs(b.nights - nights) < Math.abs(a.nights - nights) ? b : a)
      return totalExtraBeds * (tier?.price ?? 0)
    })()
    const tot     = Math.max(0, b - da) + svc

    // Agent commission deduction — applied on base price only, not additional services
    const selectedAgent = source === 'AGENT' ? agents.find(a => a.id === agentId) : undefined
    const commPct  = tripType === 'OPEN_TRIP' ? (selectedAgent?.commissionOpenTrip ?? 0) : (selectedAgent?.commissionPrivateCharter ?? 0)
    const commAmt  = commPct > 0 ? Math.max(0, b - da) * commPct / 100 : 0
    const netTot   = tot - commAmt

    const toLocal = (usd: number) => usd * manualRate

    const localHint = (usd: number) =>
      currency === 'USD' ? null : (
        <p className="text-xs text-muted-foreground mt-1">
          ≈ {CURRENCIES[currency].symbol}{toLocal(usd).toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[currency].decimals })} {currency}
        </p>
      )

    return (
      <div className="space-y-4">

        {/* Currency selector — full width */}
        <div className="rounded-xl border px-4 py-3 space-y-2" style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}06` }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="shrink-0 mr-1">
              <span className="text-sm font-medium text-muted-foreground">Invoice Currency</span>
              <p className="text-[10px] text-muted-foreground">All prices entered in USD</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CURRENCIES) as CurrencyCode[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const newRateFromUSD = c === 'USD' ? 1 : parseFloat((1 / CURRENCIES[c].rateToUSD).toFixed(c === 'IDR' ? 0 : 4))
                    setManualRate(newRateFromUSD)
                    setCurrency(c)
                  }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                    currency === c ? 'text-white' : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                  style={currency === c ? { backgroundColor: ACCENT, borderColor: ACCENT } : {}}
                >
                  {CURRENCIES[c].symbol} {c}
                </button>
              ))}
            </div>
          </div>
          {currency !== 'USD' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">1 USD =</span>
              <input
                type="number"
                min="0.000001"
                step={currency === 'IDR' ? 100 : 0.0001}
                value={manualRate}
                onChange={e => {
                  const r = parseFloat(e.target.value)
                  if (r > 0) setManualRate(r)
                }}
                className="w-28 text-xs border rounded px-2 py-0.5 text-center font-mono bg-background focus:outline-none focus:ring-1"
                style={{ borderColor: `${ACCENT}60` }}
              />
              <span className="text-xs text-muted-foreground font-medium">{currency}</span>
            </div>
          )}
        </div>

        {/* 2-column body — stacks on small screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

          {/* ── LEFT: Price inputs ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</p>

            {/* Base Price */}
            <div className="space-y-1.5">
              <Label>Base Price <span className="text-red-500">*</span> <span className="text-muted-foreground font-normal">(USD)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground select-none">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="pl-7"
                  value={
                    baseFocused || !basePrice
                      ? basePrice
                      : (parseFloat(basePrice) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
                  }
                  onFocus={() => setBaseFocused(true)}
                  onBlur={() => setBaseFocused(false)}
                  onChange={e => setBase(e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                />
              </div>
              {localHint(b)}
              {(tripType === 'OPEN_TRIP' || selectedYacht) && (
                <p className="text-xs text-muted-foreground">
                  {tripType === 'OPEN_TRIP'
                    ? `Cabin price/night × ${tripNights} night${tripNights !== 1 ? 's' : ''} per assigned cabin`
                    : `$${selectedYacht!.dailyRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}/day × trip duration`}
                </p>
              )}
            </div>

            {/* Voucher */}
            <div className="space-y-1.5">
              <Label>Voucher / Discount</Label>
              <Select
                value={voucherApplied?.id ?? '__none'}
                onValueChange={val => {
                  setVoucherError('')
                  if (val === '__none') { removeVoucher(); return }
                  const v = activeVouchers.find(x => x.id === val)
                  if (!v) return
                  const basePriceUSD = parseFloat(basePrice) || 0
                  if (v.minBooking != null && basePriceUSD < v.minBooking) {
                    setVoucherError(`Minimum booking $${v.minBooking.toLocaleString()} — current base is $${basePriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
                    return
                  }
                  if (v.maxUses != null && v.usedCount >= v.maxUses) {
                    setVoucherError('Voucher usage limit has been reached')
                    return
                  }
                  setVoucherApplied({ id: v.id, code: v.code, name: v.name, type: v.type, value: v.value })
                  if (v.type === 'PERCENTAGE') setDisc(String(v.value))
                  else setDisc('0')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No voucher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No voucher</SelectItem>
                  {activeVouchers.map(v => (
                    <SelectItem
                      key={v.id}
                      value={v.id}
                      disabled={v.maxUses != null && v.usedCount >= v.maxUses}
                    >
                      <span className="font-mono font-semibold">{v.code}</span>
                      <span className="text-muted-foreground ml-2">
                        — {v.name} ({v.type === 'PERCENTAGE' ? `${v.value}%` : `$${v.value}`} off)
                        {v.maxUses != null ? ` · ${v.usedCount}/${v.maxUses} used` : ''}
                      </span>
                    </SelectItem>
                  ))}
                  {activeVouchers.length === 0 && (
                    <SelectItem value="__empty" disabled>No active vouchers</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {voucherApplied && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <Tag className="h-3 w-3 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-700 font-medium">
                    {voucherApplied.type === 'PERCENTAGE' ? `${voucherApplied.value}% off` : `$${voucherApplied.value} off`} applied — {voucherApplied.name}
                  </span>
                </div>
              )}
              {voucherError && <p className="text-xs text-destructive">{voucherError}</p>}
            </div>

            {/* Discount */}
            {!voucherApplied && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Discount</Label>
                <div className="flex rounded-lg border overflow-hidden text-xs">
                  {(['percent', 'amount'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setDiscMode(m); setDisc('0'); setDiscFixed('') }}
                      className="px-3 py-1 font-medium transition-colors"
                      style={discMode === m ? { backgroundColor: '#1a5f6e', color: 'white' } : { color: 'var(--muted-foreground)' }}
                    >
                      {m === 'percent' ? '%' : '$'}
                    </button>
                  ))}
                </div>
              </div>
              {discMode === 'percent' ? (
                <div className="relative">
                  <Input
                    type="number" min="0" max="100" step="1"
                    placeholder="0"
                    value={discPct}
                    onChange={e => setDisc(e.target.value)}
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                  <Input
                    type="text" inputMode="decimal"
                    placeholder="0.00"
                    value={discFixed}
                    onChange={e => setDiscFixed(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="pl-7"
                  />
                </div>
              )}
              {discountAmt > 0 && (
                <p className="text-xs text-emerald-600">
                  Saves ${discountAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {discMode === 'percent' && (parseFloat(discPct) || 0) > 0 && ` (${discPct}% of base)`}
                </p>
              )}
            </div>
            )}

            {/* Additional Services */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Additional Services</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addSvc}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              {services.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No additional services</p>
              )}
              {services.map(sv => (
                <div key={sv.tempId} className="flex gap-2 items-center">
                  <Input placeholder="Service name" value={sv.name}
                    onChange={e => updateSvc(sv.tempId, { name: e.target.value })} />
                  {/* Qty */}
                  <div className="relative w-16 shrink-0">
                    <span className="absolute left-2 top-2.5 text-xs text-muted-foreground select-none">×</span>
                    <Input
                      type="number" min="1" step="1"
                      placeholder="1"
                      className="pl-5 text-center"
                      value={sv.qty}
                      onChange={e => updateSvc(sv.tempId, { qty: e.target.value.replace(/[^0-9]/g, '') || '1' })}
                    />
                  </div>
                  {/* Unit price */}
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground select-none">$</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      className="pl-6"
                      value={
                        svcFocused === sv.tempId || !sv.price
                          ? sv.price
                          : (parseFloat(sv.price) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
                      }
                      onFocus={() => setSvcFocused(sv.tempId)}
                      onBlur={() => setSvcFocused(null)}
                      onChange={e => updateSvc(sv.tempId, { price: e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '') })}
                    />
                  </div>
                  {/* Subtotal hint */}
                  {sv.price && parseInt(sv.qty) > 1 && (
                    <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                      = ${((parseFloat(sv.price) || 0) * (parseInt(sv.qty) || 1)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </span>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 ml-auto" onClick={() => removeSvc(sv.tempId)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Breakdown + Payment + Summary ── */}
          <div className="space-y-4">

            {/* Price Breakdown */}
            <div className="rounded-xl border p-4 space-y-2 text-sm" style={{ backgroundColor: `${ACCENT}08`, borderColor: `${ACCENT}30` }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Price Breakdown</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Price</span>
                <span className="font-medium">{fmtAmt(b - extraBedCost, 'USD')}</span>
              </div>
              {extraBedCost > 0 && (
                <div className="flex justify-between text-xs pl-2 text-muted-foreground">
                  <span>↳ Extra Bed ×{totalExtraBeds}</span>
                  <span>{fmtAmt(extraBedCost, 'USD')}</span>
                </div>
              )}
              {da > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>
                    {voucherApplied
                      ? `Voucher ${voucherApplied.code} (${voucherApplied.type === 'PERCENTAGE' ? `${voucherApplied.value}%` : `$${voucherApplied.value}`})`
                      : discMode === 'percent'
                        ? `Discount (${discPct}%)`
                        : 'Discount'}
                  </span>
                  <span>−{fmtAmt(da, 'USD')}</span>
                </div>
              )}
              {services.filter(x => x.name.trim()).map(sv => {
                const unitPrice = parseFloat(sv.price) || 0
                const qty = parseInt(sv.qty) || 1
                return (
                  <div key={sv.tempId} className="flex justify-between">
                    <span className="text-muted-foreground truncate max-w-[140px]">
                      {sv.name}{qty > 1 ? ` ×${qty}` : ''}
                    </span>
                    <span>{fmtAmt(unitPrice * qty, 'USD')}</span>
                  </div>
                )
              })}
              {commPct > 0 && (
                <div className="flex justify-between" style={{ color: '#6b7280', fontStyle: 'italic' }}>
                  <span className="text-xs">Agent Commission ({commPct}%)</span>
                  <span className="text-xs">({fmtAmt(commAmt, 'USD')})</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between items-end">
                <span className="font-semibold">Total</span>
                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color: ACCENT }}>{fmtAmt(netTot, 'USD')}</div>
                  {currency !== 'USD' && (
                    <div className="text-xs text-muted-foreground">
                      ≈ {CURRENCIES[currency].symbol}{toLocal(netTot).toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[currency].decimals })} {currency}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payment */}
            {(() => {
              const tripMaxDate = (tripType === 'PRIVATE_CHARTER'
                ? startDate
                : (openTrips.find(t => t.id === openTripId)?.startDate ?? '')
              ).split('T')[0]
              const today = new Date().toISOString().split('T')[0]
              const clampDep = (val: string) => {
                if (!val) return val
                if (val < today) return today
                if (tripMaxDate && val > tripMaxDate) return tripMaxDate
                return val
              }
              const clampFinal = (val: string, depVal: string) => {
                if (!val) return val
                const minF = depVal || today
                if (val < minF) return minF
                if (tripMaxDate && val > tripMaxDate) return tripMaxDate
                return val
              }
              return (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit Due Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={depositDueDate}
                    min={today}
                    max={tripMaxDate || undefined}
                    onChange={e => {
                      const val = clampDep(e.target.value)
                      setDepDue(val)
                      if (finalDueDate) setFinalDue(clampFinal(finalDueDate, val))
                    }} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Final Balance Due <span className="text-red-500">*</span></Label>
                  <Input type="date" value={finalDueDate}
                    min={depositDueDate || today}
                    max={tripMaxDate || undefined}
                    onChange={e => setFinalDue(clampFinal(e.target.value, depositDueDate))} />
                </div>
              </div>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                ⚠ Booking is auto-cancelled if deposit is unpaid by the due date.
              </p>
            </div>
              )
            })()}

            {/* Booking Summary */}
            <div className="rounded-xl border p-3 text-xs space-y-1.5 bg-muted/30">
              <p className="font-semibold text-sm mb-2">Booking Summary</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-muted-foreground">
                <span>Source</span>     <span className="text-foreground font-medium">{source === 'AGENT' ? 'Via Agent' : 'Direct'}</span>
                {source === 'AGENT' && agentId && (() => {
                  const ag = agents.find(a => a.id === agentId)
                  const cp = agentContacts.find(c => c.id === agentContactId)
                  return ag ? (
                    <>
                      <span>Agent</span>
                      <span className="text-foreground font-medium">{ag.name}</span>
                      {cp && (<><span>Contact</span><span className="text-foreground font-medium">{cp.name}</span></>)}
                    </>
                  ) : null
                })()}
                <span>Type</span>       <span className="text-foreground font-medium">{tripType === 'PRIVATE_CHARTER' ? 'Private Charter' : 'Open Trip'}</span>
                {tripType === 'OPEN_TRIP' && selectedOT && (
                  <><span>Trip</span><span className="text-foreground font-medium truncate">{selectedOT.title}</span></>
                )}
                {tripType === 'PRIVATE_CHARTER' && selectedYacht && (
                  <><span>Yacht</span><span className="text-foreground font-medium">{selectedYacht.name}</span></>
                )}
                {tripType === 'PRIVATE_CHARTER' && startDate && endDate && (
                  <><span>Dates</span><span className="text-foreground font-medium">{fmtDate(startDate)} → {fmtDate(endDate)}</span></>
                )}
                {destination && (
                  <><span>Destination</span><span className="text-foreground font-medium">{destination}</span></>
                )}
                <span>Guests</span>     <span className="text-foreground font-medium">{guests.length} person(s)</span>
                <span>Currency</span>
                <span className="text-foreground font-medium">
                  {currency}
                  {currency !== 'USD' && (
                    <span className="text-muted-foreground font-normal ml-1">
                      (1 USD = {manualRate.toLocaleString('en-US', { maximumFractionDigits: currency === 'IDR' ? 0 : 4 })} {currency})
                    </span>
                  )}
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    )
  }

  /* ─── Dialog title ── */
  const dialogTitle =
    completeBookingId     ? STEPS[step - 1].label :
    phase === 'source'    ? 'New Booking' :
    phase === 'agentInfo' ? 'Agent Information' :
    phase === 'tripType'  ? 'Select Trip Type' :
    STEPS[step - 1].label

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden gap-0 p-0" style={{ width: 'min(96vw, 64rem)', maxHeight: 'calc(100dvh - 4rem)' }}>
        <DialogHeader className="shrink-0 px-6 pt-3 pb-3 border-b">
          {phase === 'steps' && (
            <div className="flex items-center gap-2 mb-1">
              {completeBookingId && (
                <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300 border">Complete Booking</Badge>
              )}
              <Badge variant="outline" className="text-xs">{source === 'AGENT' ? 'Via Agent' : 'Direct'}</Badge>
              <Badge variant="outline" className="text-xs">
                {tripType === 'PRIVATE_CHARTER' ? 'Private Charter' : 'Open Trip'}
              </Badge>
            </div>
          )}
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
          <div className="px-6 py-3 min-w-0 overflow-x-hidden">
            {completeLoading ? (
              <div className="space-y-4 py-2">
                {/* step indicator */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-px w-8" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-px w-8" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
                {/* guest search bar */}
                <Skeleton className="h-9 w-full rounded-md" />
                {/* lead guest row */}
                <Skeleton className="h-10 w-full rounded-lg" />
                {/* cabin grid */}
                <div className="flex gap-3" style={{ minHeight: 200 }}>
                  <div className="w-44 shrink-0 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="rounded-xl border-2 border-border p-3 space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-2.5 w-14" />
                        <Skeleton className="h-2.5 w-16" />
                        <Skeleton className="h-1 w-full rounded-full mt-1" />
                        <Skeleton className="h-6 w-full rounded-md mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (<>
            {phase === 'source'    && phaseSource()}
            {phase === 'agentInfo' && phaseAgentInfo()}
            {phase === 'tripType'  && phaseTripType()}
            {phase === 'steps' && (
              <div>
                {stepIndicator()}
                {step === 1 && tripType === 'PRIVATE_CHARTER' && step1PC()}
                {step === 1 && tripType === 'OPEN_TRIP'       && step1OT()}
                {step === 2 && step2()}
                {step === 3 && step3()}
              </div>
            )}
            </>)}
          </div>
        </ScrollArea>

        {/* footer nav — only in agentInfo + steps phases */}
        {!completeLoading && (phase === 'agentInfo' || phase === 'steps') && (
          <div className="flex items-center justify-between px-6 py-2.5 border-t shrink-0 bg-muted/20">
            {/* In complete-booking mode, hide back on step 2; on step 3 allow going back */}
            {(!completeBookingId || step > 2) ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (completeBookingId) { setStep(step - 1); return }
                  if (phase === 'agentInfo') { setPhase('source'); setSource(null) }
                  else if (step > 1) setStep(step - 1)
                  else if (preselectedOpenTripId) setPhase(source === 'AGENT' ? 'agentInfo' : 'source')
                  else { setPhase('tripType'); setTrip(null) }
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {phase === 'agentInfo' || step === 1 ? 'Back' : 'Previous'}
              </Button>
            ) : <div />}

            {phase === 'agentInfo' ? (
              <Button
                disabled={!canNext()}
                onClick={() => { setPhase(preselectedOpenTripId ? 'steps' : 'tripType'); if (preselectedOpenTripId) setStep(1) }}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : step === 2 && isOnHold ? (
              <Button
                disabled={submitting || !canNext()}
                onClick={handleOnHoldSubmit}
                style={{ backgroundColor: '#f59e0b', color: 'white' }}
                className="hover:opacity-90"
              >
                {submitting ? 'Saving...' : 'Save as On Hold'}
              </Button>
            ) : step < 3 ? (
              <Button
                disabled={!canNext()}
                onClick={() => setStep(step + 1)}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                disabled={submitting || !canNext()}
                onClick={() => handleSubmit()}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                {submitting ? 'Saving...' : completeBookingId ? 'Confirm & Complete' : 'Confirm Booking'}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Open Trip conflict confirmation dialog */}
    <Dialog open={showOpenTripConflictDialog} onOpenChange={setShowOpenTripConflictDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="w-5 h-5" />
            Open Trip Conflict
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            The selected vessel has <span className="font-semibold text-foreground">{openTripConflicts.length} open trip(s)</span> whose dates overlap with this Private Charter:
          </p>
          <div className="rounded-lg border divide-y">
            {openTripConflicts.map(ot => (
              <div key={ot.id} className="px-3 py-2">
                <p className="font-medium">{ot.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(ot.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' – '}
                  {new Date(ot.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">
            The open trips above will be automatically closed with the note <span className="font-medium text-foreground">"Redirected to Private Charter"</span>. Proceed?
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setShowOpenTripConflictDialog(false)}>
            Cancel
          </Button>
          <Button
            style={{ backgroundColor: ACCENT, color: 'white' }}
            className="hover:opacity-90"
            onClick={() => {
              setShowOpenTripConflictDialog(false)
              handleSubmit(true)
            }}
          >
            Yes, Close & Create Booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
