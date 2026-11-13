/**
 * Copies imported Freshchat history (src/lib/freshchat-import.ts) into the ERP's own chat threads,
 * so a person's old Freshchat messages sit in the same WhatsApp / Instagram / Messenger thread the
 * sales team uses in Chat (Roy, 2026-11-13: "yang WA masuk WA, kalau udah ada masukkan ke situ,
 * jangan double").
 *
 *  - WhatsApp (Freshchat number +62 812-2701-3029) → the customer's WhatsApp thread on the SAMARA
 *    brand (matched by phone; created when missing).
 *  - Instagram / Messenger on the Samara / Mischief / Otium accounts → that brand's IG / Messenger
 *    thread, matched by IG username / Messenger name. A thread created here has no Meta id yet;
 *    src/lib/meta-dm.ts adopts it when that person next writes in (no second thread).
 *  - Floresrunaway, Boutique Yachts Indonesia and the website widget have no ERP channel → they
 *    stay in Chat › Freshchat only.
 *
 * No duplicates: each copied message carries providerMessageId "freshchat:<id>" (unique), and on
 * IG / Messenger — where an account can be connected to Freshchat and the ERP at the same time —
 * a message the thread already has (same direction + text within 3 minutes) is skipped.
 * Old history never raises unread counts or "Needs reply": the thread's inbound/outbound clocks
 * only move for conversations active in the last 7 days.
 */
import type { MetaDmPlatform, Prisma, PrismaClient, WhatsappBrand } from '@prisma/client'

type Log = (m: string) => void
type Att = { kind: string; name: string | null; contentType: string | null; url: string; storedUrl: string | null }

const RECENT_MS = 7 * 86400000
const DUP_WINDOW_MS = 3 * 60_000
const digits = (p: string | null | undefined) => {
  let d = (p ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '62' + d.slice(1)
  return d.length >= 8 ? d : null
}
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

type Row = { key: string; direction: 'IN' | 'OUT'; body: string | null; mediaUrl: string | null; mediaType: string | null; sentByName: string | null; createdAt: Date }

function rowsOf(messages: { id: string; actorType: string | null; actorName: string | null; messageType: string | null; text: string | null; attachments: Prisma.JsonValue; createdAt: Date }[]): Row[] {
  const out: Row[] = []
  for (const m of messages) {
    if (m.messageType === 'system' || m.messageType === 'private' || m.actorType === 'system') continue
    const direction = m.actorType === 'user' ? 'IN' : 'OUT'
    const atts = ((m.attachments as Att[] | null) ?? [])
    const sentByName = direction === 'OUT' ? m.actorName ?? 'Freshchat' : null
    if (!atts.length) {
      if (!m.text) continue
      out.push({ key: `freshchat:${m.id}`, direction, body: m.text, mediaUrl: null, mediaType: null, sentByName, createdAt: m.createdAt })
      continue
    }
    atts.forEach((a, i) => out.push({
      key: i ? `freshchat:${m.id}:${i}` : `freshchat:${m.id}`,
      direction, body: i ? null : m.text ?? (a.kind === 'file' ? a.name : null),
      mediaUrl: a.storedUrl ?? a.url, mediaType: a.contentType ?? `${a.kind}/*`, sentByName, createdAt: m.createdAt,
    }))
  }
  return out
}
const previewOf = (r: Row) => r.body?.slice(0, 200) ?? (r.mediaType?.startsWith('image/') ? '📷 Photo' : r.mediaType?.startsWith('video/') ? '🎥 Video' : r.mediaType?.startsWith('audio/') ? '🎤 Audio' : '📎 File')

export async function mirrorFreshchatToErpChats(db: PrismaClient, opts: { apply: boolean; log?: Log; limit?: number } = { apply: false }) {
  const log = opts.log ?? console.log
  const counts: Record<string, number> = {}
  const inc = (k: string, n = 1) => { if (n) counts[k] = (counts[k] ?? 0) + n }

  // Pulled conversations on a channel the ERP has, never mirrored or with new messages since
  const ids = (await db.$queryRawUnsafe<{ id: string }[]>(`
    SELECT id FROM "FreshchatConversation"
    WHERE "messagesSyncedAt" IS NOT NULL AND "messageCount" > 0 AND brand IS NOT NULL
      AND "channelSource" IN ('WHATSAPP', 'INSTA', 'FB_NATIVE')
      AND ("mirroredAt" IS NULL OR "messagesSyncedAt" > "mirroredAt")
    ORDER BY "fcCreatedAt" ASC NULLS FIRST ${opts.limit ? `LIMIT ${Number(opts.limit)}` : ''}`)).map(r => r.id)
  log(`freshchat mirror: ${ids.length} conversations to copy into ERP chats${opts.apply ? '' : ' (dry run)'}`)
  if (!ids.length) return counts

  // Everything needed for matching, loaded once (Neon round trips made a per-conversation loop crawl)
  type WaT = { id: string; phone: string; leadId: string | null; lastMessageAt: Date; lastInboundAt: Date | null; lastOutboundAt: Date | null; createdAt: Date }
  type IgT = { id: string; platform: MetaDmPlatform; brand: WhatsappBrand | null; externalUserId: string | null; igUsername: string | null; displayName: string | null; leadId: string | null; lastMessageAt: Date; lastInboundAt: Date | null; lastOutboundAt?: Date | null; createdAt: Date }
  const waSel = { id: true, phone: true, leadId: true, lastMessageAt: true, lastInboundAt: true, lastOutboundAt: true, createdAt: true } as const
  const igSel = { id: true, platform: true, brand: true, externalUserId: true, igUsername: true, displayName: true, leadId: true, lastMessageAt: true, lastInboundAt: true, createdAt: true } as const
  const [waThreads, igThreads, waKeys, igKeys] = await Promise.all([
    db.whatsappConversation.findMany({ where: { brand: 'SAMARA' }, select: waSel }),
    db.instagramConversation.findMany({ select: igSel }),
    db.whatsappMessage.findMany({ where: { providerMessageId: { startsWith: 'freshchat:' } }, select: { providerMessageId: true } }),
    db.instagramMessage.findMany({ where: { providerMessageId: { startsWith: 'freshchat:' } }, select: { providerMessageId: true } }),
  ])
  const waByPhone = new Map<string, WaT>(), waBy10 = new Map<string, WaT>()
  const addWa = (t: WaT) => { waByPhone.set(t.phone, t); waBy10.set(t.phone.slice(-10), t) }
  waThreads.forEach(addWa)
  const igKey = (platform: MetaDmPlatform, brand: WhatsappBrand | null, who: string) => `${platform}|${brand}|${norm(who)}`
  const igByKey = new Map<string, IgT>()
  const addIg = (t: IgT) => {
    const who = t.platform === 'INSTAGRAM' ? t.igUsername : t.displayName
    if (!who) return
    const k = igKey(t.platform, t.brand, who)
    const cur = igByKey.get(k)
    // Prefer the live (Meta-connected) thread, else the oldest
    if (!cur || (!cur.externalUserId && t.externalUserId)) igByKey.set(k, t)
  }
  igThreads.sort((a, b) => +a.createdAt - +b.createdAt).forEach(addIg)
  const waById = new Map(waThreads.map(t => [t.id, t])), igById = new Map(igThreads.map(t => [t.id, t]))
  // Freshchat agent name → ERP sales user (via the Freshsales user list; Efrinda logs in as indah@),
  // for history threads whose lead has no owner. Philippe isn't a sales rep in the ERP → nobody.
  const [fsUsers, erpUsers] = await Promise.all([db.freshsalesUser.findMany({ select: { name: true, email: true, userId: true } }), db.user.findMany({ select: { id: true, email: true } })])
  const erpByEmail = new Map(erpUsers.map(u => [u.email.toLowerCase(), u.id]))
  const agentUser = new Map<string, string>()
  for (const u of fsUsers) {
    if (!u.name || /philippe/i.test(u.name)) continue
    const em = (u.email ?? '').toLowerCase()
    const id = u.userId ?? erpByEmail.get(em === 'indah@samarayachting.com' ? 'efrinda@samarayachting.com' : em)
    if (id) agentUser.set(norm(u.name), id)
  }
  const ownerFor = (c: { lead: { ownerId: string | null } | null; assignedAgentName: string | null }) =>
    c.lead?.ownerId ?? (c.assignedAgentName ? agentUser.get(norm(c.assignedAgentName)) ?? null : null)
  const copied = new Set([...waKeys, ...igKeys].map(m => m.providerMessageId!))
  // Native (Meta-delivered) IG/Messenger messages, for the "already received by the ERP" check
  const native = new Map<string, { direction: string; body: string; at: number }[]>()
  for (const m of await db.instagramMessage.findMany({ where: { NOT: { providerMessageId: { startsWith: 'freshchat:' } }, body: { not: null } }, select: { conversationId: true, direction: true, body: true, createdAt: true } })) {
    native.set(m.conversationId, [...(native.get(m.conversationId) ?? []), { direction: m.direction, body: norm(m.body), at: +m.createdAt }])
  }

  // Per-thread summary updates, applied once at the end
  type Upd = { kind: 'whatsapp' | 'instagram'; first: Date; last: Row; lastIn: Date | null; lastOut: Date | null; leadId: string | null }
  const upd = new Map<string, Upd>()
  const merge = (id: string, kind: Upd['kind'], u: Omit<Upd, 'kind'>) => {
    const c = upd.get(id)
    if (!c) { upd.set(id, { kind, ...u }); return }
    if (+u.first < +c.first) c.first = u.first
    if (+u.last.createdAt > +c.last.createdAt) c.last = u.last
    if (u.lastIn && (!c.lastIn || u.lastIn > c.lastIn)) c.lastIn = u.lastIn
    if (u.lastOut && (!c.lastOut || u.lastOut > c.lastOut)) c.lastOut = u.lastOut
    c.leadId ??= u.leadId
  }
  const convDone: { id: string; kind: string | null; threadId: string | null }[] = []
  let fakeId = 0

  for (let i = 0; i < ids.length; i += 100) {
    const convs = await db.freshchatConversation.findMany({
      where: { id: { in: ids.slice(i, i + 100) } },
      select: {
        id: true, channelSource: true, channelName: true, brand: true, userName: true, userPhone: true, erpThreadKind: true, erpThreadId: true, assignedAgentName: true,
        lead: { select: { id: true, name: true, ownerId: true } },
        messages: { orderBy: { createdAt: 'asc' }, select: { id: true, actorType: true, actorName: true, messageType: true, text: true, attachments: true, createdAt: true } },
      },
    })
    const waRows: Prisma.WhatsappMessageCreateManyInput[] = [], igRows: Prisma.InstagramMessageCreateManyInput[] = []
    for (const conv of convs) {
      const rows = rowsOf(conv.messages)
      if (!rows.length) { inc('skipped: no customer/agent messages'); convDone.push({ id: conv.id, kind: null, threadId: null }); continue }
      const last = rows[rows.length - 1]
      const lastIn = [...rows].reverse().find(r => r.direction === 'IN')?.createdAt ?? null
      const lastOut = [...rows].reverse().find(r => r.direction === 'OUT')?.createdAt ?? null
      const brand = conv.brand as WhatsappBrand

      if (conv.channelSource === 'WHATSAPP') {
        const phone = digits(conv.userPhone)
        if (!phone) { inc('skipped: WhatsApp without phone'); convDone.push({ id: conv.id, kind: null, threadId: null }); continue }
        let thread = (conv.erpThreadKind === 'whatsapp' && conv.erpThreadId ? waById.get(conv.erpThreadId) : undefined)
          ?? waByPhone.get(phone) ?? waBy10.get(phone.slice(-10))
        if (!thread) {
          inc('whatsapp: threads created')
          if (!ownerFor(conv)) inc('whatsapp: new threads left unassigned')
          const data = {
            phone, brand: 'SAMARA' as const, contactName: conv.lead?.name ?? conv.userName ?? null, category: 'SALES' as const,
            leadId: conv.lead?.id ?? null, assignedToId: ownerFor(conv),
            lastMessageAt: last.createdAt, lastMessagePreview: previewOf(last), unreadCount: 0, createdAt: rows[0].createdAt,
          }
          thread = opts.apply ? await db.whatsappConversation.create({ data, select: waSel })
            : { id: `dry-${++fakeId}`, phone, leadId: data.leadId, lastMessageAt: data.lastMessageAt, lastInboundAt: null, lastOutboundAt: null, createdAt: data.createdAt }
          addWa(thread); waById.set(thread.id, thread)
        } else if (!upd.has(thread.id)) inc('whatsapp: existing threads extended')
        const fresh = rows.filter(r => !copied.has(r.key))
        fresh.forEach(r => copied.add(r.key))
        waRows.push(...fresh.map(r => ({ conversationId: thread!.id, direction: r.direction, body: r.body, mediaUrl: r.mediaUrl, mediaType: r.mediaType, status: 'READ' as const, providerMessageId: r.key, sentByName: r.sentByName, createdAt: r.createdAt })))
        inc('whatsapp: messages copied', fresh.length)
        merge(thread.id, 'whatsapp', { first: rows[0].createdAt, last, lastIn, lastOut, leadId: conv.lead?.id ?? null })
        convDone.push({ id: conv.id, kind: 'whatsapp', threadId: thread.id })
      } else {
        const platform: MetaDmPlatform = conv.channelSource === 'INSTA' ? 'INSTAGRAM' : 'MESSENGER'
        const who = conv.userName?.trim()
        if (!who) { inc(`skipped: ${platform} without username/name`); convDone.push({ id: conv.id, kind: null, threadId: null }); continue }
        let thread = (conv.erpThreadKind === 'instagram' && conv.erpThreadId ? igById.get(conv.erpThreadId) : undefined) ?? igByKey.get(igKey(platform, brand, who))
        if (!thread) {
          inc(`${platform.toLowerCase()}: threads created`)
          const data = {
            platform, brand, externalUserId: null,
            igUsername: platform === 'INSTAGRAM' ? who : null,
            displayName: platform === 'MESSENGER' ? who : conv.lead?.name ?? null,
            ourAccountUsername: platform === 'INSTAGRAM' ? conv.channelName?.replace(/^IG_/, '') ?? null : null,
            leadId: conv.lead?.id ?? null, assignedToId: ownerFor(conv),
            lastMessageAt: last.createdAt, lastMessagePreview: previewOf(last), unreadCount: 0, createdAt: rows[0].createdAt,
          }
          thread = opts.apply ? await db.instagramConversation.create({ data, select: igSel })
            : { id: `dry-${++fakeId}`, platform, brand, externalUserId: null, igUsername: data.igUsername, displayName: data.displayName, leadId: data.leadId, lastMessageAt: data.lastMessageAt, lastInboundAt: null, createdAt: data.createdAt }
          addIg(thread); igById.set(thread.id, thread)
        } else if (!upd.has(thread.id)) inc(`${platform.toLowerCase()}: existing threads extended`)
        const nat = native.get(thread.id) ?? []
        const isNativeDup = (r: Row) => !!r.body && nat.some(x => x.direction === r.direction && x.body === norm(r.body) && Math.abs(x.at - +r.createdAt) <= DUP_WINDOW_MS)
        const fresh = rows.filter(r => !copied.has(r.key) && !isNativeDup(r))
        inc('ig/messenger: skipped (already in ERP from Meta)', rows.filter(r => !copied.has(r.key) && isNativeDup(r)).length)
        fresh.forEach(r => copied.add(r.key))
        igRows.push(...fresh.map(r => ({ conversationId: thread!.id, direction: r.direction, body: r.body, mediaUrl: r.mediaUrl, mediaType: r.mediaType, status: 'READ' as const, providerMessageId: r.key, sentByName: r.sentByName, createdAt: r.createdAt })))
        inc(`${platform.toLowerCase()}: messages copied`, fresh.length)
        merge(thread.id, 'instagram', { first: rows[0].createdAt, last, lastIn, lastOut, leadId: conv.lead?.id ?? null })
        convDone.push({ id: conv.id, kind: 'instagram', threadId: thread.id })
      }
    }
    if (opts.apply) {
      for (let j = 0; j < waRows.length; j += 1000) await db.whatsappMessage.createMany({ data: waRows.slice(j, j + 1000), skipDuplicates: true })
      for (let j = 0; j < igRows.length; j += 1000) await db.instagramMessage.createMany({ data: igRows.slice(j, j + 1000), skipDuplicates: true })
    }
    log(`  mirror ${Math.min(i + 100, ids.length)}/${ids.length}`)
  }

  if (opts.apply) {
    // Thread summaries: newest message/preview, lead link, clocks only for recent activity
    const ups = [...upd].map(([id, u]) => {
      const t = u.kind === 'whatsapp' ? waById.get(id)! : igById.get(id)!
      const recent = Date.now() - +u.last.createdAt < RECENT_MS
      const data: Record<string, unknown> = {}
      if (+u.last.createdAt > +t.lastMessageAt) { data.lastMessageAt = u.last.createdAt; data.lastMessagePreview = previewOf(u.last) }
      if (!t.leadId && u.leadId) data.leadId = u.leadId
      if (recent && u.lastIn && (!t.lastInboundAt || u.lastIn > t.lastInboundAt)) data.lastInboundAt = u.lastIn
      if (u.kind === 'whatsapp' && recent && u.lastOut && (!(t as WaT).lastOutboundAt || u.lastOut > (t as WaT).lastOutboundAt!)) data.lastOutboundAt = u.lastOut
      if (+u.first < +t.createdAt) data.createdAt = u.first
      return { id, kind: u.kind, data }
    }).filter(u => Object.keys(u.data).length)
    for (let j = 0; j < ups.length; j += 100) {
      await db.$transaction(ups.slice(j, j + 100).map(u => u.kind === 'whatsapp'
        ? db.whatsappConversation.update({ where: { id: u.id }, data: u.data, select: { id: true } })
        : db.instagramConversation.update({ where: { id: u.id }, data: u.data, select: { id: true } })))
    }
    const now = new Date()
    for (let j = 0; j < convDone.length; j += 200) {
      await db.$transaction(convDone.slice(j, j + 200).map(c => db.freshchatConversation.update({
        where: { id: c.id }, data: { mirroredAt: now, ...(c.threadId ? { erpThreadKind: c.kind, erpThreadId: c.threadId } : {}) }, select: { id: true },
      })))
    }
  }
  log(`freshchat mirror: ${JSON.stringify(counts)}`)
  return counts
}

/**
 * Inbound DM from someone with no Meta-connected thread yet: if a history thread copied from
 * Freshchat exists for them (same brand + IG username / Messenger name, no Meta id), give it the
 * Meta id so the new message lands in it instead of a second thread. Only an unambiguous match.
 */
export async function adoptFreshchatHistoryThread(db: PrismaClient, p: {
  platform: MetaDmPlatform; brand: WhatsappBrand | null; externalUserId: string; ourAccountId: string | null
  username: string | null; displayName: string | null; profilePicUrl: string | null
}) {
  if (!p.brand) return null
  const match = p.platform === 'INSTAGRAM' ? (p.username ? { igUsername: { equals: p.username, mode: 'insensitive' as const } } : null)
    : (p.displayName ? { displayName: { equals: p.displayName, mode: 'insensitive' as const } } : null)
  if (!match) return null
  const cands = await db.instagramConversation.findMany({ where: { platform: p.platform, brand: p.brand, externalUserId: null, ...match }, select: { id: true }, take: 2 })
  if (cands.length !== 1) return null
  const r = await db.instagramConversation.updateMany({
    where: { id: cands[0].id, externalUserId: null },
    data: { externalUserId: p.externalUserId, ourAccountId: p.ourAccountId, ...(p.profilePicUrl ? { profilePicUrl: p.profilePicUrl } : {}), ...(p.username ? { igUsername: p.username } : {}) },
  }).catch(() => ({ count: 0 }))
  return r.count ? cands[0].id : null
}
