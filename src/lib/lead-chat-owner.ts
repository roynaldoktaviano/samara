import type { PrismaClient } from '@prisma/client'
import { recordLeadOwner } from '@/lib/whatsapp-lead'

// A lead's owner in the ERP is the Sales rep who actually chats with that person (Roy, 19 Nov 2026:
// "salesowner nya ya yang chat", and Freshsales itself is NOT touched). Three systems hand out the
// same shared WhatsApp number's chats independently — ERP round-robin, Freshchat IntelliAssign and
// the Freshsales owner — so the ERP follows whoever is really replying:
//  • "who chats" = the SALES-role user with the most replies to that lead (WhatsApp / Instagram /
//    Messenger, sent from the ERP or copied in from Freshchat) in the last 30 days; tie → latest.
//    Admins (Marc, Roy, Super Admin) and Freshchat's own notices never count.
//  • Leads nobody has replied to lately keep the Freshsales owner (src/lib/freshsales-erp-sync.ts
//    asks chatOwnersByLead first and leaves these owners alone).
//  • The lead's chats follow its owner.

export const CHAT_OWNER_WINDOW_DAYS = 30

// Freshsales user email → ERP login, where they differ (Efrinda works in Freshsales as indah@).
export const OWNER_EMAIL_OVERRIDE: Record<string, string> = { 'indah@samarayachting.com': 'efrinda@samarayachting.com' }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** leadId → ERP user id of the Sales rep who chats with that lead (only leads with Sales replies in the window). */
export async function chatOwnersByLead(db: PrismaClient, leadIds?: string[]): Promise<Map<string, string>> {
  const [users, fsUsers] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, role: true } }),
    db.freshsalesUser.findMany({ select: { name: true, email: true, userId: true } }),
  ])
  const sales = new Set(users.filter(u => u.role === 'SALES').map(u => u.id))
  const byEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]))
  // Freshchat copies carry the agent's display name ("Wulan Maharani") — via the Freshsales user list
  const byAgentName = new Map<string, string>()
  for (const f of fsUsers) {
    const em = (f.email ?? '').toLowerCase()
    const id = f.userId ?? byEmail.get(OWNER_EMAIL_OVERRIDE[em] ?? em)
    if (f.name && id) byAgentName.set(norm(f.name), id)
  }
  const byFirstName = new Map<string, string>()
  for (const u of users) if (sales.has(u.id)) byFirstName.set(norm(u.name).split(' ')[0], u.id)
  const userOf = (uid: string | null, name: string | null) =>
    uid ?? (name ? byAgentName.get(norm(name)) ?? byFirstName.get(norm(name).split(' ')[0]) ?? null : null)

  const since = new Date(Date.now() - CHAT_OWNER_WINDOW_DAYS * 86400000)
  const filter = leadIds ? `AND c."leadId" = ANY($2)` : ''
  const rows = await db.$queryRawUnsafe<{ leadId: string; at: Date; uid: string | null; nm: string | null }[]>(`
    SELECT c."leadId", m."createdAt" at, m."sentByUserId" uid, m."sentByName" nm
      FROM "WhatsappMessage" m JOIN "WhatsappConversation" c ON c.id = m."conversationId"
     WHERE m.direction = 'OUT' AND c."leadId" IS NOT NULL AND m."createdAt" >= $1 ${filter}
    UNION ALL
    SELECT c."leadId", m."createdAt", m."sentByUserId", m."sentByName"
      FROM "InstagramMessage" m JOIN "InstagramConversation" c ON c.id = m."conversationId"
     WHERE m.direction = 'OUT' AND c."leadId" IS NOT NULL AND m."createdAt" >= $1 ${filter}`,
  ...(leadIds ? [since, leadIds] : [since]))

  const tally = new Map<string, Map<string, { n: number; last: number }>>()
  for (const r of rows) {
    const u = userOf(r.uid, r.nm)
    if (!u || !sales.has(u)) continue
    const t = tally.get(r.leadId) ?? new Map<string, { n: number; last: number }>()
    const cur = t.get(u) ?? { n: 0, last: 0 }
    cur.n++
    cur.last = Math.max(cur.last, +r.at)
    t.set(u, cur)
    tally.set(r.leadId, t)
  }
  const out = new Map<string, string>()
  for (const [leadId, t] of tally) {
    const [best] = [...t.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
    out.set(leadId, best[0])
  }
  return out
}

/** Moves every chatted lead (and its chats) to the rep who chats with it. Returns how many leads moved. */
export async function reconcileChatOwners(db: PrismaClient, log: (m: string) => void = () => {}): Promise<number> {
  const owners = await chatOwnersByLead(db)
  if (!owners.size) return 0
  const leads = await db.lead.findMany({ where: { id: { in: [...owners.keys()] }, deletedAt: null }, select: { id: true, ownerId: true } })
  let moved = 0
  for (const l of leads) {
    const want = owners.get(l.id)!
    if (l.ownerId !== want) {
      await recordLeadOwner(db, l.id, want, 'CLAIM')
      moved++
    }
    await db.whatsappConversation.updateMany({ where: { leadId: l.id, OR: [{ assignedToId: null }, { assignedToId: { not: want } }] }, data: { assignedToId: want } })
    await db.instagramConversation.updateMany({ where: { leadId: l.id, OR: [{ assignedToId: null }, { assignedToId: { not: want } }] }, data: { assignedToId: want } })
  }
  if (moved) log(`chat owners: ${moved} lead(s) moved to the rep who chats`)
  return moved
}
