'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, UserPlus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LEAD_FORM_EMPTY, ProfileFields, QualificationFields, toLeadFormState, type LeadFormState } from '@/components/leads/LeadEditSheet'
import {
  LEAD_LOST_REASONS, LEAD_LOST_REASON_LABEL, LEAD_STAGES, LEAD_STAGE_COLOR, LEAD_STAGE_LABEL,
  type LeadLostReason, type LeadStage,
} from '@/lib/lead-pipeline'

// Lead panel open/closed beside a chat thread — remembered per browser, shared by the
// WhatsApp and Instagram/Messenger threads (new key so it starts open for everyone).
export const CHAT_LEAD_PANEL_KEY = 'chat-lead-panel-open'

/**
 * The chat's Lead, editable in place beside a WA / Instagram / Messenger thread — pipeline
 * stage up top, the full Lead form below, saved with one button. No sheet to open: the rep
 * keeps the conversation and the lead side by side while they talk.
 *
 * A chat with no Lead yet gets one via POST /api/{whatsapp|instagram}/conversations/[id]/lead.
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

  const [stage, setStage] = useState<LeadStage | null>(null)
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

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const load = useCallback(async (initial: boolean) => {
    if (!leadId) return
    if (initial) setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`)
      if (!res.ok) { if (initial) setNoAccess(res.status === 404 || res.status === 403); return }
      setNoAccess(false)
      const data = await res.json()
      setStage(data.stage ?? null)
      const next = toLeadFormState(data)
      setSaved(next)
      // Never wipe what the rep is typing — a background refresh only fills a clean form.
      if (initial || !dirtyRef.current) setForm(next)
    } catch { /* offline — keep what's shown */ } finally {
      if (initial) setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    setLostPending(false)
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

  async function save() {
    if (!leadId || !form.firstName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast.error(b?.error ?? 'Failed to save lead'); return }
      setSaved(form)
      toast.success('Lead saved')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function moveStage(target: LeadStage, extra?: { lostReason: LeadLostReason; lostNote: string }) {
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
      toast.success(`Moved to ${LEAD_STAGE_LABEL[target]}`)
      onChanged()
    } finally {
      setStageBusy(false)
    }
  }

  function onPickStage(v: string) {
    const target = v as LeadStage
    if (target === stage) return
    if (target === 'CLOSED_LOST') { setLostReason(''); setLostNote(''); setLostPending(true); return }
    setLostPending(false)
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
      <div className="space-y-1.5">
        <Label htmlFor={`stage-${conversationId}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Stage</Label>
        <Select value={lostPending ? 'CLOSED_LOST' : stage ?? undefined} onValueChange={onPickStage} disabled={!canEdit || stageBusy}>
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

      {/* fieldset: a SALES rep looking at someone else's chat sees the lead read-only. */}
      <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
        <ProfileFields form={form} setForm={setForm} narrow />
        <QualificationFields form={form} setForm={setForm} narrow stage={lostPending ? 'CLOSED_LOST' : stage} />
      </fieldset>

      {canEdit && dirty && (
        <div className="sticky bottom-0 -mx-4 px-4 py-2.5 border-t bg-card flex gap-2">
          <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => setForm(saved)} disabled={saving}>Discard</Button>
          <Button size="sm" variant="brand" className="h-8 flex-1 text-xs" onClick={save} loading={saving} disabled={!form.firstName.trim()}>Save lead</Button>
        </div>
      )}
    </section>
  )
}
