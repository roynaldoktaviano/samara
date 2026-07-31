'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Banknote, Loader2, Plus, Pencil, X } from 'lucide-react'

const ACCENT = '#bdac7e'

interface AgentSummary {
  id: string
  name: string
  clawbackRatePerNight: number
  clawbackBalance: number
}

interface ClawbackEntry {
  id: string
  amount: number
  note: string | null
  createdByName: string | null
  createdAt: string
  booking: { bookingCode: string; startDate: string; endDate: string } | null
}

interface ClawbackRateOverride {
  id: string
  yachtId: string | null
  yacht: { id: string; name: string } | null
  tripType: 'OPEN_TRIP' | 'PRIVATE_CHARTER' | null
  ratePerNight: number
}

interface YachtOpt { id: string; name: string }

interface AgentDetail {
  id: string
  name: string
  clawbackRatePerNight: number
  clawbackBalance: number
  entries: ClawbackEntry[]
  rates: ClawbackRateOverride[]
}

const TRIP_TYPE_LABEL: Record<string, string> = { OPEN_TRIP: 'Open Trip', PRIVATE_CHARTER: 'Private Charter' }

const fmtMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * Finance-facing slice of the Agent module — rate + running debt only, nothing else about
 * an agent is editable or even visible here (contacts, contracts, calendar tokens etc. stay
 * on the full Agents screen, which Finance doesn't have access to). Mirrors the
 * POReimbursements-style "Finance gets a narrow view of a bigger feature" convention.
 */
export default function AgentClawbacks() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [rateInput, setRateInput] = useState('')
  const [rateSaving, setRateSaving] = useState(false)

  const [entryAmount, setEntryAmount] = useState('')
  const [entryNote, setEntryNote] = useState('')
  const [entrySaving, setEntrySaving] = useState(false)
  const [entryError, setEntryError] = useState('')

  const [yachts, setYachts] = useState<YachtOpt[]>([])
  const [newRateYachtId, setNewRateYachtId] = useState('__any__')
  const [newRateTripType, setNewRateTripType] = useState('__any__')
  const [newRateValue, setNewRateValue] = useState('')
  const [rateOverrideSaving, setRateOverrideSaving] = useState(false)
  const [rateOverrideError, setRateOverrideError] = useState('')
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/agent-clawback')
      if (res.ok) setAgents(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.ok ? r.json() : []).then((data: { id: string; name: string }[]) => {
      setYachts(Array.isArray(data) ? data.map(y => ({ id: y.id, name: y.name })) : [])
    }).catch(() => {})
  }, [])

  async function openAgent(agentId: string) {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    setEntryAmount(''); setEntryNote(''); setEntryError('')
    setNewRateYachtId('__any__'); setNewRateTripType('__any__'); setNewRateValue(''); setRateOverrideError('')
    try {
      const res = await fetch(`/api/finance/agent-clawback/${agentId}`)
      if (res.ok) {
        const data: AgentDetail = await res.json()
        setDetail(data)
        setRateInput(data.clawbackRatePerNight.toString())
      }
    } finally { setDetailLoading(false) }
  }

  async function saveRate() {
    if (!detail) return
    const rate = parseFloat(rateInput)
    if (!Number.isFinite(rate) || rate < 0) return
    setRateSaving(true)
    try {
      const res = await fetch(`/api/finance/agent-clawback/${detail.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clawbackRatePerNight: rate }),
      })
      if (res.ok) {
        setDetail(prev => prev ? { ...prev, clawbackRatePerNight: rate } : prev)
        await load()
      }
    } finally { setRateSaving(false) }
  }

  async function addEntry() {
    if (!detail) return
    const amount = parseFloat(entryAmount)
    if (!Number.isFinite(amount) || amount === 0) { setEntryError('Enter a non-zero amount'); return }
    if (!entryNote.trim()) { setEntryError('A note is required'); return }
    setEntrySaving(true); setEntryError('')
    try {
      const res = await fetch(`/api/finance/agent-clawback/${detail.id}/entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: entryNote.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setEntryError(data.error ?? 'Failed to save'); return }
      setEntryAmount(''); setEntryNote('')
      await openAgent(detail.id)
      await load()
    } finally { setEntrySaving(false) }
  }

  async function addRateOverride() {
    if (!detail) return
    const rate = parseFloat(newRateValue)
    if (!Number.isFinite(rate) || rate < 0) { setRateOverrideError('Enter a valid rate'); return }
    setRateOverrideSaving(true); setRateOverrideError('')
    try {
      const res = await fetch(`/api/finance/agent-clawback/${detail.id}/rates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: newRateYachtId === '__any__' ? null : newRateYachtId,
          tripType: newRateTripType === '__any__' ? null : newRateTripType,
          ratePerNight: rate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setRateOverrideError(data.error ?? 'Failed to save'); return }
      setNewRateYachtId('__any__'); setNewRateTripType('__any__'); setNewRateValue('')
      await openAgent(detail.id)
    } finally { setRateOverrideSaving(false) }
  }

  async function deleteRateOverride(rateId: string) {
    if (!detail) return
    setDeletingRateId(rateId)
    try {
      await fetch(`/api/finance/agent-clawback/${detail.id}/rates/${rateId}`, { method: 'DELETE' })
      await openAgent(detail.id)
    } finally { setDeletingRateId(null) }
  }

  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Banknote className="h-5 w-5" style={{ color: ACCENT }} /> Agent Clawback
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set each agent&apos;s per-night deduction rate and manage their outstanding debt. Automatically deducted whenever a booking comes in through that agent.
        </p>
      </div>

      <div className="w-72">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agent…" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Default Rate / Night</TableHead>
                <TableHead className="text-right">Outstanding Balance</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No agents found.</TableCell></TableRow>
              ) : filtered.map(a => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openAgent(a.id)}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{fmtMoney(a.clawbackRatePerNight)}</TableCell>
                  <TableCell className={`text-right font-semibold ${a.clawbackBalance > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {fmtMoney(a.clawbackBalance)}
                  </TableCell>
                  <TableCell><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.name ?? 'Loading…'}</DialogTitle>
            <DialogDescription>Clawback rate, outstanding balance, and deduction history.</DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Default Rate / Night (USD)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" step="10" value={rateInput} onChange={e => setRateInput(e.target.value)} />
                    <Button size="sm" disabled={rateSaving} onClick={saveRate} style={{ backgroundColor: ACCENT }} className="text-white shrink-0">
                      {rateSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Used when no override below matches the booking&apos;s yacht/trip type.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Outstanding Balance</Label>
                  <p className={`h-9 flex items-center text-lg font-bold ${detail.clawbackBalance > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {fmtMoney(detail.clawbackBalance)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate overrides by yacht / trip type</p>
                {detail.rates.length > 0 && (
                  <div className="space-y-1">
                    {detail.rates.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-sm rounded-md bg-muted/40 px-2.5 py-1.5">
                        <span className="truncate">
                          {r.yacht?.name ?? 'Any yacht'} · {r.tripType ? TRIP_TYPE_LABEL[r.tripType] : 'Any trip type'}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium">{fmtMoney(r.ratePerNight)}</span>
                          <button onClick={() => deleteRateOverride(r.id)} disabled={deletingRateId === r.id} className="text-muted-foreground hover:text-red-600 transition-colors">
                            {deletingRateId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_1fr_90px_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-normal">Yacht</Label>
                    <Select value={newRateYachtId} onValueChange={setNewRateYachtId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any yacht</SelectItem>
                        {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-normal">Trip Type</Label>
                    <Select value={newRateTripType} onValueChange={setNewRateTripType}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any trip type</SelectItem>
                        <SelectItem value="OPEN_TRIP">Open Trip</SelectItem>
                        <SelectItem value="PRIVATE_CHARTER">Private Charter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="h-8 text-xs" type="number" min="0" step="10" placeholder="$/night" value={newRateValue} onChange={e => setNewRateValue(e.target.value)} />
                  <Button size="sm" className="h-8 text-white" disabled={rateOverrideSaving} onClick={addRateOverride} style={{ backgroundColor: ACCENT }} title="Add override">
                    {rateOverrideSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {rateOverrideError && <p className="text-xs text-destructive">{rateOverrideError}</p>}
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add manual entry</p>
                <div className="grid grid-cols-[110px_1fr] gap-2">
                  <Input type="number" step="10" placeholder="+ debt / − paid" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} />
                  <Textarea rows={1} placeholder="Note (required) — why this entry exists" value={entryNote} onChange={e => setEntryNote(e.target.value)} className="min-h-9 py-2" />
                </div>
                {entryError && <p className="text-xs text-destructive">{entryError}</p>}
                <Button size="sm" variant="outline" disabled={entrySaving} onClick={addEntry}>
                  {entrySaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Add Entry
                </Button>
                <p className="text-[11px] text-muted-foreground">Positive amount = debt added. Negative = manual reduction/repayment.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</p>
                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {detail.entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No entries yet.</p>
                  ) : detail.entries.map(e => (
                    <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">
                          {e.booking ? `Booking ${e.booking.bookingCode}` : (e.note || 'Manual entry')}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {fmtDate(e.createdAt)}{e.createdByName ? ` · ${e.createdByName}` : ''}
                        </p>
                      </div>
                      <span className={`font-semibold shrink-0 ${e.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {e.amount > 0 ? '+' : ''}{fmtMoney(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
