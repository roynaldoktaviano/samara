'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import LeadEditSheet from '@/components/leads/LeadEditSheet'

/**
 * "Edit lead" from inside a WA / Instagram / Messenger thread: opens the regular Lead form
 * (name, phone, email, Instagram, country, trip details…). A chat with no Lead yet gets one
 * linked/created first via POST /api/{whatsapp|instagram}/conversations/[id]/lead.
 * The renamed Lead then names every chat linked to it (src/lib/chat-display-name.ts).
 */
export function useChatLeadEditor({ channel, conversationId, leadId, assignedToId, onSaved }: {
  channel: 'whatsapp' | 'instagram'
  conversationId: string
  leadId: string | null | undefined
  assignedToId: string | null | undefined
  onSaved: () => void
}) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // SALES may only edit Leads they own, which follow the chat holder — so only their own chats
  const canEdit = !!session?.user && (role !== 'SALES' || assignedToId === session.user.id)

  async function open() {
    if (leadId) { setEditingId(leadId); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/${channel}/conversations/${conversationId}/lead`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.leadId) { toast.error(body?.error ?? 'Could not create a lead for this chat'); return }
      setEditingId(body.leadId)
      onSaved() // the chat is now linked — refresh it
    } finally {
      setBusy(false)
    }
  }

  const sheet = (
    <LeadEditSheet open={!!editingId} leadId={editingId} onClose={() => setEditingId(null)} onSaved={() => onSaved()} />
  )
  return { open, busy, canEdit, sheet }
}
