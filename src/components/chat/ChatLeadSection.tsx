'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { BriefcaseBusiness, Loader2, UserPlus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { WON_CURRENCY_OPTIONS } from '@/components/leads/WonPaymentDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { LEAD_FORM_EMPTY, ProfileFields, QualificationFields, TRIP_TYPE_OPTIONS, toLeadFormState, type LeadFormState } from '@/components/leads/LeadEditSheet'
import {
  DEAL_PAYMENT_STATUS_LABEL, LEAD_LOST_REASONS, LEAD_LOST_REASON_LABEL, LEAD_STAGES, LEAD_STAGE_COLOR, LEAD_STAGE_LABEL, WON_PAYMENT_STATUSES,
  type DealPaymentStatus, type LeadLostReason, type LeadStage,
} from '@/lib/lead-pipeline'
import { chatRole, roleMatches } from '@/lib/role-utils'

// Lead panel open/closed beside a chat thread — remembered per browser, shared by the
// WhatsApp and Instagram/Messenger threads (new key so it starts open for everyone).
export const CHAT_LEAD_PANEL_KEY = 'chat-lead-panel-open'

/**
 * The chat's Lead, editable in place beside a WA / Instagram / Messenger thread — pipeline
 * stage up top, the full Lead form below, saved with one button. No sheet to open: the rep
 * keeps the conversation and the lead side by side while they talk.
 *
 * A chat with no Lead yet gets one via POST /api/{whatsapp|instagram}/conversations/[id]/lead.
 * A lead with no open deal (an Instagram / Messenger DM, or a WhatsApp lead whose last deal is
 * closed — src/lib/deal-chat.ts) gets "Create deal": the deal is built from the lead's fields below and
 * its name is formatted from them (src/lib/deal-name.ts), never typed.
 * Auto stage moves (src/lib/lead-stage-auto.ts) are picked up on the 'chat-changed' event
 * without overwriting unsaved edits in the form.
 */
export default function ChatLeadSection({ channel, conversationId, leadId, assignedToId, onChanged }: {
  channel: 'whatsapp' | 'instagram'
  conversationId: string
  leadId: string | null | undefined
  assignedToId: string | null | undefined
  // The thread re-reads itself (chat name follows the Lead, stage badge, list preview…).
  onChanged: () => void
}) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  // SALES may only edit Leads they own, which follow the chat holder — so only their own chats.
  const canEdit = !!session?.user && (role !== 'SALES' || assignedToId === session.user.id)
  const isAdmin = roleMatches(chatRole(role), ['ADMIN'])
  const confirm = useConfirm()

  const [stage, setStage] = useState<LeadStage | null>(null)
  // Formatted deal name ("PC/Samara I/Private Charter 3D2N Komodo/Guest") + whether an open deal exists.
  const [dealName, setDealName] = useState<string | null>(null)
  const [hasDeals, setHasDeals] = useState(false)
  const [hasOpenDeal, setHasOpenDeal] = useState(true)
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [form, setForm] = useState<LeadFormState>(LEAD_FORM_EMPTY)
  const [saved, setSaved] = useState<LeadFormState>(LEAD_FORM_EMPTY)
  const [loading, setLoading] = useState(false)
  // The lead exists but this user can't open it (SALES, someone else's lead).
  const [noAccess, setNoAccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [stageBusy, setStageBusy] = useState(false)
  // Lost needs a reason before the move goes through.
  const [lostPending, setLostPending] = useState(false)
  const [lostReason, setLostReason] = useState<LeadLostReason | ''>('')
  const [lostNote, setLostNote] = useState('')
  // Won needs the payment status first (parity C3 — Won = deposit received).
  const [wonPending, setWonPending] = useState(false)
  const [wonPayment, setWonPayment] = useState<DealPaymentStatus | ''>('')
  const [wonAmount, setWonAmount] = useState('')
  const [wonCurrency, setWonCurrency] = useState('USD')

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const closedStage = stage === 'CLOSED_WON' || stage === 'CLOSED_LOST'
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const load = useCallback(async (initial: boolean, force = false) => {
    if (!leadId) return
    if (initial) setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`)
      if (!res.ok) { if (initial) setNoAccess(res.status === 404 || res.status === 403); return }
      setNoAccess(false)
      const data = await res.json()
      setStage(data.stage ?? null)
      setDealName(data.dealName ?? null)
      setHasDeals(Array.isArray(data.deals) && data.deals.length > 0)
      setHasOpenDeal(!!data.hasOpenDeal)
      const next = toLeadFormState(data)
      setSaved(next)
      // Never wipe what the rep is typing — a background refresh only fills a clean form.
      if (initial || force || !dirtyRef.current) setForm(next)
    } catch { /* offline — keep what's shown */ } finally {
      if (initial) setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    setLostPending(false)
    setWonPending(false)
    if (!leadId) { setStage(null); setForm(LEAD_FORM_EMPTY); setSaved(LEAD_FORM_EMPTY); return }
    load(true)
  }, [leadId, load])

  // Stage moves on its own as messages go back and forth — keep it current.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => load(false), 800) }
    window.addEventListener('chat-changed', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('chat-changed', refresh) }
  }, [load])

  async function createLead() {
    setCreating(true)
    try {
      const res = await fetch(`/api/${channel}/conversations/${conversationId}/lead`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.leadId) { toast.error(body?.error ?? 'Could not create a lead for this chat'); return }
      toast.success('Lead created')
      onChanged()
    } finally {
      setCreating(false)
    }
  }

  async function save(quiet = false): Promise<boolean> {
    if (!leadId || !form.firstName.trim()) return false
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast.error(b?.error ?? 'Failed to save lead'); return false }
      setSaved(form)
      if (!quiet) toast.success('Lead saved')
      onChanged()
      load(false, true)
      return true
    } finally {
      setSaving(false)
    }
  }

  // The deal is built from the form, which after a closed deal still holds that trip's details —
  // so the rep confirms what the new deal will get before it is made.
  async function confirmCreateDeal() {
    if (!leadId) return
    const destinations: { id: string; name: string }[] = form.destinationId
      ? await fetch('/api/destinations').then(r => (r.ok ? r.json() : [])).catch(() => [])
      : []
    const fmt = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
    const dates = [fmt(form.travelStartDate), fmt(form.travelEndDate)].filter(Boolean).join(' – ')
    const rows: [string, string][] = [
      ['Trip type', TRIP_TYPE_OPTIONS.find(t => t.value === form.tripType)?.label ?? ''],
      ['Yacht', form.productInterest],
      ['Destination', destinations.find(d => d.id === form.destinationId)?.name ?? ''],
      ['Travel dates', dates],
      ['Guests', form.guestCount],
      ...(form.tripAmount ? [['Trip amount', `${form.tripAmountCurrency || 'USD'} ${form.tripAmount}`] as [string, string]] : []),
    ]
    const ok = await confirm({
      title: hasDeals ? 'Create another deal?' : 'Create deal?',
      description: (
        <span className="block space-y-3">
          <span className="block">Check that these are the details of <b>this</b> enquiry. The new deal and its name are made from them.</span>
          <span className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/40 p-3 text-xs">
            {rows.map(([k, v]) => (
              <span key={k} className="contents">
                <span className="text-muted-foreground">{k}</span>
                <span className={v ? 'font-medium text-foreground' : 'text-destructive'}>{v || 'Not set'}</span>
              </span>
            ))}
          </span>
          {hasDeals && (
            <span className="block rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
              These details may still be from the previous deal. If this is a different trip, choose <b>Check again</b> and update them first.
            </span>
          )}
        </span>
      ),
      confirmLabel: hasDeals ? 'Yes, create another deal' : 'Yes, create deal',
      cancelLabel: 'Check again',
    })
    if (ok) await createDeal()
  }

  // Unsaved edits go in first, so the deal is made from what the rep sees.
  async function createDeal() {
    if (!leadId) return
    if (dirty && !(await save(true))) return
    setCreatingDeal(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/deal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, conversationId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body?.error ?? 'Could not create a deal'); return }
      toast.success(body.created ? 'Deal created' : 'This lead already has an open deal')
      await load(false, true)
      onChanged()
    } finally {
      setCreatingDeal(false)
    }
  }

  async function moveStage(target: LeadStage, extra?: { lostReason: LeadLostReason; lostNote: string } | { paymentStatus: DealPaymentStatus; amount: number; currency: string }) {
    if (!leadId) return
    setStageBusy(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: target, ...extra }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body?.error ?? 'Failed to move stage'); return }
      setStage(target)
      setLostPending(false)
      setWonPending(false)
      toast.success(`Moved to ${LEAD_STAGE_LABEL[target]}`)
      onChanged()
    } finally {
      setStageBusy(false)
    }
  }

  function onPickStage(v: string) {
    const target = v as LeadStage
    if (target === stage) return
    if (target === 'CLOSED_LOST') { setWonPending(false); setLostReason(''); setLostNote(''); setLostPending(true); return }
    if (target === 'CLOSED_WON') {
      setLostPending(false); setWonPayment('')
      setWonAmount(Number(form.tripAmount) > 0 ? form.tripAmount : '')
      setWonCurrency((WON_CURRENCY_OPTIONS as readonly string[]).includes(form.tripAmountCurrency) ? form.tripAmountCurrency : 'USD')
      setWonPending(true)
      return
    }
    setLostPending(false)
    setWonPending(false)
    moveStage(target)
  }

  if (!leadId) {
    return (
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><UserRound className="h-3 w-3" /> Lead</h3>
        <p className="text-xs text-muted-foreground">This chat isn&apos;t linked to a Lead yet.</p>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={createLead} loading={creating}>
            {!creating && <UserPlus className="h-3.5 w-3.5" />} Create lead
          </Button>
        )}
      </section>
    )
  }

  if (noAccess) {
    return <p className="text-xs text-muted-foreground">This chat&apos;s lead belongs to another sales rep.</p>
  }

  if (loading) {
    return <div className="flex flex-col items-center gap-2 pt-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading lead…</div>
  }

  return (
    <section className="space-y-4">
      {hasOpenDeal && dealName && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-primary break-words">
          <BriefcaseBusiness className="mt-0.5 h-3.5 w-3.5 shrink-0" />{dealName}
        </p>
      )}
      {!hasOpenDeal && (
        <div className="rounded-md border border-dashed p-2.5 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {hasDeals ? 'No open deal — the earlier one is closed.' : channel === 'whatsapp' ? 'No deal yet.' : 'No deal yet — this chat doesn\u2019t open one by itself.'}{' '}
            Fill in trip type, yacht, dates and pax below, then create the deal. Its name is made from them.
          </p>
          {canEdit && (
            <Button size="sm" variant="brand" className="h-8 w-full text-xs" onClick={confirmCreateDeal} loading={creatingDeal} disabled={saving || !form.firstName.trim()}>
              {!creatingDeal && <BriefcaseBusiness className="h-3.5 w-3.5" />} {hasDeals ? 'Create another deal' : 'Create deal'}
            </Button>
          )}
        </div>
      )}
      {hasDeals && (
      <div className="space-y-1.5">
        <Label htmlFor={`stage-${conversationId}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Stage</Label>
        <Select value={lostPending ? 'CLOSED_LOST' : wonPending ? 'CLOSED_WON' : stage ?? undefined} onValueChange={onPickStage} disabled={!canEdit || stageBusy || (closedStage && !isAdmin)}>
          <SelectTrigger id={`stage-${conversationId}`} className="h-9 w-full text-xs">
            {stageBusy ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Moving…</span> : <SelectValue placeholder="Select stage" />}
          </SelectTrigger>
          <SelectContent>
            {LEAD_STAGES.map(s => (
              <SelectItem key={s} value={s} className="text-xs">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${LEAD_STAGE_COLOR[s]}`}>{LEAD_STAGE_LABEL[s]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {wonPending && (
          <div className="rounded-md border border-success/30 bg-success/5 p-2.5 space-y-2">
            <Select value={wonPayment || undefined} onValueChange={v => setWonPayment(v as DealPaymentStatus)}>
              <SelectTrigger aria-label="Payment status" className="h-8 w-full text-xs"><SelectValue placeholder="Payment status (Won = deposit received)" /></SelectTrigger>
              <SelectContent>
                {WON_PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{DEAL_PAYMENT_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} inputMode="decimal" aria-label="Deal amount" placeholder="Deal amount *" className="h-8 min-w-0 text-xs"
                value={wonAmount} onChange={e => setWonAmount(e.target.value)} />
              <Select value={wonCurrency} onValueChange={setWonCurrency}>
                <SelectTrigger aria-label="Currency" className="h-8 w-20 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WON_CURRENCY_OPTIONS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setWonPending(false)} disabled={stageBusy}>Cancel</Button>
              <Button size="sm" className="h-7 flex-1 text-xs" disabled={!wonPayment || !(Number(wonAmount) > 0)} loading={stageBusy}
                onClick={() => wonPayment && Number(wonAmount) > 0 && moveStage('CLOSED_WON', { paymentStatus: wonPayment, amount: Number(wonAmount), currency: wonCurrency })}>Mark Won</Button>
            </div>
          </div>
        )}
        {closedStage && !lostPending && (
          <p className="text-[11px] text-muted-foreground">{LEAD_STAGE_LABEL[stage!]} deals are read-only{isAdmin ? ' — as admin you can still reopen it.' : '. A new enquiry opens a new deal.'}</p>
        )}
        {lostPending && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 space-y-2">
            <Select value={lostReason || undefined} onValueChange={v => setLostReason(v as LeadLostReason)}>
              <SelectTrigger aria-label="Lost reason" className="h-8 w-full text-xs"><SelectValue placeholder="Why was it lost?" /></SelectTrigger>
              <SelectContent>
                {LEAD_LOST_REASONS.map(r => <SelectItem key={r} value={r} className="text-xs">{LEAD_LOST_REASON_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea value={lostNote} onChange={e => setLostNote(e.target.value)} rows={2} placeholder="Note (optional)" className="text-xs md:text-xs px-2 py-1.5" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setLostPending(false)} disabled={stageBusy}>Cancel</Button>
              <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" disabled={!lostReason} loading={stageBusy}
                onClick={() => lostReason && moveStage('CLOSED_LOST', { lostReason, lostNote })}>Mark Lost</Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* fieldset: a SALES rep looking at someone else's chat sees the lead read-only. */}
      <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
        <ProfileFields form={form} setForm={setForm} narrow />
        <QualificationFields form={form} setForm={setForm} narrow stage={lostPending ? 'CLOSED_LOST' : stage} />
      </fieldset>

      {canEdit && dirty && (
        <div className="sticky bottom-0 -mx-4 px-4 py-2.5 border-t bg-card flex gap-2">
          <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => setForm(saved)} disabled={saving}>Discard</Button>
          <Button size="sm" variant="brand" className="h-8 flex-1 text-xs" onClick={() => save()} loading={saving} disabled={!form.firstName.trim()}>Save lead</Button>
        </div>
      )}
    </section>
  )
}
