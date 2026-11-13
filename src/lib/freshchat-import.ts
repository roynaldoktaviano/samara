/**
 * Freshchat → ERP chat history import (READ-ONLY copy).
 *
 * Freshsales' own API only logs that a chat happened ("Chat" / "Whatsapp Chat" activities with a
 * conversation_id); the messages live in Freshchat and come from its v2 API with a separate token
 * (env / tenant secret FRESHCHAT_API_TOKEN + FRESHCHAT_API_URL). Roy, 2026-11-13: move the
 * WhatsApp + Instagram (+ Messenger, website widget) chat history into the ERP, shown in
 * Chat › Freshchat and on Lead / Guest details, attachments copied to R2.
 *
 * Which conversations: every conversation id the Freshsales archive has seen (timeline
 * CONVERSATION_* / CHAT_* events and Chat activities), each tied to its Freshsales contact →
 * ERP Lead / Guest. Messages are pulled newest-first and stop at the first page that is already
 * stored, so a re-sync of a busy conversation only costs its new pages.
 */
import type { Prisma, PrismaClient, WhatsappBrand } from '@prisma/client'
import { isR2Configured, putToR2 } from './r2'

type Json = Record<string, any>
type Log = (m: string) => void
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const PAGE = 50
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export class FreshchatClient {
  requests = 0
  private base: string
  constructor(url: string, private token: string, private log: Log = console.log) {
    this.base = url.replace(/\/+$/, '').replace(/\/v2$/, '') + '/v2'
  }
  async get(path: string): Promise<Json | null> {
    for (let attempt = 0; ; attempt++) {
      this.requests++
      let res: Response
      try {
        res = await fetch(`${this.base}${path}`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' } })
      } catch (e) {
        if (attempt < 5) { await sleep(3000 * (attempt + 1)); continue }
        throw e
      }
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 60
        this.log(`  freshchat 429 — waiting ${wait}s`)
        await sleep(wait * 1000)
        continue
      }
      if (res.status >= 500 && attempt < 5) { await sleep(5000 * (attempt + 1)); continue }
      if (res.status === 404) return null
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(`Freshchat GET ${path.replace(/\?.*/, '')} → ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
      return data
    }
  }
}

/** Client from env (server: tenant secrets fall back to env, same as Freshsales). */
export function freshchatFromEnv(log?: Log) {
  const url = process.env.FRESHCHAT_API_URL, token = process.env.FRESHCHAT_API_TOKEN
  return url && token ? new FreshchatClient(url, token, log) : null
}

function brandOf(channelName: string | null | undefined): WhatsappBrand | null {
  const n = (channelName ?? '').toLowerCase()
  if (n.includes('mischief')) return 'MISCHIEF'
  if (n.includes('otium')) return 'OTIUM'
  if (n.includes('samara') || n.includes('whatsapp_+6281227013029')) return 'SAMARA'
  return null
}

// ─── lookups ────────────────────────────────────────────────────────────────

type Lookups = { channels: Map<string, { name: string; source: string | null }>; agents: Map<string, string> }
async function loadLookups(fc: FreshchatClient): Promise<Lookups> {
  const [ch, ag] = await Promise.all([fc.get('/channels?items_per_page=100'), fc.get('/agents?items_per_page=100')])
  return {
    channels: new Map(((ch?.channels ?? []) as Json[]).map(c => [String(c.id), { name: String(c.name ?? ''), source: c.source ? String(c.source) : null }])),
    agents: new Map(((ag?.agents ?? []) as Json[]).map(a => [String(a.id), `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.email || 'Agent'])),
  }
}

// ─── discovery ──────────────────────────────────────────────────────────────

/**
 * Adds a stub row for every conversation id the Freshsales archive references (timeline events,
 * Chat activities). Returns how many were new. Lead/Guest links are (re)resolved for all rows.
 */
export async function discoverFreshchatConversations(db: PrismaClient) {
  const inserted = await db.$executeRawUnsafe(`
    INSERT INTO "FreshchatConversation" (id, "contactFsId", "syncedAt")
    SELECT DISTINCT ON (cid) cid, c, NOW() FROM (
      SELECT "actionData"->>'conversation_id' cid, "contactFsId" c, "occurredAt" t FROM "FreshsalesTimelineEvent"
        WHERE "actionType" LIKE 'CONVERSATION_%' AND "actionData"->>'conversation_id' ~ '^[0-9]+$'
      UNION ALL SELECT "actionData"->'freshchat'->>'conversation_id', "contactFsId", "occurredAt" FROM "FreshsalesTimelineEvent"
        WHERE "actionType" LIKE 'CHAT_%' AND "actionData"->'freshchat'->>'conversation_id' ~ '^[0-9]+$'
      UNION ALL SELECT raw->>'conversation_id', "contactFsIds"[1], "fsCreatedAt" FROM "FreshsalesActivity"
        WHERE raw->>'conversation_id' ~ '^[0-9]+$'
    ) x WHERE cid IS NOT NULL ORDER BY cid, t DESC
    ON CONFLICT (id) DO NOTHING`)
  await linkFreshchatConversations(db)
  return inserted
}

/** contactFsId → Lead / Guest (via the Freshsales archive links). */
export async function linkFreshchatConversations(db: PrismaClient) {
  await db.$executeRawUnsafe(`
    UPDATE "FreshchatConversation" fc SET "leadId" = l.id, "customerId" = c."customerId"
    FROM "FreshsalesContact" c LEFT JOIN "Lead" l ON l."freshsalesContactId" = c.id
    WHERE fc."contactFsId" = c.id AND (fc."leadId" IS DISTINCT FROM l.id OR fc."customerId" IS DISTINCT FROM c."customerId")`)
}

// ─── one conversation ───────────────────────────────────────────────────────

async function copyAttachment(convId: string, msgId: string, i: number, a: { url: string; name: string | null; contentType: string | null }) {
  if (!isR2Configured()) return null
  try {
    const res = await fetch(a.url)
    if (!res.ok) return null
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_ATTACHMENT_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_ATTACHMENT_BYTES) return null
    const safe = (a.name ?? 'file').replace(/[^\w.\- ]+/g, '_').slice(-80)
    return await putToR2(`freshchat/${convId}/${msgId}-${i}-${safe}`, buf, a.contentType ?? res.headers.get('content-type') ?? undefined)
  } catch {
    return null
  }
}

function partsOf(m: Json) {
  const texts: string[] = []
  const atts: { kind: string; name: string | null; contentType: string | null; size: number | null; url: string }[] = []
  for (const p of (m.message_parts ?? []) as Json[]) {
    if (p.text?.content) texts.push(String(p.text.content))
    for (const kind of ['image', 'file', 'video', 'audio']) {
      const x = p[kind]
      if (x?.url) atts.push({ kind, name: x.name ?? null, contentType: x.content_type ?? null, size: x.file_size_in_bytes ?? null, url: String(x.url) })
    }
    if (p.url_button?.url) texts.push(`${p.url_button.label ?? 'Link'}: ${p.url_button.url}`)
    if (p.quick_reply_button?.label) texts.push(`[${p.quick_reply_button.label}]`)
    if (p.template_content) texts.push('[Template message]')
  }
  // Rich (reply) parts — template replies / quick-reply menus
  for (const p of (m.reply_parts ?? []) as Json[]) {
    if (p.collection?.sub_parts) for (const s of p.collection.sub_parts) if (s.quick_reply_button?.label) texts.push(`[${s.quick_reply_button.label}]`)
  }
  return { text: texts.join('\n') || null, atts }
}

/**
 * Pulls one conversation's header + messages (newest first, stopping once a page is fully
 * stored) and copies new attachments to R2.
 */
export async function syncFreshchatConversation(db: PrismaClient, fc: FreshchatClient, lk: Lookups, id: string, opts: { copyMedia?: boolean } = {}) {
  const conv = await fc.get(`/conversations/${id}`)
  if (!conv) {
    await db.freshchatConversation.update({ where: { id }, data: { messagesSyncedAt: new Date(), lastError: 'not found in Freshchat' } })
    return 0
  }
  const uuid = String(conv.conversation_id)
  const ch = lk.channels.get(String(conv.channel_id))
  const updatedAt = conv.updated_time ? new Date(conv.updated_time) : null
  const prev = await db.freshchatConversation.findUnique({ where: { id }, select: { fcUpdatedAt: true, messagesSyncedAt: true, fcUserId: true, userName: true } })
  // Nothing new since the last pull
  if (prev?.messagesSyncedAt && prev.fcUpdatedAt && updatedAt && +updatedAt <= +prev.fcUpdatedAt) return 0

  let user: Json | null = null
  if (conv.user_id && (!prev?.fcUserId || !prev.userName)) user = await fc.get(`/users/${conv.user_id}`)

  let added = 0
  for (let page = 1; page <= 200; page++) {
    const data = await fc.get(`/conversations/${uuid}/messages?items_per_page=${PAGE}&page=${page}`)
    const list = (data?.messages ?? []) as Json[]
    if (!list.length) break
    const have = new Set((await db.freshchatMessage.findMany({ where: { id: { in: list.map(m => String(m.id)) } }, select: { id: true } })).map(m => m.id))
    const fresh = list.filter(m => !have.has(String(m.id)))
    const rows: Prisma.FreshchatMessageCreateManyInput[] = []
    for (const m of fresh) {
      const { text, atts } = partsOf(m)
      const attachments: (ReturnType<typeof partsOf>['atts'][number] & { storedUrl: string | null })[] = []
      for (const [i, a] of atts.entries()) {
        const storedUrl = opts.copyMedia === false ? null : await copyAttachment(id, String(m.id), i, a)
        attachments.push({ ...a, storedUrl })
      }
      const actorType = String(m.actor_type ?? '') || null
      rows.push({
        id: String(m.id),
        conversationId: id,
        actorType,
        actorName: actorType === 'agent' ? lk.agents.get(String(m.actor_id)) ?? 'Agent' : actorType === 'user' ? null : actorType,
        messageType: String(m.message_type ?? '') || null,
        text,
        attachments: attachments.length ? (attachments as Prisma.InputJsonValue) : undefined,
        createdAt: new Date(m.created_time),
        raw: { ...m, message_parts: undefined } as Prisma.InputJsonValue,
      })
    }
    if (rows.length) await db.freshchatMessage.createMany({ data: rows, skipDuplicates: true })
    added += rows.length
    if (fresh.length < list.length || list.length < PAGE) break
  }

  const [count, last] = await Promise.all([
    db.freshchatMessage.count({ where: { conversationId: id } }),
    db.freshchatMessage.findFirst({ where: { conversationId: id, messageType: { not: 'system' } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, text: true, attachments: true } }),
  ])
  const lastAtt = (last?.attachments as Json[] | null)?.[0]
  await db.freshchatConversation.update({
    where: { id },
    data: {
      uuid,
      channelId: conv.channel_id ? String(conv.channel_id) : null,
      channelName: ch?.name ?? null,
      channelSource: ch?.source ?? null,
      brand: brandOf(ch?.name),
      status: conv.status ?? null,
      fcUserId: conv.user_id ?? prev?.fcUserId ?? null,
      ...(user ? { userName: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || null, userPhone: user.phone ?? null } : {}),
      assignedAgentName: conv.assigned_agent_id ? lk.agents.get(String(conv.assigned_agent_id)) ?? null : null,
      fcCreatedAt: conv.created_time ? new Date(conv.created_time) : null,
      fcUpdatedAt: updatedAt,
      lastMessageAt: last?.createdAt ?? null,
      lastMessagePreview: (last?.text ?? (lastAtt ? `📎 ${lastAtt.name ?? lastAtt.kind}` : null))?.slice(0, 200) ?? null,
      messageCount: count,
      messagesSyncedAt: new Date(),
      lastError: null,
      raw: conv as Prisma.InputJsonValue,
    },
  })
  return added
}

// ─── batch run ──────────────────────────────────────────────────────────────

/**
 * Discover + pull. `full` pulls every conversation not yet synced; otherwise (the 15-min job)
 * new conversations plus recently active ones are checked for updates.
 */
export async function runFreshchatSync(db: PrismaClient, fc: FreshchatClient, opts: { full?: boolean; limit?: number; concurrency?: number; log?: Log } = {}) {
  const log = opts.log ?? console.log
  const found = await discoverFreshchatConversations(db)
  const lk = await loadLookups(fc)
  const recent = new Date(Date.now() - 3 * 86400000)
  const queue = await db.freshchatConversation.findMany({
    where: opts.full
      ? { messagesSyncedAt: null }
      : { OR: [{ messagesSyncedAt: null }, { lastMessageAt: { gte: recent } }, { status: { notIn: ['resolved'] }, fcUpdatedAt: { gte: new Date(Date.now() - 30 * 86400000) } }] },
    select: { id: true },
    orderBy: { id: 'desc' },
    take: opts.limit ?? (opts.full ? undefined : 300),
  })
  log(`freshchat: ${found} new conversations discovered, ${queue.length} to sync`)
  let done = 0, msgs = 0, failed = 0
  let i = 0
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, queue.length) }, async () => {
    while (i < queue.length) {
      const { id } = queue[i++]
      try { const n = await syncFreshchatConversation(db, fc, lk, id); msgs += n } catch (e) {
        failed++
        await db.freshchatConversation.update({ where: { id }, data: { lastError: String((e as Error).message).slice(0, 500) } }).catch(() => {})
      }
      if (++done % 100 === 0) log(`  freshchat ${done}/${queue.length} conversations, ${msgs} messages (${fc.requests} req, ${failed} failed)`)
    }
  }))
  await linkFreshchatConversations(db)
  log(`freshchat: ${done} conversations synced, ${msgs} new messages, ${failed} failed (${fc.requests} req)`)
  return { discovered: found, synced: done, messages: msgs, failed }
}
