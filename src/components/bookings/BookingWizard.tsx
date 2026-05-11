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
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  User, Users, Ship, Map, Plus, Trash2,
  ChevronLeft, ChevronRight, Check, Search, X, Loader2, Tag,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Source  = 'AGENT' | 'DIRECT'
type TripType = 'PRIVATE_CHARTER' | 'OPEN_TRIP'
type Phase   = 'source' | 'agentInfo' | 'tripType' | 'steps'

interface YachtOpt   { id: string; name: string; model?: string; capacity: number; dailyRate: number; status: string }
interface AgentOpt   { id: string; name: string; company?: string; commission: number }
interface CustomerOpt{ id: string; name: string; phone?: string; email?: string }
interface CabinOpt   { id: string; name: string; capacity: number; price: number; extraBeds: number; deck?: string; bedType?: string; pricingTiers?: { nights: number; price: number }[] }
interface OpenTripOpt{
  id: string; title: string; description?: string
  yachtId: string; startDate: string; endDate: string
  destination: string; pricePerCabin: number
  maxCapacity: number; spotsAvailable: number; status: string
  yacht: { name: string }
}

interface SelectedGuest {
  customerId: string
  name: string
  phone?: string
  cabinId: string
  isLead: boolean
}
interface ServiceEntry { tempId: string; name: string; price: string }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
  preselectedDate?: string
  preselectedOpenTripId?: string
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

export function BookingWizard({ open, onOpenChange, onSuccess, preselectedDate, preselectedOpenTripId }: Props) {
  /* phase state */
  const [phase,   setPhase]   = useState<Phase>('source')
  const [source,  setSource]  = useState<Source | null>(null)
  const [tripType,setTrip]    = useState<TripType | null>(null)
  const [step,    setStep]    = useState(1)

  /* agent state */
  const [agentId, setAgentId] = useState('')

  /* step-1 PC */
  const [yachtId,    setYachtId]    = useState('')
  const [startDate,  setStart]      = useState(preselectedDate ?? '')
  const [endDate,    setEnd]        = useState('')
  const [destination,setDest]       = useState('')
  const [notes,      setNotes]      = useState('')

  /* step-1 OT */
  const [openTripId, setOTId]   = useState('')

  /* step-2 */
  const [guests,    setGuests]  = useState<SelectedGuest[]>([])
  const [custSearch,setCSearch] = useState('')
  const [crewReq,   setCrewReq] = useState(false)

  /* step-3 */
  const [currency,       setCurrency]   = useState<CurrencyCode>('USD')
  const [basePrice,      setBase]       = useState('')
  const [discPct,        setDisc]       = useState('0')
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
  const [activeVouchers, setActiveVouchers] = useState<Array<{ id: string; code: string; name: string; type: string; value: number; minBooking: number | null; maxUses: number | null; usedCount: number }>>([])
  const [bookedCustomerIds,     setBookedCustomerIds]     = useState<string[]>([])
  const [existingCabinOccupancy,setExistingCabinOccupancy]= useState<Record<string,number>>({})
  const [submitting,setSubmitting]= useState(false)

  /* extra beds per cabin (cabinId → requested count) */
  const [cabinExtraBeds, setCabinExtraBeds] = useState<Record<string, number>>({})

  /* DnD state */
  const [dragGuest,  setDragGuest]  = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [dropError,  setDropError]  = useState<string | null>(null)

  /* quick guest creation */
  const [showQuickAdd,   setShowQuickAdd]   = useState(false)
  const [quickFirstName, setQuickFirstName] = useState('')
  const [quickLastName,  setQuickLastName]  = useState('')
  const [quickPhone,     setQuickPhone]     = useState('')
  const [quickEmail,     setQuickEmail]     = useState('')
  const [quickSaving,    setQuickSaving]    = useState(false)

  /* jump to open-trip step when pre-selected from calendar */
  useEffect(() => {
    if (!open || !preselectedOpenTripId) return
    setSource('DIRECT')
    setTrip('OPEN_TRIP')
    setPhase('steps')
    setStep(1)
    setOTId(preselectedOpenTripId)
  }, [open, preselectedOpenTripId])

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

  /* fetch cabins when yacht changes */
  useEffect(() => {
    const id = tripType === 'PRIVATE_CHARTER' ? yachtId
             : openTrips.find(t => t.id === openTripId)?.yachtId ?? ''
    if (!id) { setCabins([]); return }
    fetch(`/api/cabins?yachtId=${id}`).then(r => r.json()).then(d => {
      setCabins(Array.isArray(d) ? d : [])
    })
  }, [yachtId, openTripId, tripType, openTrips])

  /* fetch already-booked customers for selected open trip */
  useEffect(() => {
    if (!openTripId) { setBookedCustomerIds([]); return }
    fetch(`/api/bookings?openTripId=${openTripId}`)
      .then(r => r.json())
      .then((data: any[]) => {
        const ids: string[] = []
        const occ: Record<string, number> = {}
        if (Array.isArray(data)) {
          data.forEach(b => {
            if (b.customerId) ids.push(b.customerId)
            b.guests?.forEach((g: any) => {
              if (g.customerId) ids.push(g.customerId)
              const cabId = g.cabin?.id ?? g.cabinId
              if (cabId) occ[cabId] = (occ[cabId] ?? 0) + 1
            })
          })
        }
        setBookedCustomerIds([...new Set(ids)])
        setExistingCabinOccupancy(occ)
      })
      .catch(() => {})
  }, [openTripId])

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
      // fall back to pricePerCabin if no cabin prices at all
      usdPrice = cabinTotal > 0
        ? cabinTotal
        : assignedCabinIds.length * (ot.pricePerCabin ?? 0)
    } else if (tripType === 'PRIVATE_CHARTER') {
      const y = yachts.find(x => x.id === yachtId)
      if (y && startDate && endDate) {
        const days = Math.max(1, Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
        ))
        usdPrice = y.dailyRate * days
      }
    }
    if (usdPrice > 0) {
      setBase(usdPrice.toFixed(2))
    }
  }, [tripType, openTripId, yachtId, startDate, endDate, guests, cabins, yachts, openTrips])

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
    setOTId(''); setGuests([]); setCSearch(''); setCrewReq(false)
    setCurrency('USD'); setBase(''); setDisc('0'); setSvc([]); setDeposit(''); setDepDue(''); setFinalDue('')
    setManualRate(1); setBaseFocused(false); setSvcFocused(null)
    setVoucherApplied(null); setVoucherError('')
    setBookedCustomerIds([]); setExistingCabinOccupancy({})
    setCabinExtraBeds({})
    setDragGuest(null); setDropTarget(null); setDropError(null)
    setShowQuickAdd(false); setQuickFirstName(''); setQuickLastName(''); setQuickPhone(''); setQuickEmail('')
  }, [open])

  /* voucher remove */
  const removeVoucher = () => {
    setVoucherApplied(null)
    setVoucherError('')
    setDisc('0')
  }

  /* computed */
  const total = useMemo(() => {
    const b = parseFloat(basePrice) || 0
    const s = services.reduce((sum, x) => sum + (parseFloat(x.price) || 0), 0)
    if (voucherApplied) {
      const discount = voucherApplied.type === 'PERCENTAGE'
        ? b * (voucherApplied.value / 100)
        : voucherApplied.value
      return Math.max(0, b - discount) + s
    }
    const d = parseFloat(discPct) || 0
    return b * (1 - d / 100) + s
  }, [basePrice, discPct, services, voucherApplied])

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

  /* cabin occupancy map: cabinId → guest count */
  const cabinOccupancy = guests.reduce<Record<string, number>>((acc, g) => {
    if (g.cabinId) acc[g.cabinId] = (acc[g.cabinId] ?? 0) + 1
    return acc
  }, {})

  /* guest helpers */
  const addGuest = (c: CustomerOpt) => {
    setGuests(prev => [
      ...prev,
      { customerId: c.id, name: c.name, phone: c.phone, cabinId: '', isLead: prev.length === 0 },
    ])
    setCSearch('')
  }
  const removeGuest = (id: string) =>
    setGuests(prev => {
      const next = prev.filter(g => g.customerId !== id)
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
    setQuickSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone: quickPhone.trim(), email: quickEmail.trim() }),
      })
      if (res.ok) {
        const created: CustomerOpt = await res.json()
        setCustomers(prev => [created, ...prev])
        addGuest(created)
        setShowQuickAdd(false)
        setQuickFirstName(''); setQuickLastName(''); setQuickPhone(''); setQuickEmail('')
      }
    } finally { setQuickSaving(false) }
  }

  /* service helpers */
  const addSvc    = () => setSvc(s => [...s, { tempId: Date.now().toString(), name: '', price: '' }])
  const removeSvc = (id: string) => setSvc(s => s.filter(x => x.tempId !== id))
  const updateSvc = (id: string, p: Partial<ServiceEntry>) =>
    setSvc(s => s.map(x => x.tempId === id ? { ...x, ...p } : x))

  /* validation */
  const canNext = () => {
    if (phase === 'agentInfo') return !!agentId
    if (step === 1) {
      if (tripType === 'PRIVATE_CHARTER') return !!(yachtId && startDate && endDate)
      return !!openTripId
    }
    if (step === 2) return guests.length > 0
    if (step === 3) return !!(parseFloat(basePrice) > 0) && !!depositDueDate && !!finalDueDate
    return true
  }

  /* submit */
  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const resolvedAgentId = source === 'AGENT' ? agentId : undefined

      const ot = openTrips.find(t => t.id === openTripId)

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripType,
          source,
          agentId: resolvedAgentId,
          yachtId: tripType === 'PRIVATE_CHARTER' ? yachtId : ot?.yachtId,
          openTripId: tripType === 'OPEN_TRIP' ? openTripId : undefined,
          startDate: tripType === 'OPEN_TRIP' ? ot?.startDate : startDate,
          endDate:   tripType === 'OPEN_TRIP' ? ot?.endDate   : endDate,
          destination: tripType === 'OPEN_TRIP' ? ot?.destination : destination,
          totalPrice:    total,
          depositPaid:   parseFloat(deposit) || 0,
          discount:      voucherApplied?.type === 'PERCENTAGE' ? voucherApplied.value : parseFloat(discPct) || 0,
          voucherCode:   voucherApplied?.code ?? undefined,
          currency,
          exchangeRate:  currency !== 'USD' ? manualRate : undefined,
          depositDueDate: depositDueDate || undefined,
          finalDueDate:   finalDueDate   || undefined,
          crewRequired:  crewReq,
          notes: (() => {
            const extraLines = Object.entries(cabinExtraBeds)
              .filter(([, n]) => n > 0)
              .map(([cid, n]) => `Extra bed ×${n} (${cabins.find(c => c.id === cid)?.name ?? cid})`)
            const extraNote = extraLines.length ? `[Extra Beds] ${extraLines.join(', ')}` : ''
            return [notes, extraNote].filter(Boolean).join('\n') || undefined
          })(),
          guests: guests.map(g => ({ customerId: g.customerId, cabinId: g.cabinId || undefined, isLead: g.isLead })),
          services: services.filter(s => s.name.trim()),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
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
    <div className="flex items-center justify-center mb-6">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold')}
              style={step >= s.num
                ? { backgroundColor: ACCENT, color: 'white' }
                : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              {step > s.num ? <Check className="w-4 h-4" /> : s.num}
            </div>
            <span
              className="text-xs whitespace-nowrap font-medium"
              style={{ color: step === s.num ? ACCENT : 'var(--muted-foreground)' }}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="h-px w-12 mx-2 mb-5 transition-colors"
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
              setPhase(val === 'AGENT' ? 'agentInfo' : 'tripType')
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
        <h3 className="text-xl font-semibold">Pilih Agent</h3>
        <p className="text-sm text-muted-foreground mt-1">Pilih travel agent untuk booking ini</p>
      </div>

      <div className="space-y-1.5">
        <Label>Agent <span className="text-destructive">*</span></Label>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger><SelectValue placeholder="Pilih agent…" /></SelectTrigger>
          <SelectContent>
            {agents.length === 0
              ? <SelectItem value="_" disabled>Belum ada agent</SelectItem>
              : agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.company ? ` — ${a.company}` : ''} ({a.commission}%)
                  </SelectItem>
                ))
            }
          </SelectContent>
        </Select>
      </div>

      {agents.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Belum ada agent terdaftar. Tambahkan agent terlebih dahulu melalui menu <strong>Agents</strong>.
        </p>
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Date <span className="text-destructive">*</span></Label>
          <Input type="date" value={startDate} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>End Date <span className="text-destructive">*</span></Label>
          <Input type="date" value={endDate} min={startDate} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>

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
    // Hide closed/cancelled trips — they're past or manually removed
    const visibleTrips = openTrips.filter(t => t.status !== 'closed' && t.status !== 'cancelled')

    const statusBadge = (t: OpenTripOpt) => {
      if (t.status === 'full')
        return <Badge className="text-xs bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">Full</Badge>
      return (
        <Badge variant="outline" className="text-xs" style={{ borderColor: '#4a9f6e', color: '#4a9f6e' }}>
          Open
        </Badge>
      )
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Select an available scheduled trip</p>
        {openTripsLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleTrips.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No open trips available. All trips are either full, closed, or none have been scheduled.
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {!openTripsLoading && visibleTrips.map(t => {
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
                  isFull
                    ? 'border-border bg-muted/20 opacity-50 cursor-not-allowed'
                    : selected
                      ? 'shadow-sm'
                      : 'border-border bg-card hover:border-foreground/20 hover:shadow-sm'
                )}
                style={!isFull && selected ? { borderColor: ACCENT, backgroundColor: `${ACCENT}06` } : {}}
              >
                {/* Top row */}
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selected && !isFull && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT }}>
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <span className="font-semibold text-sm truncate">{t.title}</span>
                    {statusBadge(t)}
                  </div>
                  {/* Cabin availability pill */}
                  {isFull ? (
                    <span className="text-[10px] font-semibold bg-red-100 text-red-600 rounded-full px-2.5 py-0.5 shrink-0">Sold Out</span>
                  ) : (
                    <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 shrink-0 whitespace-nowrap">
                      {t.spotsAvailable}/{t.maxCapacity} cabin tersedia
                    </span>
                  )}
                </div>
                {/* Info rows */}
                <div className="px-4 pb-3.5 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="opacity-60">🚢</span> {t.yacht.name}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="opacity-60">📅</span>
                    {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                    <span className="text-[10px] bg-muted rounded px-1 py-px">{nights}N</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="opacity-60">📍</span> {t.destination}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
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
      if (!already && extOccDrop > 0) {
        setDropError(`${cabin?.name} is already reserved by another booking`)
        return
      }
      if (!already && myOccDrop >= (cabin?.capacity ?? 0)) {
        setDropError(`${cabin?.name} is full (capacity ${cabin?.capacity})`)
        return
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
        <span className="truncate max-w-24">{g.name}</span>
        {!inCabin && !g.isLead && (
          <button onClick={e => { e.stopPropagation(); setLead(g.customerId) }}
            className="text-[9px] text-muted-foreground hover:text-foreground ml-0.5 shrink-0">★</button>
        )}
        <button onClick={e => { e.stopPropagation(); removeGuest(g.customerId) }}
          className="ml-0.5 text-muted-foreground hover:text-destructive shrink-0">
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    )

    return (
      <div className="space-y-4">
        {/* Search */}
        <div className="space-y-1.5">
          <Label>Add Guests <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search customer by name or phone…"
              value={custSearch}
              onChange={e => setCSearch(e.target.value)}
            />
          </div>
          {custSearch && (
            <div className="border rounded-lg bg-popover shadow-md overflow-hidden z-10 relative">
              {filteredCusts.length === 0 ? (
                <div>
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {customers.some(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) && bookedCustomerIds.includes(c.id))
                      ? '⚠ Already booked on this trip'
                      : 'No guest found'}
                  </div>
                  <button
                    onClick={() => { setShowQuickAdd(true); setQuickFirstName(custSearch); setCSearch('') }}
                    className="w-full text-left px-3 py-2 text-sm text-[#bdac7e] hover:bg-accent transition-colors flex items-center gap-2 border-t">
                    <Plus className="h-3.5 w-3.5" /> Add &ldquo;{custSearch}&rdquo; as new guest
                  </button>
                </div>
              ) : (
                <ScrollArea className="max-h-36">
                  {filteredCusts.slice(0, 8).map(c => (
                    <button key={c.id} onClick={() => addGuest(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex justify-between">
                      <span>{c.name}</span>
                      {c.phone && <span className="text-muted-foreground text-xs">{c.phone}</span>}
                    </button>
                  ))}
                  <button
                    onClick={() => { setShowQuickAdd(true); setCSearch('') }}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors flex items-center gap-2 border-t">
                    <Plus className="h-3 w-3" /> Create new guest
                  </button>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Inline quick-add form */}
          {showQuickAdd && (
            <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Guest</p>
                <button onClick={() => setShowQuickAdd(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
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
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-8 text-sm mt-1" value={quickPhone} onChange={e => setQuickPhone(e.target.value)} placeholder="+62 812..." />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input className="h-8 text-sm mt-1" value={quickEmail} onChange={e => setQuickEmail(e.target.value)} placeholder="email@..." />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs" disabled={!quickFirstName.trim() || quickSaving} onClick={createAndAddGuest}>
                  {quickSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Add Guest
                </Button>
              </div>
            </div>
          )}
        </div>

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
            <p className="text-[10px] text-muted-foreground">Drag to a cabin →</p>
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
              <div className={cn('grid gap-2', cabins.length <= 3 ? 'grid-cols-3' : cabins.length <= 6 ? 'grid-cols-3' : 'grid-cols-4')}>
                {cabins.map(c => {
                  const myOcc      = cabinOccupancy[c.id] ?? 0
                  const extOcc     = existingCabinOccupancy[c.id] ?? 0
                  const totalOcc   = myOcc + extOcc

                  // For open trips: external booking blocks the whole cabin; local occupancy respects cabin capacity
                  const isBlockedByOther = tripType === 'OPEN_TRIP' && extOcc > 0
                  const isFull = isBlockedByOther || totalOcc >= c.capacity
                  const isOver      = dropTarget === c.id
                  const cabinGuests = guests.filter(g => g.cabinId === c.id)
                  const available   = Math.max(0, c.capacity - totalOcc)

                  return (
                    <div
                      key={c.id}
                      onDragOver={e => {
                        if (!isFull || guests.find(g => g.customerId === dragGuest)?.cabinId === c.id) {
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
                          : isFull
                          ? 'border-orange-300 bg-orange-50/40'
                          : isOver
                          ? 'border-[#bdac7e] bg-[#bdac7e]/8 shadow-md scale-[1.01]'
                          : 'border-border hover:border-muted-foreground/40',
                      )}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{c.name}</p>
                          {c.deck && <p className="text-[10px] text-muted-foreground">{c.deck}</p>}
                          {c.bedType && <p className="text-[10px] text-muted-foreground">{c.bedType}</p>}
                        </div>
                        <span className={cn(
                          'text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 ml-1',
                          isBlockedByOther ? 'text-red-600 bg-red-100'
                          : isFull         ? 'text-orange-600 bg-orange-100'
                          :                  'text-muted-foreground bg-muted',
                        )}>
                          {isBlockedByOther ? 'Booked' : isFull ? 'Selected' : `${available} left`}
                        </span>
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
                            width: isBlockedByOther ? '100%' : `${Math.min(100, (totalOcc / c.capacity) * 100)}%`,
                            backgroundColor: isBlockedByOther ? '#ef4444' : isFull ? '#f97316' : ACCENT,
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {isBlockedByOther && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                            Reserved by another booking
                          </span>
                        )}
                        {!isBlockedByOther && cabinGuests.map(g => pill(g, true))}
                        {!isFull && !isBlockedByOther && cabinGuests.length === 0 && (
                          <span className="text-[10px] text-muted-foreground/60 italic">drop here</span>
                        )}
                      </div>
                      {/* Extra beds stepper — only when cabin has guests and extraBeds available */}
                      {!isBlockedByOther && cabinGuests.length > 0 && c.extraBeds > 0 && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-border">
                          <span className="text-[10px] text-muted-foreground font-medium">Extra bed</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setCabinExtraBeds(prev => ({ ...prev, [c.id]: Math.max(0, (prev[c.id] ?? 0) - 1) })) }}
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
            )}
          </div>
        </div>

        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <Label>Crew Required</Label>
            <p className="text-xs text-muted-foreground">Assign crew to this booking</p>
          </div>
          <Switch checked={crewReq} onCheckedChange={setCrewReq} />
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════════
     STEP 3 — PRICING
  ════════════════════════════════════════════ */
  const step3 = () => {
    const b       = parseFloat(basePrice) || 0
    const d       = voucherApplied?.type === 'PERCENTAGE' ? voucherApplied.value : (parseFloat(discPct) || 0)
    const svc     = services.reduce((sum, x) => sum + (parseFloat(x.price) || 0), 0)
    const da      = voucherApplied
      ? (voucherApplied.type === 'PERCENTAGE'
          ? b * (voucherApplied.value / 100)
          : voucherApplied.value)
      : b * (d / 100)
    const tot     = Math.max(0, b - da) + svc

    // Agent commission deduction (display only — totalPrice stored gross)
    const selectedAgent = source === 'AGENT' ? agents.find(a => a.id === agentId) : undefined
    const commPct  = selectedAgent?.commission ?? 0
    const commAmt  = commPct > 0 ? tot * commPct / 100 : 0
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
        <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5" style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}06` }}>
          <div className="shrink-0">
            <span className="text-sm font-medium text-muted-foreground">Invoice Currency</span>
            <p className="text-[10px] text-muted-foreground">All prices entered in USD</p>
          </div>
          <div className="flex gap-2">
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
          {currency !== 'USD' && (
            <div className="flex items-center gap-1.5 ml-auto">
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

        {/* 2-column body */}
        <div className="grid grid-cols-2 gap-5 items-start">

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
            <div className="space-y-1.5">
              <Label>Discount <span className="text-muted-foreground font-normal">(%)</span></Label>
              <Input type="number" min="0" max="100" step="1" value={discPct} onChange={e => setDisc(e.target.value)} />
              {d > 0 && (
                <p className="text-xs text-emerald-600">Saves {fmtAmt(da, 'USD')}</p>
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
                  <div className="relative w-32 shrink-0">
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
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeSvc(sv.tempId)}>
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
                <span className="font-medium">{fmtAmt(b, 'USD')}</span>
              </div>
              {da > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>
                    {voucherApplied
                      ? `Voucher ${voucherApplied.code} (${voucherApplied.type === 'PERCENTAGE' ? `${voucherApplied.value}%` : `$${voucherApplied.value}`})`
                      : `Discount (${d}%)`}
                  </span>
                  <span>−{fmtAmt(da, 'USD')}</span>
                </div>
              )}
              {services.filter(x => x.name.trim()).map(sv => (
                <div key={sv.tempId} className="flex justify-between">
                  <span className="text-muted-foreground truncate max-w-[140px]">{sv.name}</span>
                  <span>{fmtAmt(parseFloat(sv.price) || 0, 'USD')}</span>
                </div>
              ))}
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
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit Due Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={depositDueDate} onChange={e => setDepDue(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Final Balance Due <span className="text-red-500">*</span></Label>
                  <Input type="date" value={finalDueDate} min={depositDueDate} onChange={e => setFinalDue(e.target.value)} />
                </div>
              </div>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                ⚠ Booking is auto-cancelled if deposit is unpaid by the due date.
              </p>
            </div>

            {/* Booking Summary */}
            <div className="rounded-xl border p-3 text-xs space-y-1.5 bg-muted/30">
              <p className="font-semibold text-sm mb-2">Booking Summary</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-muted-foreground">
                <span>Source</span>     <span className="text-foreground font-medium">{source === 'AGENT' ? 'Via Agent' : 'Direct'}</span>
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
    phase === 'source'    ? 'New Booking' :
    phase === 'agentInfo' ? 'Agent Information' :
    phase === 'tripType'  ? 'Select Trip Type' :
    STEPS[step - 1].label

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl flex flex-col max-h-[92vh] overflow-hidden gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
          {phase === 'steps' && (
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">{source === 'AGENT' ? 'Via Agent' : 'Direct'}</Badge>
              <Badge variant="outline" className="text-xs">
                {tripType === 'PRIVATE_CHARTER' ? 'Private Charter' : 'Open Trip'}
              </Badge>
            </div>
          )}
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5">
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
          </div>
        </ScrollArea>

        {/* footer nav — only in agentInfo + steps phases */}
        {(phase === 'agentInfo' || phase === 'steps') && (
          <div className="flex items-center justify-between px-6 py-4 border-t shrink-0 bg-muted/20">
            <Button
              variant="outline"
              onClick={() => {
                if (phase === 'agentInfo') { setPhase('source'); setSource(null) }
                else if (step > 1) setStep(step - 1)
                else { setPhase('tripType'); setTrip(null) }
              }}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {phase === 'agentInfo' || step === 1 ? 'Back' : 'Previous'}
            </Button>

            {phase === 'agentInfo' ? (
              <Button
                disabled={!canNext()}
                onClick={() => setPhase('tripType')}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                Continue <ChevronRight className="w-4 h-4 ml-1" />
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
                onClick={handleSubmit}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                {submitting ? 'Creating...' : 'Confirm Booking'}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
