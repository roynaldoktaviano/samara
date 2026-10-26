'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X, UserRound, Ship, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { WhatsappContactPanel as PanelData } from '@/app/api/whatsapp/conversations/[id]/contact/route'
import { LEAD_STAGE_COLOR, LEAD_STAGE_LABEL, type LeadStage } from '@/lib/lead-pipeline'
import { WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { StatusBadge, BookingStatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatDateRange, formatMoney, formatNumber } from '@/lib/format'

const QUALITY_COLOR: Record<string, string> = {
  HOT: 'bg-destructive/15 text-destructive', WARM: 'bg-warning/15 text-warning', COLD: 'bg-info/15 text-info',
}
function label(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === '') return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 break-words">{v}</span>
    </div>
  )
}

/**
 * Context column beside a WhatsApp thread — the linked Lead, past bookings (matched by phone
 * to a Customer), the same number's chats on our other brands, and quick-edit Lead notes.
 * Data: GET/PATCH /api/whatsapp/conversations/[id]/contact.
 */
export default function WhatsappContactPanel({ conversationId, leadId, onClose, onOpenBooking, onOpenChat }: {
  conversationId: string
  // Reloads when the chat gets (re)linked to a Lead, e.g. after categorising it as Sales.
  leadId: string | null
  onClose: () => void
  onOpenBooking?: (bookingId: string) => void
  onOpenChat?: (conversationId: string) => void
}) {
  const [data, setData] = useState<PanelData | null>(null)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/conversations/${conversationId}/contact`).catch(() => null)
    if (!res?.ok) return
    const body: PanelData = await res.json()
    setData(body)
    setNotes(body.lead?.notes ?? '')
  }, [conversationId])

  useEffect(() => { load() }, [load, leadId])

  async function saveNotes() {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversationId}/contact`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body?.error ?? 'Failed to save notes'); return }
      setData(d => d?.lead ? { ...d, lead: { ...d.lead, notes: notes.trim() || null } } : d)
      toast.success('Notes saved')
    } finally {
      setSavingNotes(false)
    }
  }

  const lead = data?.lead
  const customer = data?.customer
  const notesDirty = !!lead && (notes.trim() || null) !== (lead.notes ?? null)
  const travelDates = lead && (lead.travelStartDate
    ? formatDateRange(lead.travelStartDate, lead.travelEndDate)
    : lead.travelSeason)
  const budget = lead && (lead.budgetMin || lead.budgetMax)
    ? [lead.budgetMin, lead.budgetMax].filter(v => v != null).map(v => lead.budgetCurrency ? formatMoney(v, { currency: lead.budgetCurrency, decimals: 0 }) : formatNumber(v)).join(' – ')
    : null

  return (
    <aside className="fixed inset-0 z-40 md:static md:z-auto w-full md:w-72 shrink-0 md:border-l bg-card flex flex-col min-h-0">
      <div className="px-4 h-[57px] border-b flex items-center justify-between shrink-0">
        <p className="text-sm font-semibold">Contact info</p>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-8 -mr-2 text-muted-foreground hover:text-foreground" title="Hide panel" aria-label="Hide panel"><X className="h-4 w-4" /></Button>
      </div>
      {!data ? (
        <div className="flex justify-center pt-10"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><UserRound className="h-3 w-3" /> Lead</h3>
            {lead ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium mr-1">{lead.name}</p>
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${LEAD_STAGE_COLOR[lead.stage as LeadStage]}`}>{LEAD_STAGE_LABEL[lead.stage as LeadStage]}</span>
                  {lead.leadQuality && <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${QUALITY_COLOR[lead.leadQuality] ?? ''}`}>{label(lead.leadQuality)}</span>}
                </div>
                <div className="space-y-1">
                  <Row k="Owner" v={lead.ownerName} />
                  <Row k="Email" v={lead.email} />
                  <Row k="Nationality" v={lead.nationality} />
                  <Row k="Interest" v={lead.productInterest} />
                  <Row k="Destination" v={lead.destination} />
                  <Row k="Travel" v={travelDates} />
                  <Row k="Guests" v={lead.guestCount} />
                  <Row k="Budget" v={budget} />
                  <Row k="Source" v={lead.source && label(lead.source)} />
                </div>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="wa-contact-notes" className="text-xs font-normal text-muted-foreground">Notes</Label>
                  <Textarea id="wa-contact-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                    placeholder="What did they tell you? Dates, group, preferences…"
                    className="resize-y px-2 py-1.5 text-xs md:text-xs" />
                  {notesDirty && (
                    <Button size="sm" className="h-7 w-full text-xs" onClick={saveNotes} loading={savingNotes}>
                      Save notes
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Not linked to a Lead yet. Set the chat category to <span className="font-medium">Sales</span> to create one.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Ship className="h-3 w-3" /> Bookings</h3>
            {customer ? (
              <>
                <p className="text-xs"><span className="font-medium">{customer.name}</span>{customer.nationality && <span className="text-muted-foreground"> · {customer.nationality}</span>}</p>
                {customer.bookings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Guest profile exists, no bookings yet.</p>
                ) : customer.bookings.map(b => (
                  <button key={b.id} onClick={() => onOpenBooking?.(b.id)} disabled={!onOpenBooking}
                    className="w-full text-left rounded-md border px-2.5 py-2 hover:bg-muted/50 disabled:hover:bg-transparent transition-colors space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{b.bookingCode}</span>
                      {/* pending_refund is not a booking status in the shared map — keep it red here. */}
                      {b.status === 'pending_refund'
                        ? <StatusBadge size="sm" tone="destructive">{label(b.status)}</StatusBadge>
                        : <BookingStatusBadge size="sm" status={b.status} />}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{formatDate(b.startDate)} · {[b.yacht, b.destination].filter(Boolean).join(' · ')}</p>
                    <p className="text-[11px] text-muted-foreground">{b.guestCount} pax · {formatMoney(b.totalPrice, { currency: b.currency, decimals: 0 })}</p>
                  </button>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No guest profile with this number — first-time contact.</p>
            )}
          </section>

          {data.otherChats.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><MessageCircle className="h-3 w-3" /> Also chatting on</h3>
              {data.otherChats.map(c => (
                <button key={c.id} onClick={() => onOpenChat?.(c.id)} disabled={!onOpenChat || !c.canOpen} title={c.canOpen ? undefined : 'Handled by another sales rep'}
                  className="w-full text-left rounded-md border px-2.5 py-1.5 hover:bg-muted/50 disabled:hover:bg-transparent disabled:opacity-60 transition-colors">
                  <p className="text-xs font-medium">{WHATSAPP_BRAND_LABELS[c.brand as WhatsappBrand] ?? c.brand}</p>
                  <p className="text-[11px] text-muted-foreground">Last message {formatDate(c.lastMessageAt)}{c.assignedToName && ` · ${c.assignedToName}`}</p>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  )
}
