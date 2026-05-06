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
import { cn } from '@/lib/utils'
import {
  User, Users, Ship, Map, Plus, Trash2,
  ChevronLeft, ChevronRight, Check, Search, X, Loader2,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Source  = 'AGENT' | 'DIRECT'
type TripType = 'PRIVATE_CHARTER' | 'OPEN_TRIP'
type Phase   = 'source' | 'agentInfo' | 'tripType' | 'steps'

interface YachtOpt   { id: string; name: string; model?: string; capacity: number; dailyRate: number; status: string }
interface AgentOpt   { id: string; name: string; company?: string; commission: number }
interface CustomerOpt{ id: string; name: string; phone?: string; email?: string }
interface CabinOpt   { id: string; name: string; capacity: number; price: number; deck?: string; bedType?: string }
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

export function BookingWizard({ open, onOpenChange, onSuccess, preselectedDate }: Props) {
  /* phase state */
  const [phase,   setPhase]   = useState<Phase>('source')
  const [source,  setSource]  = useState<Source | null>(null)
  const [tripType,setTrip]    = useState<TripType | null>(null)
  const [step,    setStep]    = useState(1)

  /* agent state */
  const [agentMode,  setAgentMode]  = useState<'existing' | 'new'>('existing')
  const [agentId,    setAgentId]    = useState('')
  const [agentName,  setAgentName]  = useState('')
  const [agentCo,    setAgentCo]    = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [agentComm,  setAgentComm]  = useState('0')

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
  const [basePrice,  setBase]    = useState('')
  const [discPct,    setDisc]    = useState('0')
  const [services,   setSvc]     = useState<ServiceEntry[]>([])
  const [deposit,    setDeposit] = useState('')

  /* remote data */
  const [yachts,    setYachts]    = useState<YachtOpt[]>([])
  const [agents,    setAgents]    = useState<AgentOpt[]>([])
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [cabins,    setCabins]    = useState<CabinOpt[]>([])
  const [openTrips, setOpenTrips] = useState<OpenTripOpt[]>([])
  const [bookedCustomerIds,     setBookedCustomerIds]     = useState<string[]>([])
  const [existingCabinOccupancy,setExistingCabinOccupancy]= useState<Record<string,number>>({})
  const [submitting,setSubmitting]= useState(false)

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

  /* fetch on open */
  useEffect(() => {
    if (!open) return
    Promise.allSettled([
      fetch('/api/yachts').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/customers').then(r => r.json()),
      fetch('/api/open-trips?status=open').then(r => r.json()),
    ]).then(([y, a, c, ot]) => {
      if (y.status  === 'fulfilled') setYachts(Array.isArray(y.value)  ? y.value  : [])
      if (a.status  === 'fulfilled') setAgents(Array.isArray(a.value)  ? a.value  : [])
      if (c.status  === 'fulfilled') setCustomers(Array.isArray(c.value)? c.value : [])
      if (ot.status === 'fulfilled') setOpenTrips(Array.isArray(ot.value)? ot.value: [])
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

  /* auto base price */
  useEffect(() => {
    if (tripType === 'OPEN_TRIP') {
      // Sum of individual cabin prices for assigned cabins
      const assignedCabinIds = [...new Set(guests.filter(g => g.cabinId).map(g => g.cabinId))]
      const sum = assignedCabinIds.reduce((acc, id) => {
        const c = cabins.find(x => x.id === id)
        return acc + (c?.price ?? 0)
      }, 0)
      if (sum > 0) setBase(sum.toString())
    } else if (tripType === 'PRIVATE_CHARTER') {
      const y = yachts.find(x => x.id === yachtId)
      if (y && startDate && endDate) {
        const days = Math.max(1, Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
        ))
        setBase((y.dailyRate * days).toString())
      }
    }
  }, [tripType, openTripId, yachtId, startDate, endDate, guests, cabins, yachts, openTrips])

  /* reset on close */
  useEffect(() => {
    if (open) return
    setPhase('source'); setSource(null); setTrip(null); setStep(1)
    setAgentMode('existing'); setAgentId(''); setAgentName(''); setAgentCo(''); setAgentPhone(''); setAgentComm('0')
    setYachtId(''); setStart(preselectedDate ?? ''); setEnd(''); setDest(''); setNotes('')
    setOTId(''); setGuests([]); setCSearch(''); setCrewReq(false)
    setBase(''); setDisc('0'); setSvc([]); setDeposit('')
    setBookedCustomerIds([]); setExistingCabinOccupancy({})
    setDragGuest(null); setDropTarget(null); setDropError(null)
    setShowQuickAdd(false); setQuickFirstName(''); setQuickLastName(''); setQuickPhone(''); setQuickEmail('')
  }, [open, preselectedDate])

  /* computed */
  const total = useMemo(() => {
    const b = parseFloat(basePrice) || 0
    const d = parseFloat(discPct) || 0
    const s = services.reduce((sum, x) => sum + (parseFloat(x.price) || 0), 0)
    return b * (1 - d / 100) + s
  }, [basePrice, discPct, services])

  const selectedYacht   = yachts.find(y => y.id === yachtId)
  const selectedOT      = openTrips.find(t => t.id === openTripId)
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
    if (phase === 'agentInfo') {
      return agentMode === 'existing' ? !!agentId : !!agentName.trim()
    }
    if (step === 1) {
      if (tripType === 'PRIVATE_CHARTER') return !!(yachtId && startDate && endDate)
      return !!openTripId
    }
    if (step === 2) return guests.length > 0
    return true
  }

  /* submit */
  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      let resolvedAgentId: string | undefined

      if (source === 'AGENT') {
        if (agentMode === 'new') {
          const r = await fetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: agentName, company: agentCo, phone: agentPhone, commission: agentComm }),
          })
          const a = await r.json()
          resolvedAgentId = a.id
        } else {
          resolvedAgentId = agentId
        }
      }

      const ot = openTrips.find(t => t.id === openTripId)

      await fetch('/api/bookings', {
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
          totalPrice: total,
          depositPaid: parseFloat(deposit) || 0,
          discount: parseFloat(discPct) || 0,
          crewRequired: crewReq,
          notes: notes || undefined,
          guests: guests.map(g => ({ customerId: g.customerId, cabinId: g.cabinId || undefined, isLead: g.isLead })),
          services: services.filter(s => s.name.trim()),
          status: 'confirmed',
        }),
      })

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
        <h3 className="text-xl font-semibold">Agent Information</h3>
        <p className="text-sm text-muted-foreground mt-1">Enter the referring agent details</p>
      </div>

      {/* toggle */}
      <div className="flex rounded-lg border overflow-hidden">
        {(['existing', 'new'] as const).map(m => (
          <button
            key={m}
            onClick={() => setAgentMode(m)}
            className={cn('flex-1 py-2 text-sm font-medium transition-colors',
              agentMode === m ? 'text-white' : 'text-muted-foreground')}
            style={agentMode === m ? { backgroundColor: ACCENT } : {}}
          >
            {m === 'existing' ? 'Select Existing' : 'Add New Agent'}
          </button>
        ))}
      </div>

      {agentMode === 'existing' ? (
        <div className="space-y-1.5">
          <Label>Select Agent <span className="text-destructive">*</span></Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
            <SelectContent>
              {agents.length === 0 && <SelectItem value="_" disabled>No agents yet</SelectItem>}
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}{a.company ? ` — ${a.company}` : ''} ({a.commission}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Agent Name <span className="text-destructive">*</span></Label>
            <Input placeholder="Full name" value={agentName} onChange={e => setAgentName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input placeholder="Company name" value={agentCo} onChange={e => setAgentCo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+62..." value={agentPhone} onChange={e => setAgentPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Commission (%)</Label>
            <Input type="number" min="0" max="100" value={agentComm} onChange={e => setAgentComm(e.target.value)} />
          </div>
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
  const step1OT = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Select an available scheduled trip</p>
      {openTrips.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No open trips scheduled. Create one from the Trips management page.
        </div>
      )}
      <div className="space-y-3">
        {openTrips.map(t => {
          const selected   = openTripId === t.id
          const isSoldOut  = t.spotsAvailable === 0
          return (
            <button
              key={t.id}
              onClick={() => !isSoldOut && setOTId(t.id)}
              disabled={isSoldOut}
              className={cn(
                'w-full text-left p-4 rounded-xl border-2 transition-all',
                isSoldOut
                  ? 'border-border bg-muted/30 opacity-60 cursor-not-allowed'
                  : selected ? 'bg-card' : 'border-border bg-card hover:shadow-sm'
              )}
              style={!isSoldOut && selected ? { borderColor: ACCENT, backgroundColor: `${ACCENT}08` } : {}}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{t.title}</span>
                    {isSoldOut ? (
                      <Badge className="text-xs bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">
                        SOLD OUT
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: '#4a9f6e', color: '#4a9f6e' }}
                      >
                        {t.status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div>🚢 {t.yacht.name}</div>
                    <div>📅 {fmtDate(t.startDate)} → {fmtDate(t.endDate)}</div>
                    <div>📍 {t.destination}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {isSoldOut ? (
                    <div className="text-xs font-semibold text-red-600">
                      No spots left
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.spotsAvailable}/{t.maxCapacity} spots left
                      </div>
                      {selected && (
                        <div className="mt-1">
                          <Check className="w-4 h-4 ml-auto" style={{ color: ACCENT }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

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
                  // Cabin is full if taken by another booking OR current booking filled capacity
                  const isFull     = extOcc > 0 || myOcc >= c.capacity
                  const isOver     = dropTarget === c.id
                  const cabinGuests = guests.filter(g => g.cabinId === c.id)
                  const available  = isFull ? 0 : c.capacity - myOcc

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
                        isFull
                          ? 'border-red-300 bg-red-50/40 dark:bg-red-950/20'
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
                          isFull ? 'text-red-600 bg-red-100' : 'text-muted-foreground bg-muted',
                        )}>
                          {isFull ? 'Full' : `${available} left`}
                        </span>
                      </div>
                      {c.price > 0 && (
                        <p className="text-[10px] font-semibold" style={{ color: ACCENT }}>
                          ${c.price.toLocaleString()}/night
                        </p>
                      )}
                      {/* occupancy bar */}
                      <div className="w-full h-1 rounded-full bg-muted my-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (totalOcc / c.capacity) * 100)}%`,
                            backgroundColor: isFull ? '#e8547a' : ACCENT,
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {extOcc > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                            {extOcc} booked
                          </span>
                        )}
                        {cabinGuests.map(g => pill(g, true))}
                        {!isFull && cabinGuests.length === 0 && extOcc === 0 && (
                          <span className="text-[10px] text-muted-foreground/60 italic">drop here</span>
                        )}
                      </div>
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
    const b   = parseFloat(basePrice) || 0
    const d   = parseFloat(discPct) || 0
    const s   = services.reduce((sum, x) => sum + (parseFloat(x.price) || 0), 0)
    const da  = b * (d / 100)
    const tot = b - da + s

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Base Price (USD)</Label>
            <Input type="number" min="0" step="100" value={basePrice} onChange={e => setBase(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {tripType === 'OPEN_TRIP'
                ? `Cabin prices summed from assigned cabins`
                : selectedYacht
                ? `$${selectedYacht.dailyRate.toLocaleString()}/day × days`
                : ''}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Discount (%)</Label>
            <Input type="number" min="0" max="100" step="1" value={discPct} onChange={e => setDisc(e.target.value)} />
          </div>
        </div>

        {/* services */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Additional Services</Label>
            <Button type="button" variant="outline" size="sm" onClick={addSvc}>
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
          {services.map(s => (
            <div key={s.tempId} className="flex gap-2 items-center">
              <Input placeholder="Service name" value={s.name} onChange={e => updateSvc(s.tempId, { name: e.target.value })} />
              <Input type="number" min="0" step="50" placeholder="USD" className="w-32"
                value={s.price} onChange={e => updateSvc(s.tempId, { price: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeSvc(s.tempId)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <Separator />

        {/* price breakdown */}
        <div className="rounded-lg p-4 space-y-2 text-sm" style={{ backgroundColor: `${ACCENT}0d` }}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base Price</span>
            <span>${b.toLocaleString()}</span>
          </div>
          {d > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount ({d}%)</span>
              <span>−${da.toLocaleString()}</span>
            </div>
          )}
          {s > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Services</span>
              <span>${s.toLocaleString()}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span style={{ color: ACCENT }}>${tot.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Deposit Paid (USD)</Label>
          <Input type="number" min="0" step="100" placeholder="0" value={deposit} onChange={e => setDeposit(e.target.value)} />
        </div>

        <Separator />

        {/* summary */}
        <div className="rounded-lg border p-3 text-xs space-y-1.5">
          <p className="font-semibold text-sm mb-2">Booking Summary</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <span>Source</span>       <span className="text-foreground">{source === 'AGENT' ? 'Via Agent' : 'Direct'}</span>
            <span>Type</span>         <span className="text-foreground">{tripType === 'PRIVATE_CHARTER' ? 'Private Charter' : 'Open Trip'}</span>
            {tripType === 'OPEN_TRIP' && selectedOT && (
              <><span>Trip</span><span className="text-foreground">{selectedOT.title}</span></>
            )}
            {tripType === 'PRIVATE_CHARTER' && selectedYacht && (
              <><span>Yacht</span><span className="text-foreground">{selectedYacht.name}</span></>
            )}
            {tripType === 'PRIVATE_CHARTER' && startDate && endDate && (
              <><span>Dates</span><span className="text-foreground">{startDate} → {endDate}</span></>
            )}
            <span>Guests</span>       <span className="text-foreground">{guests.length} person(s)</span>
            {destination && (
              <><span>Destination</span><span className="text-foreground">{destination}</span></>
            )}
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
      <DialogContent className="w-240 max-w-[100vw] flex flex-col max-h-[92vh] overflow-hidden gap-0">
        <DialogHeader className="shrink-0 pb-3 border-b">
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
          <div className="p-4">
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
          <div className="flex items-center justify-between pt-3 pb-1 px-4 border-t shrink-0">
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
                disabled={submitting}
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
