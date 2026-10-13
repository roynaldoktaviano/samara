// Who currently has which WhatsApp chat open on screen — lets the inbound webhook skip the
// bell + push notification for a rep who is literally looking at the conversation (the
// message just appears in their thread instead).
//
// The open thread heartbeats every ~20s while its tab is visible (POST
// /api/whatsapp/conversations/[id]/presence) and clears on hide/close; an entry older than
// the TTL counts as gone, so a crashed tab can't silence notifications for long.
// In-process only — same single-Node-process assumption as src/lib/realtime-bus.ts.

const TTL_MS = 45_000

const globalForPresence = globalThis as unknown as { chatPresence: Map<string, number> | undefined }
const presence = globalForPresence.chatPresence ?? new Map<string, number>()
globalForPresence.chatPresence = presence

const key = (tenantId: string, userId: string, conversationId: string) => `${tenantId}:${userId}:${conversationId}`

export function markViewing(tenantId: string, userId: string, conversationId: string) {
  presence.set(key(tenantId, userId, conversationId), Date.now())
  // Opportunistic sweep so the map can't grow without bound.
  if (presence.size > 500) {
    const cutoff = Date.now() - TTL_MS
    for (const [k, at] of presence) if (at < cutoff) presence.delete(k)
  }
}

export function clearViewing(tenantId: string, userId: string, conversationId: string) {
  presence.delete(key(tenantId, userId, conversationId))
}

export function isViewing(tenantId: string, userId: string, conversationId: string): boolean {
  const at = presence.get(key(tenantId, userId, conversationId))
  return at !== undefined && Date.now() - at < TTL_MS
}
