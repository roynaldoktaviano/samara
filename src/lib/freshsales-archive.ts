/**
 * Freshsales → ERP archive sync ("Lapis 1"). Copies Freshsales records as-is into the
 * Freshsales* tables (see the "Freshsales archive" block in prisma/schema.prisma). It never
 * touches Lead/Customer/User rows except to fill FreshsalesContact.leadId/customerId from the
 * existing freshsalesContactId links, so it has no side effects on the live pipeline.
 *
 * Every step is an idempotent upsert keyed by the Freshsales id and can be re-run or resumed:
 *  - lookups / users / activities / contacts: full re-pull (cheap)
 *  - dealsIndex: every deal via filtered_search. The "All Deals" view hides about half the
 *    deals (8,707 of 17,919 when this was written), so views can't be used to find deals.
 *  - dealDetails: GET /api/deals/{id} for each deal whose detailSyncedAt is null
 *  - conversations / timeline: per contact, for contacts whose *SyncedAt is null
 *
 * Rate limit: Freshsales allows 2000 req/h + 400 req/min per account, and that budget is
 * shared with the sales team's integrations, so the client stops spending at RESERVE requests
 * left and waits for the hourly window to reset.
 */
import type { Prisma, PrismaClient, FreshsalesLookupKind, FreshsalesActivityKind } from '@prisma/client'

type Json = Record<string, any>

const RESERVE = 300
const MIN_GAP_MS = 200 // ≤ 300/min, under the 400/min cap
const PAGE = 100

// ─── HTTP client ────────────────────────────────────────────────────────────

export class FreshsalesClient {
  private lastAt = 0
  requests = 0
  constructor(private domain: string, private apiKey: string, private log: (m: string) => void = console.log) {}

  async get(path: string) { return this.call('GET', path) }
  async post(path: string, body: unknown) { return this.call('POST', path, body) }

  private async call(method: string, path: string, body?: unknown): Promise<Json | null> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastAt + MIN_GAP_MS - Date.now()
      if (wait > 0) await sleep(wait)
      this.lastAt = Date.now()
      let res: Response
      try {
        res = await fetch(`https://${this.domain}${path}`, {
          method,
          headers: { Authorization: `Token token=${this.apiKey}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: 'no-store',
        })
      } catch (e) {
        if (attempt < 10) { await sleep(Math.min(60_000, 3000 * 2 ** attempt)); continue }
        throw e
      }
      this.requests++
      const remaining = Number(res.headers.get('x-ratelimit-remaining'))
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After')) || 60
        this.log(`  429 rate limited — waiting ${retry}s`)
        await sleep(retry * 1000)
        continue
      }
      if (res.status >= 500 && attempt < 5) { await sleep(5000 * (attempt + 1)); continue }
      if (res.status === 404) return null
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(`Freshsales ${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
      if (Number.isFinite(remaining) && remaining < RESERVE) {
        // The hourly quota refills all at once at x-ratelimit-reset, so sleep until then
        // (a short fixed nap would just spend one request per wake-up and never recover).
        const resetAt = parseResetHeader(res.headers.get('x-ratelimit-reset'))
        const ms = resetAt ? Math.min(65 * 60_000, Math.max(30_000, resetAt.getTime() - Date.now() + 30_000)) : 10 * 60_000
        this.log(`  hourly budget low (${remaining} left) — sleeping ${Math.round(ms / 60_000)} min until quota reset`)
        await sleep(ms)
      }
      return data
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

// Freshsales sends the reset moment as ddMMyyHHmmss in UTC, e.g. "121026061813" = 2026-10-12 06:18:13Z
function parseResetHeader(v: string | null) {
  const m = v?.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (!m) return null
  const [, dd, mm, yy, hh, mi, ss] = m.map(Number)
  const d = new Date(Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss))
  return isNaN(+d) ? null : d
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
const date = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); return isNaN(+d) ? null : d }
const num = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const int = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n) }
const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue))
// Display-only keys that bloat `raw` without carrying data
function slim(o: Json) {
  const { avatar, links, collaboration, fc_widget_collaboration, freddy_forecast_metrics, ...rest } = o
  return rest
}
// Some endpoints cap per_page at 25 whatever is asked, so paging follows meta, not page size.
function hasMore(meta: Json | undefined, page: number, pageLen: number, seen: number) {
  if (!pageLen) return false
  if (typeof meta?.has_next === 'boolean') return meta.has_next
  if (meta?.total_pages) return page < Number(meta.total_pages)
  if (meta?.total !== undefined) return seen < Number(meta.total)
  return true // no meta: keep going until an empty page
}
const uniq = (a: (string | null)[]) => [...new Set(a.filter((x): x is string => !!x))]

async function retryDb<T>(db: PrismaClient, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e: any) {
      const conn = ['P1017', 'P1001', 'P1008', 'P2024'].includes(e?.code) || e?.name === 'PrismaClientInitializationError'
        || /closed|ECONNRESET|Can't reach database|timed out/i.test(e?.message ?? '')
      if (!conn || i >= 10) throw e
      await db.$disconnect().catch(() => {}); await sleep(Math.min(60_000, 3000 * 2 ** i)); await db.$connect().catch(() => {})
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

async function state(db: PrismaClient, entity: string, data: Partial<{ status: string; processed: number; total: number | null; lastError: string | null; startedAt: Date; finishedAt: Date | null; cursor: Prisma.InputJsonValue }>) {
  await retryDb(db, () => db.freshsalesSyncState.upsert({ where: { entity }, create: { entity, ...data }, update: data }))
}

// Page to resume from when the previous run of a paged step didn't finish
async function resumePage(db: PrismaClient, entity: string) {
  const s = await retryDb(db, () => db.freshsalesSyncState.findUnique({ where: { entity } }))
  const page = Number((s?.cursor as Json | null)?.page)
  return s && s.status !== 'DONE' && page > 1 ? { page, processed: s.processed } : { page: 1, processed: 0 }
}

async function track<T>(db: PrismaClient, entity: string, fn: () => Promise<T>): Promise<T> {
  await state(db, entity, { status: 'RUNNING', startedAt: new Date(), finishedAt: null, lastError: null })
  try {
    const r = await fn()
    await state(db, entity, { status: 'DONE', finishedAt: new Date() })
    return r
  } catch (e: any) {
    await state(db, entity, { status: 'ERROR', lastError: String(e?.message ?? e).slice(0, 2000) })
    throw e
  }
}

// ─── lookups & users ────────────────────────────────────────────────────────

const LOOKUPS: [FreshsalesLookupKind, string, string?][] = [
  ['DEAL_PIPELINE', 'deal_pipelines'],
  ['DEAL_STAGE', 'deal_stages', 'deal_pipeline_id'],
  ['DEAL_REASON', 'deal_reasons'],
  ['DEAL_TYPE', 'deal_types'],
  ['DEAL_PAYMENT_STATUS', 'deal_payment_statuses'],
  ['LEAD_SOURCE', 'lead_sources'],
  ['CAMPAIGN', 'campaigns'],
  ['TERRITORY', 'territories'],
  ['CURRENCY', 'currencies'],
  ['ACTIVITY_TYPE', 'sales_activity_types'],
  ['ACTIVITY_OUTCOME', 'sales_activity_outcomes', 'sales_activity_type_id'],
]

export async function syncLookups(db: PrismaClient, fs: FreshsalesClient) {
  return track(db, 'lookups', async () => {
    let n = 0
    for (const [kind, key, parentKey] of LOOKUPS) {
      const data = await fs.get(`/api/selector/${key}`)
      const rows: Json[] = data?.[key] ?? []
      for (const r of rows) {
        const { id, name, position, ...extra } = r
        const row = {
          name: String(name ?? r.currency_code ?? id),
          parentFsId: parentKey ? str(r[parentKey]) : null,
          position: int(position),
          extra: json(extra),
        }
        await retryDb(db, () => db.freshsalesLookup.upsert({
          where: { kind_fsId: { kind, fsId: String(id) } },
          create: { kind, fsId: String(id), ...row },
          update: row,
        }))
        n++
      }
    }
    await state(db, 'lookups', { processed: n })
    return n
  })
}

export async function syncUsers(db: PrismaClient, fs: FreshsalesClient) {
  return track(db, 'users', async () => {
    const data = await fs.get('/api/selector/owners')
    const users: Json[] = data?.users ?? []
    const erp = await db.user.findMany({ select: { id: true, email: true } })
    const byEmail = new Map(erp.map(u => [u.email.toLowerCase(), u.id]))
    for (const u of users) {
      const row = {
        name: str(u.display_name),
        email: str(u.email),
        isActive: u.is_active !== false,
        userId: u.email ? byEmail.get(String(u.email).toLowerCase()) ?? null : null,
      }
      await retryDb(db, () => db.freshsalesUser.upsert({ where: { id: String(u.id) }, create: { id: String(u.id), ...row }, update: row }))
    }
    await state(db, 'users', { processed: users.length })
    return users.length
  })
}

// ─── contacts ───────────────────────────────────────────────────────────────

function contactRow(c: Json) {
  return {
    name: str(c.display_name) ?? (uniq([str(c.first_name), str(c.last_name)]).join(' ') || null),
    email: str(c.email),
    phone: str(c.mobile_number) ?? str(c.work_number) ?? str(c.phone_numbers?.[0]?.value),
    ownerFsId: str(c.owner_id),
    lastContactedAt: date(c.last_contacted),
    fsCreatedAt: date(c.created_at),
    fsUpdatedAt: date(c.updated_at),
    isDeleted: c.is_deleted === true,
    raw: json(slim(c)),
  }
}

async function upsertMany<R extends { id: string }>(
  existingIds: (ids: string[]) => Promise<string[]>,
  rows: R[],
  createMany: (rows: R[]) => Promise<unknown>,
  update: (row: R) => Promise<unknown>,
) {
  if (!rows.length) return
  const have = new Set(await existingIds(rows.map(r => r.id)))
  const fresh = rows.filter(r => !have.has(r.id))
  if (fresh.length) await createMany(fresh)
  await pool(rows.filter(r => have.has(r.id)), 5, async r => { await update(r) })
}

export async function syncContacts(db: PrismaClient, fs: FreshsalesClient, viewId = '13000726037') {
  const resume = await resumePage(db, 'contacts')
  return track(db, 'contacts', async () => {
    let { page, processed: n } = resume, total: number | null = null
    for (;;) {
      const data = await fs.get(`/api/contacts/view/${viewId}?page=${page}&per_page=${PAGE}&sort=created_at&sort_type=asc`)
      const list: Json[] = data?.contacts ?? []
      total = data?.meta?.total ?? total
      const rows = list.map(c => ({ id: String(c.id), ...contactRow(c) }))
      await retryDb(db, () => upsertMany(
        ids => db.freshsalesContact.findMany({ where: { id: { in: ids } }, select: { id: true } }).then(r => r.map(x => x.id)),
        rows,
        r => db.freshsalesContact.createMany({ data: r, skipDuplicates: true }),
        ({ id, ...r }) => db.freshsalesContact.update({ where: { id }, data: r }),
      ))
      n += rows.length
      if (page % 10 === 0) await state(db, 'contacts', { processed: n, total, cursor: { page: page + 1 } })
      if (list.length < PAGE) break
      page++
    }
    await state(db, 'contacts', { processed: n, total })
    await linkContacts(db)
    return n
  })
}

// Contact → Lead/Customer by the freshsalesContactId the earlier contact import already set.
// Exact-id matches only; email/phone matching belongs to the ERP mapping step ("Lapis 2").
export async function linkContacts(db: PrismaClient) {
  await db.$executeRaw`UPDATE "FreshsalesContact" fc SET "leadId" = l.id FROM "Lead" l
    WHERE l."freshsalesContactId" = fc.id AND fc."leadId" IS DISTINCT FROM l.id`
  await db.$executeRaw`UPDATE "FreshsalesContact" fc SET "customerId" = c.id FROM "Customer" c
    WHERE c."freshsalesContactId" = fc.id AND fc."customerId" IS DISTINCT FROM c.id`
}

// ─── deals ──────────────────────────────────────────────────────────────────

export async function syncDealsIndex(db: PrismaClient, fs: FreshsalesClient) {
  const resume = await resumePage(db, 'dealsIndex')
  return track(db, 'dealsIndex', async () => {
    const stages = await db.freshsalesLookup.findMany({ where: { kind: 'DEAL_STAGE' }, select: { fsId: true, parentFsId: true } })
    const pipelineOf = new Map(stages.map(s => [s.fsId, s.parentFsId]))
    let { page, processed: n } = resume, total: number | null = null
    for (;;) {
      const data = await fs.post(`/api/filtered_search/deal?page=${page}&per_page=${PAGE}&sort=created_at&sort_type=asc&include=owner,contacts,deal_stage,currency`, { filter_rule: [] })
      const list: Json[] = data?.deals ?? []
      total = data?.meta?.total ?? total
      // Contacts referenced by deals but missing from the contacts view still get a stub row
      const contacts: Json[] = data?.contacts ?? []
      if (contacts.length) {
        await retryDb(db, () => db.freshsalesContact.createMany({
          data: contacts.map(c => ({ id: String(c.id), name: str(c.display_name), email: str(c.email), phone: str(c.mobile_number) ?? str(c.work_number), ownerFsId: str(c.owner_id) })),
          skipDuplicates: true,
        }))
      }
      const rows = list.map(d => {
        const stageFsId = str(d.deal_stage_id)
        return {
          id: String(d.id),
          name: str(d.name) ?? `Deal ${d.id}`,
          amount: num(d.amount),
          baseCurrencyAmount: num(d.base_currency_amount),
          currencyFsId: str(d.currency_id),
          stageFsId,
          pipelineFsId: stageFsId ? pipelineOf.get(stageFsId) ?? null : null,
          stageUpdatedAt: date(d.stage_updated_time),
          ownerFsId: str(d.owner_id),
          contactFsIds: (d.contact_ids ?? []).map(String),
          probability: int(d.probability),
          expectedClose: date(d.expected_close),
          fsCreatedAt: date(d.created_at),
        }
      })
      await retryDb(db, () => upsertMany(
        ids => db.freshsalesDeal.findMany({ where: { id: { in: ids } }, select: { id: true } }).then(r => r.map(x => x.id)),
        rows,
        r => db.freshsalesDeal.createMany({ data: r, skipDuplicates: true }),
        ({ id, ...r }) => db.freshsalesDeal.update({ where: { id }, data: r }),
      ))
      n += rows.length
      if (page % 10 === 0) await state(db, 'dealsIndex', { processed: n, total, cursor: { page: page + 1 } })
      if (list.length < PAGE) break
      page++
    }
    await state(db, 'dealsIndex', { processed: n, total })
    return n
  })
}

function dealDetailRow(d: Json) {
  return {
    name: str(d.name) ?? `Deal ${d.id}`,
    amount: num(d.amount),
    baseCurrencyAmount: num(d.base_currency_amount),
    currencyFsId: str(d.currency_id),
    pipelineFsId: str(d.deal_pipeline_id),
    stageFsId: str(d.deal_stage_id),
    stageUpdatedAt: date(d.stage_updated_time),
    lostReasonFsId: str(d.deal_reason_id),
    dealTypeFsId: str(d.deal_type_id),
    leadSourceFsId: str(d.lead_source_id),
    campaignFsId: str(d.campaign_id),
    paymentStatusFsId: str(d.deal_payment_status_id),
    ownerFsId: str(d.owner_id),
    contactFsIds: (d.contact_ids ?? []).map(String),
    salesAccountFsId: str(d.sales_account_id),
    probability: int(d.probability),
    forecastCategory: str(d.forecast_category),
    expectedClose: date(d.expected_close),
    closedDate: date(d.closed_date),
    isDeleted: d.is_deleted === true,
    customFields: json(d.custom_field),
    fsCreatedAt: date(d.created_at),
    fsUpdatedAt: date(d.updated_at),
    raw: json(slim(d)),
  }
}

/** Full GET per deal (custom fields, lost reason, closed date, notes). Resumable. */
export async function syncDealDetails(db: PrismaClient, fs: FreshsalesClient, opts: { limit?: number; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log
  return track(db, 'dealDetails', async () => {
    const total = await db.freshsalesDeal.count({ where: { detailSyncedAt: null } })
    await state(db, 'dealDetails', { total })
    let n = 0
    for (;;) {
      const batch = await retryDb(db, () => db.freshsalesDeal.findMany({ where: { detailSyncedAt: null }, select: { id: true }, orderBy: { fsCreatedAt: 'desc' }, take: 50 }))
      if (!batch.length) break
      for (const { id } of batch) {
        const data = await fs.get(`/api/deals/${id}?include=notes`)
        if (!data?.deal) {
          await retryDb(db, () => db.freshsalesDeal.update({ where: { id }, data: { isDeleted: true, detailSyncedAt: new Date() } }))
        } else {
          await retryDb(db, () => db.freshsalesDeal.update({ where: { id }, data: { ...dealDetailRow(data.deal), detailSyncedAt: new Date() } }))
          for (const note of (data.notes ?? []) as Json[]) await upsertActivity(db, 'NOTE', note, { dealFsIds: [id] })
        }
        n++
        if (opts.limit && n >= opts.limit) { await state(db, 'dealDetails', { processed: n }); return n }
      }
      await state(db, 'dealDetails', { processed: n })
      log(`  dealDetails ${n}/${total} (${fs.requests} req)`)
    }
    await state(db, 'dealDetails', { processed: n })
    return n
  })
}

// ─── activities (sales activities, tasks, appointments, notes) ──────────────

function targetsOf(a: Json) {
  const t: Json[] = [...(a.targetables ?? [])]
  if (a.targetable_id) t.push({ id: a.targetable_id, type: a.targetable_type })
  const of = (type: string) => uniq(t.filter(x => String(x.type ?? '').toLowerCase() === type).map(x => str(x.id)))
  return { contactFsIds: of('contact'), dealFsIds: of('deal') }
}

async function upsertActivity(db: PrismaClient, kind: FreshsalesActivityKind, a: Json, extra: { contactFsIds?: string[]; dealFsIds?: string[] } = {}) {
  const t = targetsOf(a)
  const statusVal = a.status
  const row = {
    title: str(a.title),
    body: str(a.notes) ?? str(a.description),
    typeFsId: str(a.sales_activity_type_id) ?? str(a.task_type_id),
    outcomeFsId: str(a.sales_activity_outcome_id) ?? str(a.outcome_id),
    status: statusVal === true || statusVal === 1 ? 'completed' : statusVal === false || statusVal === 0 ? 'open' : str(statusVal),
    startAt: date(a.start_date) ?? date(a.from_date),
    endAt: date(a.end_date) ?? date(a.to_date),
    dueAt: date(a.due_date),
    completedAt: date(a.completed_date),
    location: str(a.location),
    ownerFsId: str(a.owner_id),
    creatorFsId: str(a.creater_id),
    contactFsIds: uniq([...t.contactFsIds, ...(extra.contactFsIds ?? [])]),
    dealFsIds: uniq([...t.dealFsIds, ...(extra.dealFsIds ?? [])]),
    fsCreatedAt: date(a.created_at),
    fsUpdatedAt: date(a.updated_at),
    raw: json(slim(a)),
  }
  await retryDb(db, () => db.freshsalesActivity.upsert({
    where: { kind_fsId: { kind, fsId: String(a.id) } },
    create: { kind, fsId: String(a.id), ...row },
    update: row,
  }))
}

export async function syncActivities(db: PrismaClient, fs: FreshsalesClient) {
  return track(db, 'activities', async () => {
    let n = 0
    const sources: [FreshsalesActivityKind, string, string][] = [
      ['SALES_ACTIVITY', '/api/sales_activities?', 'sales_activities'],
      ['TASK', '/api/tasks?filter=open&include=targetable&', 'tasks'],
      ['TASK', '/api/tasks?filter=completed&include=targetable&', 'tasks'],
      ['APPOINTMENT', '/api/appointments?filter=past&include=targetable&', 'appointments'],
      ['APPOINTMENT', '/api/appointments?filter=upcoming&include=targetable&', 'appointments'],
    ]
    for (const [kind, base, key] of sources) {
      for (let page = 1, seen = 0; ; page++) {
        const data = await fs.get(`${base}page=${page}&per_page=${PAGE}`)
        const list: Json[] = data?.[key] ?? []
        for (const a of list) { await upsertActivity(db, kind, a); n++ }
        seen += list.length
        if (!hasMore(data?.meta, page, list.length, seen)) break
      }
    }
    await state(db, 'activities', { processed: n })
    return n
  })
}

// ─── per-contact: conversations & timeline ──────────────────────────────────

// Every live contact is crawled: "never contacted" contacts still carry Freshchat WhatsApp/
// Messenger chats, logged activities and timeline events (checked on a random sample), and
// Freshsales has no account-wide endpoint for those. Contacts with a deal or a last-contacted
// date go first so the useful history lands early. The order is computed once per run in JS —
// sorting on a per-row EXISTS over 34k contacts took ~90s per query.
async function crawlQueue(db: PrismaClient, column: 'conversationsSyncedAt' | 'timelineSyncedAt') {
  const [pending, dealContacts] = await Promise.all([
    db.freshsalesContact.findMany({ where: { [column]: null, isDeleted: false }, select: { id: true, lastContactedAt: true, fsCreatedAt: true } }),
    db.$queryRaw<{ id: string }[]>`SELECT DISTINCT unnest("contactFsIds") AS id FROM "FreshsalesDeal"`,
  ])
  const onDeal = new Set(dealContacts.map(r => r.id))
  const rank = (c: (typeof pending)[number]) => (c.lastContactedAt || onDeal.has(c.id) ? 1 : 0)
  return pending.sort((a, b) =>
    rank(b) - rank(a)
    || (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0)
    || (b.fsCreatedAt?.getTime() ?? 0) - (a.fsCreatedAt?.getTime() ?? 0),
  ).map(c => c.id)
}

export async function crawlScopeCount(db: PrismaClient) {
  const [r] = await db.$queryRaw<{ total: bigint; conv: bigint; tl: bigint }[]>`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE fc."conversationsSyncedAt" IS NULL) AS conv,
           count(*) FILTER (WHERE fc."timelineSyncedAt" IS NULL) AS tl
    FROM "FreshsalesContact" fc
    WHERE fc."isDeleted" = false`
  return { total: Number(r.total), conversationsLeft: Number(r.conv), timelineLeft: Number(r.tl) }
}

async function syncContactConversations(db: PrismaClient, fs: FreshsalesClient, contactId: string) {
  let n = 0
  for (let page = 1, seen = 0; page <= 100; page++) {
    const data = await fs.get(`/api/contacts/${contactId}/conversations?include=email_conversation_recipients,targetable,note,user&per_page=${PAGE}&page=${page}`)
    if (!data) break
    const recipients = new Map<string, Json>(((data.email_conversation_recipients ?? []) as Json[]).map(r => [String(r.id), r]))
    const rows: (Prisma.FreshsalesConversationCreateManyInput & { id: string; contactFsIds: string[]; dealFsIds: string[] })[] = []
    for (const e of (data.email_conversations ?? []) as Json[]) {
      const parts = ((e.email_conversation_recipient_ids ?? []) as unknown[]).map(id => recipients.get(String(id))).filter(Boolean) as Json[]
      const participants = parts.map(p => ({
        field: p.field, email: p.email_address, name: p.email_name, isUser: p.is_user,
        targetType: p.targetable?.type ?? null, targetFsId: str(p.targetable?.id),
        openedAt: p.opened_time ?? null, clickedAt: p.clicked_time ?? null, bounced: !!p.bounced,
      }))
      const contactFsIds = uniq([contactId, ...participants.filter(p => String(p.targetType).toLowerCase() === 'contact').map(p => p.targetFsId)])
      const dealFsIds = uniq(((e.linked_deals ?? []) as unknown[]).map(str))
      const attachments = ((e.attachments ?? []) as Json[]).map(a => ({
        fsId: str(a.id), fileName: a.content_file_name, contentType: a.content_content_type, size: a.content_file_size, url: a.content_path, storedUrl: null,
      }))
      const id = String(e.id)
      rows.push({
        id,
        contactFsIds,
        dealFsIds,
        channel: 'EMAIL',
        threadFsId: str(e.email_id),
        direction: str(e.direction),
        subject: str(e.subject),
        bodyText: str(e.display_content),
        bodyHtml: str(e.html_content) ?? str(e.current_html_content),
        status: int(e.status),
        messageCount: int(e.count),
        isRead: typeof e.is_read === 'boolean' ? e.is_read : null,
        needsResponse: typeof e.needs_response === 'boolean' ? e.needs_response : null,
        occurredAt: date(e.conversation_time),
        participants: json(participants),
        attachments: json(attachments),
        raw: json(e),
      })
    }
    // One round trip per page: insert new emails in bulk; ones already stored (the same email
    // shows up under every contact on it) get their contact/deal link arrays merged.
    if (rows.length) await retryDb(db, async () => {
      const prev = await db.freshsalesConversation.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { id: true, contactFsIds: true, dealFsIds: true } })
      const have = new Map(prev.map(p => [p.id, p]))
      const fresh = rows.filter(r => !have.has(r.id))
      if (fresh.length) await db.freshsalesConversation.createMany({ data: fresh, skipDuplicates: true })
      await pool(rows.filter(r => have.has(r.id)), 5, async ({ id, ...r }) => {
        const p = have.get(id)!
        await db.freshsalesConversation.update({ where: { id }, data: { ...r, contactFsIds: uniq([...p.contactFsIds, ...r.contactFsIds]), dealFsIds: uniq([...p.dealFsIds, ...r.dealFsIds]) } })
      })
    })
    n += rows.length
    // Logged sales activities also appear in this feed; keep them in the activity table.
    for (const a of (data.sales_activities ?? []) as Json[]) await upsertActivity(db, 'SALES_ACTIVITY', a, { contactFsIds: [contactId] })
    const got = (data.conversations ?? []).length
    seen += got
    if (!hasMore(data.meta, page, got, seen)) break
  }
  return n
}

async function syncContactTimeline(db: PrismaClient, fs: FreshsalesClient, contactId: string) {
  let n = 0
  for (let page = 1, seen = 0; page <= 100; page++) {
    const data = await fs.get(`/api/contacts/${contactId}/activities?page=${page}&per_page=${PAGE}`)
    const list: Json[] = data?.activities ?? []
    const rows = list.map(ev => {
      const occurredAt = date(ev.created_at) ?? new Date(0)
      return {
        id: str(ev.composite_id) ?? `${ev.id}_${ev.action_type}`,
        actionType: String(ev.action_type ?? 'UNKNOWN'),
        targetType: str(ev.targetable_type),
        targetFsId: str(ev.targetable_id),
        actionableType: str(ev.actionable_type),
        actionableFsId: str(ev.actionable_id),
        groupName: str(ev.group?.name),
        userActivity: typeof ev.user_activity === 'boolean' ? ev.user_activity : null,
        actionData: json(ev.action_data),
        contactFsId: contactId,
        occurredAt,
        raw: json(ev),
      }
    })
    // Timeline events never change once written — bulk insert, skip the ones already stored
    if (rows.length) await retryDb(db, () => db.freshsalesTimelineEvent.createMany({ data: rows, skipDuplicates: true }))
    n += rows.length
    seen += list.length
    if (!hasMore(data?.meta, page, list.length, seen)) break
  }
  return n
}

export async function syncPerContact(db: PrismaClient, fs: FreshsalesClient, what: 'conversations' | 'timeline', opts: { limit?: number; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log
  const column = what === 'conversations' ? 'conversationsSyncedAt' : 'timelineSyncedAt'
  return track(db, what, async () => {
    const scope = await crawlScopeCount(db)
    const left = what === 'conversations' ? scope.conversationsLeft : scope.timelineLeft
    await state(db, what, { total: left })
    let contacts = 0, items = 0
    const queue = await retryDb(db, () => crawlQueue(db, column))
    for (let i = 0; i < queue.length; i += 50) {
      for (const id of queue.slice(i, i + 50)) {
        items += what === 'conversations' ? await syncContactConversations(db, fs, id) : await syncContactTimeline(db, fs, id)
        await retryDb(db, () => db.freshsalesContact.update({ where: { id }, data: { [column]: new Date() } }))
        contacts++
        if (opts.limit && contacts >= opts.limit) { await state(db, what, { processed: contacts }); return { contacts, items } }
      }
      await state(db, what, { processed: contacts })
      log(`  ${what} ${contacts}/${left} contacts, ${items} rows (${fs.requests} req)`)
    }
    await state(db, what, { processed: contacts })
    return { contacts, items }
  })
}
