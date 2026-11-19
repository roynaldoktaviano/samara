import type { PrismaClient } from '@prisma/client'

// Where a lead first came in from — one value per lead, stored on Lead.entrySource and used for
// the source tabs + the small channel icon on the Leads page. Freshsales itself is NOT a source:
// a lead imported from Freshsales is classified by what Freshsales knows about how the contact
// arrived (its web form fields, Meta/Google lead-form tag, Freshchat channel, incoming email).
export const LEAD_ENTRY_SOURCES = [
  'WEBSITE_FORM', 'INSTANT_FORM', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'LIVE_CHAT', 'EMAIL', 'PHONE', 'AGENT_OTA', 'OTHER',
] as const
// PHONE and AGENT_OTA can't be detected — only sales set them (Lead.entrySourceManual).
export const MANUAL_ONLY_ENTRY_SOURCES: readonly LeadEntrySource[] = ['PHONE', 'AGENT_OTA']
export type LeadEntrySource = typeof LEAD_ENTRY_SOURCES[number]

export const LEAD_ENTRY_SOURCE_LABEL: Record<LeadEntrySource, string> = {
  WEBSITE_FORM: 'Website Form',
  INSTANT_FORM: 'Meta Instant Form',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  LIVE_CHAT: 'Website Chat',
  EMAIL: 'Email',
  PHONE: 'Phone',
  AGENT_OTA: 'Agent / OTA',
  OTHER: 'Other / Manual',
}

export const isLeadEntrySource = (v: unknown): v is LeadEntrySource =>
  typeof v === 'string' && (LEAD_ENTRY_SOURCES as readonly string[]).includes(v)

// Precedence (first match wins):
//  0. The channel sales picked by hand (Lead.entrySourceManual) — e.g. Phone, Agent/OTA
//  1. Lead created by the ERP's own chat webhooks (Lead.source "WHATSAPP_SAMARA" etc.)
//  2. The ERP's own form inquiries — Meta Lead Ad → Instant form, CF7 → Website form
//  3. Freshsales tags — lead-form integration (cf_form_source set, but no website landing
//     page / utm fields) → Instant form; web-form fields (landing page, utm, web form id) → Website form
//  4. Chat — the earliest chat thread: ERP WhatsApp / IG / Messenger, Freshchat conversation
//     (WhatsApp / IG / Messenger / website widget), or a Freshsales "conversation created" event
//  5. Website — Freshsales tracked the visitor's first web source (form sent via the site)
//  6. Email — an incoming email from the contact in Freshsales
//  7. Other — added by hand, newsletter, etc.
// A "FRESHSALES_DEAL" card (a contact's 2nd+ deal) is classified through the deal's contact.
const CLASSIFY_SQL = `
WITH base AS (
  SELECT l.id, l.source, l."entrySource" AS cur, l."entrySourceManual" AS manual,
         COALESCE(l."freshsalesContactId", d."contactFsIds"[1]) AS cid
  FROM "Lead" l
  LEFT JOIN "FreshsalesDeal" d ON d.id = l."freshsalesDealId" AND l."freshsalesContactId" IS NULL
  WHERE __SCOPE__
), inq AS (
  SELECT i."leadId" AS id,
         bool_or(i.source = 'META_LEAD_AD') AS meta,
         bool_or(i.source = 'CF7') AS cf7,
         bool_or(i."utmSource" IS NOT NULL OR i."lastSource" IS NOT NULL) AS utm
  FROM "Inquiry" i JOIN base b ON b.id = i."leadId"
  GROUP BY i."leadId"
), chats AS (
  SELECT DISTINCT ON (x.id) x.id, x.ch FROM (
    SELECT w."leadId" AS id, 'WHATSAPP' AS ch, w."createdAt" AS t
      FROM "WhatsappConversation" w JOIN base b ON b.id = w."leadId"
    UNION ALL
    SELECT g."leadId", CASE WHEN g.platform::text = 'MESSENGER' THEN 'MESSENGER' ELSE 'INSTAGRAM' END, g."createdAt"
      FROM "InstagramConversation" g JOIN base b ON b.id = g."leadId"
    UNION ALL
    SELECT b.id, CASE f."channelSource" WHEN 'WHATSAPP' THEN 'WHATSAPP' WHEN 'INSTA' THEN 'INSTAGRAM' WHEN 'FB_NATIVE' THEN 'MESSENGER' WHEN 'FRESHCHAT' THEN 'LIVE_CHAT' END, f."fcCreatedAt"
      FROM "FreshchatConversation" f JOIN base b ON b.id = f."leadId"
    UNION ALL
    SELECT b.id, CASE f."channelSource" WHEN 'WHATSAPP' THEN 'WHATSAPP' WHEN 'INSTA' THEN 'INSTAGRAM' WHEN 'FB_NATIVE' THEN 'MESSENGER' WHEN 'FRESHCHAT' THEN 'LIVE_CHAT' END, f."fcCreatedAt"
      FROM "FreshchatConversation" f JOIN base b ON b.cid = f."contactFsId"
    UNION ALL
    SELECT b.id, CASE split_part(e."actionData"->>'subject', '-', 1) WHEN 'WHATSAPP' THEN 'WHATSAPP' WHEN 'INSTA' THEN 'INSTAGRAM' WHEN 'FB_NATIVE' THEN 'MESSENGER' WHEN 'WEBCHAT' THEN 'LIVE_CHAT' END, e."occurredAt"
      FROM "FreshsalesTimelineEvent" e JOIN base b ON b.cid = e."contactFsId"
      WHERE e."actionType" = 'CONVERSATION_CREATED'
  ) x WHERE x.ch IS NOT NULL
  ORDER BY x.id, x.t ASC NULLS LAST
), mail AS (
  SELECT DISTINCT u.cid FROM "FreshsalesConversation" m, unnest(m."contactFsIds") AS u(cid)
  WHERE m.direction = 'incoming'
), sig AS (
  SELECT b.id, b.source, b.cur, b.cid, b.manual,
         c.raw->'custom_field'->>'cf_form_source' AS form_src,
         c.raw->'custom_field'->>'cf_door_opener' AS door,
         c.raw->'custom_field'->>'cf_utm_source' AS cf_utm,
         c.raw->>'first_source' AS first_src,
         c.raw->>'first_seen_chat' AS first_chat,
         (jsonb_typeof(c.raw->'web_form_ids') = 'array' AND jsonb_array_length(c.raw->'web_form_ids') > 0) AS web_form,
         coalesce(inq.meta, false) AS meta, coalesce(inq.cf7, false) AS cf7, coalesce(inq.utm, false) AS utm,
         chats.ch AS chat, (mail.cid IS NOT NULL) AS email_in
  FROM base b
  LEFT JOIN "FreshsalesContact" c ON c.id = b.cid
  LEFT JOIN inq ON inq.id = b.id
  LEFT JOIN chats ON chats.id = b.id
  LEFT JOIN mail ON mail.cid = b.cid
), cls AS (
  SELECT s.id, s.cur,
    CASE
      WHEN s.manual IS NOT NULL THEN s.manual
      WHEN split_part(s.source, '_', 1) IN ('WHATSAPP', 'INSTAGRAM', 'MESSENGER') THEN split_part(s.source, '_', 1)
      -- The ERP's own form inquiries are direct evidence, so they beat Freshsales' tags.
      WHEN s.meta THEN 'INSTANT_FORM'
      WHEN s.cf7 THEN 'WEBSITE_FORM'
      WHEN s.form_src IS NOT NULL AND lower(s.form_src) NOT IN ('freshchat', 'newsletter', 'test') AND s.door IS NULL AND s.cf_utm IS NULL
        THEN 'INSTANT_FORM'
      WHEN s.door IS NOT NULL OR s.cf_utm IS NOT NULL OR coalesce(s.web_form, false) THEN 'WEBSITE_FORM'
      WHEN s.chat IS NOT NULL THEN s.chat
      -- Freshchat chat whose channel isn't known yet — WhatsApp is by far the most common one.
      WHEN s.first_chat IS NOT NULL OR lower(coalesce(s.form_src, '')) = 'freshchat' THEN 'WHATSAPP'
      WHEN s.first_src IS NOT NULL OR s.utm THEN 'WEBSITE_FORM'
      WHEN s.email_in THEN 'EMAIL'
      ELSE 'OTHER'
    END AS src
  FROM sig s
)
UPDATE "Lead" l SET "entrySource" = cls.src
FROM cls
WHERE l.id = cls.id AND cls.cur IS DISTINCT FROM cls.src
`

type Db = Pick<PrismaClient, '$executeRawUnsafe'>

/**
 * Recompute Lead.entrySource. `onlyMissing` touches just leads that don't have one yet (new
 * leads — cheap enough to run on every Leads page load); otherwise every live lead is
 * re-evaluated (chats / Freshchat history / Freshsales details can arrive after the lead) and
 * only changed rows are written. Returns the number of leads updated.
 */
export async function refreshLeadEntrySources(db: Db, opts: { onlyMissing?: boolean } = {}): Promise<number> {
  const scope = opts.onlyMissing ? `l."deletedAt" IS NULL AND l."entrySource" IS NULL` : `l."deletedAt" IS NULL`
  return db.$executeRawUnsafe(CLASSIFY_SQL.replace('__SCOPE__', scope))
}
