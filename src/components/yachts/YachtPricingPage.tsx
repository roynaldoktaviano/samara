'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Anchor, ShieldCheck, Plus, ChevronDown, ChevronRight } from 'lucide-react'

const ACCENT = '#bdac7e'

// Mock "today" used to compute current / upcoming / past — this whole page is a mockup with
// hardcoded example data, not wired to the real yacht/destination/cabin pricing yet.
const TODAY = '2026-09-10'

type Status = 'current' | 'upcoming' | 'past'

interface YachtLike { id: string; name: string; dailyRate: number }

interface BaseEntry { id: string; validFrom: string; daily: number }
interface DestEntry { id: string; validFrom: string; price: number; relocation: number }
interface TierEntry { id: string; validFrom: string; price: number }

interface DestUI {
  id: string; name: string; expanded: boolean; addOpen: boolean
  form: { validFrom: string; price: string; relocation: string }
  entries: DestEntry[]
}

interface TierUI {
  id: string; nights: number; dest: string; expanded: boolean; addOpen: boolean
  form: { validFrom: string; price: string }
  entries: TierEntry[]
}

interface CabinUI { id: string; name: string; expanded: boolean; tiers: TierUI[] }

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${d}, ${y}`
}

function fmtMoney(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// Sorted oldest → newest with a status per entry. The entry with the latest validFrom that has
// already started is "current"; everything before it is "past", everything after is "upcoming".
function withStatus<T extends { validFrom: string }>(entries: T[]): (T & { status: Status })[] {
  const sorted = [...entries].sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  let curIdx = -1
  sorted.forEach((e, i) => { if (e.validFrom <= TODAY) curIdx = i })
  return sorted.map((e, i) => ({
    ...e,
    status: i === curIdx ? 'current' : i < curIdx ? 'past' : 'upcoming',
  }))
}

// Picks the active price, falling back to the soonest upcoming one if nothing has started yet.
function pickCurrent<T extends { status: Status }>(ascending: T[]): T {
  return ascending.find(e => e.status === 'current')
    ?? ascending.find(e => e.status === 'upcoming')
    ?? ascending[ascending.length - 1]
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'current') {
    return <Badge style={{ backgroundColor: ACCENT, color: 'white', borderColor: ACCENT }}>Current</Badge>
  }
  if (status === 'upcoming') {
    return <Badge variant="outline" style={{ borderColor: ACCENT, color: ACCENT }}>Upcoming</Badge>
  }
  return <Badge variant="secondary" className="text-muted-foreground">Past</Badge>
}

function HistoryRow({ status, primary, secondary, date }: { status: Status; primary: string; secondary?: string; date: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 flex-wrap">
      <StatusBadge status={status} />
      <div className="text-sm font-semibold">
        {primary}
        {secondary && <span className="font-normal text-muted-foreground"> · {secondary}</span>}
      </div>
      <div className="ml-auto text-xs text-muted-foreground">Valid from {date}</div>
    </div>
  )
}

function AddPriceForm({ fields, onCancel, onSave }: {
  fields: { label: string; value: string; onChange: (v: string) => void; type: 'date' | 'number' }[]
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex items-end gap-3 flex-wrap rounded-lg bg-muted/40 p-3.5 mt-2">
      {fields.map(f => (
        <div key={f.label} className="space-y-1.5">
          <Label className="text-xs">{f.label}</Label>
          {f.type === 'number' ? (
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                placeholder="0"
                className="w-28 pl-6"
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
              />
            </div>
          ) : (
            <Input
              type={f.type}
              className="w-36"
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 ml-auto">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90" onClick={onSave}>Save</Button>
      </div>
    </div>
  )
}

function mkTier(id: string, nights: number, dest: string, entries: Omit<TierEntry, 'id'>[]): TierUI {
  return {
    id, nights, dest, expanded: false, addOpen: false,
    form: { validFrom: '', price: '' },
    entries: entries.map((e, i) => ({ id: `${id}-${i}`, ...e })),
  }
}

export default function YachtPricingPage({ yacht, onBack }: { yacht: YachtLike; onBack: () => void }) {
  const [baseEntries, setBaseEntries] = useState<BaseEntry[]>([
    { id: 'br1', validFrom: '2024-01-01', daily: yacht.dailyRate || 3500 },
    { id: 'br2', validFrom: '2027-09-01', daily: (yacht.dailyRate || 3500) + 700 },
  ])
  const [baseAddOpen, setBaseAddOpen] = useState(false)
  const [baseForm, setBaseForm] = useState({ validFrom: '', daily: '' })

  const [destinations, setDestinations] = useState<DestUI[]>([
    {
      id: 'raja', name: 'Raja Ampat', expanded: true, addOpen: false,
      form: { validFrom: '', price: '', relocation: '' },
      entries: [
        { id: 'ra1', validFrom: '2024-01-01', price: 2500, relocation: 350 },
        { id: 'ra2', validFrom: '2027-09-01', price: 2800, relocation: 400 },
      ],
    },
    {
      id: 'komodo', name: 'Komodo', expanded: false, addOpen: false,
      form: { validFrom: '', price: '', relocation: '' },
      entries: [{ id: 'ko1', validFrom: '2023-06-01', price: 2100, relocation: 250 }],
    },
    {
      id: 'wakatobi', name: 'Wakatobi', expanded: false, addOpen: false,
      form: { validFrom: '', price: '', relocation: '' },
      entries: [
        { id: 'wk1', validFrom: '2023-06-01', price: 1950, relocation: 200 },
        { id: 'wk2', validFrom: '2025-01-01', price: 2200, relocation: 225 },
      ],
    },
  ])

  const [cabins, setCabins] = useState<CabinUI[]>([
    {
      id: 'master', name: 'Master Cabin', expanded: true, tiers: [
        mkTier('m3', 3, 'All destinations', [{ validFrom: '2024-01-01', price: 1200 }, { validFrom: '2027-09-01', price: 1450 }]),
        mkTier('m5', 5, 'All destinations', [{ validFrom: '2024-01-01', price: 1800 }]),
        mkTier('m7', 7, 'All destinations', [{ validFrom: '2024-01-01', price: 2400 }]),
        mkTier('m5ra', 5, 'Raja Ampat only', [{ validFrom: '2024-06-01', price: 2000 }, { validFrom: '2027-09-01', price: 2300 }]),
      ],
    },
    {
      id: 'vip', name: 'VIP Cabin', expanded: false, tiers: [
        mkTier('v3', 3, 'All destinations', [{ validFrom: '2024-01-01', price: 1600 }]),
        mkTier('v5', 5, 'All destinations', [{ validFrom: '2024-01-01', price: 2400 }]),
        mkTier('v7', 7, 'All destinations', [{ validFrom: '2024-01-01', price: 3100 }]),
      ],
    },
    {
      id: 'deluxe', name: 'Deluxe Cabin', expanded: false, tiers: [
        mkTier('d3', 3, 'All destinations', [{ validFrom: '2024-01-01', price: 900 }]),
        mkTier('d5', 5, 'All destinations', [{ validFrom: '2024-01-01', price: 1350 }]),
        mkTier('d7', 7, 'All destinations', [{ validFrom: '2024-01-01', price: 1800 }]),
      ],
    },
  ])

  function saveBase() {
    if (!baseForm.validFrom || !baseForm.daily) return
    setBaseEntries(prev => [...prev, { id: `br-${Date.now()}`, validFrom: baseForm.validFrom, daily: Number(baseForm.daily) }])
    setBaseAddOpen(false)
    setBaseForm({ validFrom: '', daily: '' })
  }

  function toggleDest(id: string) {
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, expanded: !d.expanded } : d))
  }
  function toggleDestAdd(id: string) {
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, addOpen: !d.addOpen } : d))
  }
  function setDestForm(id: string, field: 'validFrom' | 'price' | 'relocation', value: string) {
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, form: { ...d.form, [field]: value } } : d))
  }
  function saveDest(id: string) {
    setDestinations(prev => prev.map(d => {
      if (d.id !== id || !d.form.validFrom || !d.form.price) return d
      const entry: DestEntry = { id: `${id}-${Date.now()}`, validFrom: d.form.validFrom, price: Number(d.form.price), relocation: Number(d.form.relocation || 0) }
      return { ...d, entries: [...d.entries, entry], addOpen: false, form: { validFrom: '', price: '', relocation: '' } }
    }))
  }

  function toggleCabin(id: string) {
    setCabins(prev => prev.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c))
  }
  function toggleTier(cabinId: string, tierId: string) {
    setCabins(prev => prev.map(c => c.id !== cabinId ? c : { ...c, tiers: c.tiers.map(t => t.id === tierId ? { ...t, expanded: !t.expanded } : t) }))
  }
  function toggleTierAdd(cabinId: string, tierId: string) {
    setCabins(prev => prev.map(c => c.id !== cabinId ? c : { ...c, tiers: c.tiers.map(t => t.id === tierId ? { ...t, addOpen: !t.addOpen } : t) }))
  }
  function setTierForm(cabinId: string, tierId: string, field: 'validFrom' | 'price', value: string) {
    setCabins(prev => prev.map(c => c.id !== cabinId ? c : { ...c, tiers: c.tiers.map(t => t.id === tierId ? { ...t, form: { ...t.form, [field]: value } } : t) }))
  }
  function saveTier(cabinId: string, tierId: string) {
    setCabins(prev => prev.map(c => c.id !== cabinId ? c : {
      ...c,
      tiers: c.tiers.map(t => {
        if (t.id !== tierId || !t.form.validFrom || !t.form.price) return t
        const entry: TierEntry = { id: `${tierId}-${Date.now()}`, validFrom: t.form.validFrom, price: Number(t.form.price) }
        return { ...t, entries: [...t.entries, entry], addOpen: false, form: { validFrom: '', price: '' } }
      }),
    }))
  }

  const baseAscending = withStatus(baseEntries)
  const baseCurrent = pickCurrent(baseAscending)
  const baseHistory = [...baseAscending].reverse()

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Fleet
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}22` }}>
            <Anchor className="h-5 w-5" style={{ color: ACCENT }} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing Management</div>
            <h3 className="text-2xl font-bold tracking-tight">{yacht.name}</h3>
          </div>
          <Badge variant="outline" className="ml-auto gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin only
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Base rate, destination pricing and cabin tiers for this yacht. Bookings already made keep the price they were created with — this only affects new bookings.
        </p>
      </div>

      {/* ── Base Rate ── */}
      <Card>
        <CardHeader>
          <CardTitle>Base Rate</CardTitle>
          <CardDescription>Default daily charter rate for this yacht</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-8 flex-wrap pb-4 border-b">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Daily Rate</div>
              <div className="text-2xl font-bold">{fmtMoney(baseCurrent.daily)}<span className="text-sm font-medium text-muted-foreground ml-1">/night</span></div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <StatusBadge status={baseCurrent.status} />
              <span className="text-xs text-muted-foreground">since {fmtDate(baseCurrent.validFrom)}</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Price Schedule</div>
            <div className="divide-y">
              {baseHistory.map(e => (
                <HistoryRow key={e.id} status={e.status} primary={`${fmtMoney(e.daily)}/night`} date={fmtDate(e.validFrom)} />
              ))}
            </div>
          </div>

          {!baseAddOpen ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setBaseAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add new price
            </Button>
          ) : (
            <AddPriceForm
              onCancel={() => { setBaseAddOpen(false); setBaseForm({ validFrom: '', daily: '' }) }}
              onSave={saveBase}
              fields={[
                { label: 'Valid from', type: 'date', value: baseForm.validFrom, onChange: v => setBaseForm(f => ({ ...f, validFrom: v })) },
                { label: 'Daily rate', type: 'number', value: baseForm.daily, onChange: v => setBaseForm(f => ({ ...f, daily: v })) },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Destination Pricing ── */}
      <Card>
        <CardHeader>
          <CardTitle>Destination Pricing</CardTitle>
          <CardDescription>Per-destination day rate and relocation fee</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {destinations.map(d => {
            const ascending = withStatus(d.entries)
            const current = pickCurrent(ascending)
            const history = [...ascending].reverse()
            return (
              <div key={d.id} className="py-1">
                <button onClick={() => toggleDest(d.id)} className="w-full flex items-center gap-2.5 py-2.5 text-left">
                  {d.expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-sm font-semibold">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{current.relocation ? `${fmtMoney(current.relocation)} relocation fee` : 'No relocation fee'}</span>
                  <span className="ml-auto text-sm font-semibold">{fmtMoney(current.price)}/day</span>
                </button>
                {d.expanded && (
                  <div className="pl-6 pb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Price Schedule</div>
                    <div className="divide-y">
                      {history.map(e => (
                        <HistoryRow key={e.id} status={e.status} primary={`${fmtMoney(e.price)}/day`} secondary={e.relocation ? `${fmtMoney(e.relocation)} relocation` : 'no relocation fee'} date={fmtDate(e.validFrom)} />
                      ))}
                    </div>
                    {!d.addOpen ? (
                      <Button variant="ghost" size="sm" className="text-muted-foreground mt-1" onClick={() => toggleDestAdd(d.id)}>
                        <Plus className="h-3.5 w-3.5" /> Add new price
                      </Button>
                    ) : (
                      <AddPriceForm
                        onCancel={() => toggleDestAdd(d.id)}
                        onSave={() => saveDest(d.id)}
                        fields={[
                          { label: 'Valid from', type: 'date', value: d.form.validFrom, onChange: v => setDestForm(d.id, 'validFrom', v) },
                          { label: 'Price / day', type: 'number', value: d.form.price, onChange: v => setDestForm(d.id, 'price', v) },
                          { label: 'Relocation fee', type: 'number', value: d.form.relocation, onChange: v => setDestForm(d.id, 'relocation', v) },
                        ]}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ── Cabin Pricing Tiers ── */}
      <Card>
        <CardHeader>
          <CardTitle>Cabin Pricing Tiers</CardTitle>
          <CardDescription>Per-cabin price by nights, with optional destination overrides</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {cabins.map(c => (
            <div key={c.id} className="py-1">
              <button onClick={() => toggleCabin(c.id)} className="w-full flex items-center gap-2.5 py-2.5 text-left">
                {c.expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.tiers.length} pricing tiers</span>
              </button>
              {c.expanded && (
                <div className="pl-6 pb-3 divide-y">
                  {c.tiers.map(t => {
                    const ascending = withStatus(t.entries)
                    const current = pickCurrent(ascending)
                    const history = [...ascending].reverse()
                    return (
                      <div key={t.id} className="py-1">
                        <button onClick={() => toggleTier(c.id, t.id)} className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-muted/40 rounded-md px-1.5 -mx-1.5 transition-colors">
                          {t.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <div>
                            <div className="text-sm font-semibold">{t.nights} Nights</div>
                            <div className="text-[11px] text-muted-foreground">{t.dest}</div>
                          </div>
                          <span className="ml-auto text-sm font-semibold">{fmtMoney(current.price)}</span>
                        </button>
                        {t.expanded && (
                          <div className="pl-6 pb-3 pt-1">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Price Schedule</div>
                            <div className="divide-y">
                              {history.map(e => (
                                <HistoryRow key={e.id} status={e.status} primary={fmtMoney(e.price)} date={fmtDate(e.validFrom)} />
                              ))}
                            </div>
                            {!t.addOpen ? (
                              <Button variant="ghost" size="sm" className="text-muted-foreground mt-1" onClick={() => toggleTierAdd(c.id, t.id)}>
                                <Plus className="h-3.5 w-3.5" /> Add new price
                              </Button>
                            ) : (
                              <AddPriceForm
                                onCancel={() => toggleTierAdd(c.id, t.id)}
                                onSave={() => saveTier(c.id, t.id)}
                                fields={[
                                  { label: 'Valid from', type: 'date', value: t.form.validFrom, onChange: v => setTierForm(c.id, t.id, 'validFrom', v) },
                                  { label: 'Price', type: 'number', value: t.form.price, onChange: v => setTierForm(c.id, t.id, 'price', v) },
                                ]}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
