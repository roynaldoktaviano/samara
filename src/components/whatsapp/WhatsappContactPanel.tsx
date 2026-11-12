'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, X, Ship, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WhatsappContactPanel as PanelData } from '@/app/api/whatsapp/conversations/[id]/contact/route'
import { WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { StatusBadge, BookingStatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'
import ChatLeadSection from '@/components/chat/ChatLeadSection'

function label(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

/**
 * Context column beside a WhatsApp thread — the linked Lead, editable in place with its pipeline
 * stage (src/components/chat/ChatLeadSection.tsx), past bookings (matched by phone to a
 * Customer) and the same number's chats on our other brands.
 * Data: GET /api/whatsapp/conversations/[id]/contact.
 */
export default function WhatsappContactPanel({ conversationId, leadId, assignedToId, onLeadChanged, onClose, onOpenBooking, onOpenChat }: {
  conversationId: string
  // Reloads when the chat gets (re)linked to a Lead, e.g. after categorising it as Sales.
  leadId: string | null
  assignedToId: string | null | undefined
  // Lead created/saved/moved here — the thread re-reads itself.
  onLeadChanged: () => void
  onClose: () => void
  onOpenBooking?: (bookingId: string) => void
  onOpenChat?: (conversationId: string) => void
}) {
  const [data, setData] = useState<PanelData | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/conversations/${conversationId}/contact`).catch(() => null)
    if (!res?.ok) return
    const body: PanelData = await res.json()
    setData(body)
  }, [conversationId])

  useEffect(() => { load() }, [load, leadId])

  const customer = data?.customer

  return (
    <aside className="fixed inset-0 z-40 md:static md:z-auto w-full md:w-80 shrink-0 md:border-l bg-card flex flex-col min-h-0">
      <div className="px-4 h-[57px] border-b flex items-center justify-between shrink-0">
        <p className="text-sm font-semibold">Lead &amp; contact</p>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-8 -mr-2 text-muted-foreground hover:text-foreground" title="Hide panel" aria-label="Hide panel"><X className="h-4 w-4" /></Button>
      </div>
      {!data ? (
        <div className="flex justify-center pt-10"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <ChatLeadSection channel="whatsapp" conversationId={conversationId} leadId={leadId} assignedToId={assignedToId} onChanged={onLeadChanged} />

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
