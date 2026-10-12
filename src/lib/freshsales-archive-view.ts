// Read side of the Freshsales archive (the "Freshsales Archive" menu). The archive tables only
// hold Freshsales ids for stages/owners/etc, so everything here resolves them to names via
// FreshsalesLookup / FreshsalesUser before it reaches the UI.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { PrismaClient, Role } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getEffectiveModules } from '@/lib/role-permissions'
import { roleMatches } from '@/lib/role-utils'

export const ARCHIVE_MODULE = 'freshsales-archive'

/** Session + tenant db if the user's role has the module (Roles & Permissions aware), else a 401/403 response. */
export async function archiveAccess(): Promise<{ db: PrismaClient } | { error: NextResponse }> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user?.id || !role) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = (await getDb(session)) as unknown as PrismaClient
  if (!roleMatches(role, ['ADMIN', 'SUPER_ADMIN'])) {
    const modules = await getEffectiveModules(db, role as Role)
    if (!modules.includes(ARCHIVE_MODULE)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { db }
}

/** Tenants whose DB never got the archive tables pushed answer with an empty archive instead of a 500. */
export function isMissingTable(e: unknown) {
  return (e as { code?: string })?.code === 'P2021'
}

export interface Lookups {
  pipeline: Map<string, string>
  stage: Map<string, { name: string; type: string | null; pipelineFsId: string | null; position: number | null }>
  reason: Map<string, string>
  currency: Map<string, string>
  leadSource: Map<string, string>
  activityType: Map<string, string>
  activityOutcome: Map<string, string>
  owner: Map<string, string>
}

export async function loadLookups(db: PrismaClient): Promise<Lookups> {
  const [rows, users] = await Promise.all([
    db.freshsalesLookup.findMany(),
    db.freshsalesUser.findMany({ select: { id: true, name: true, email: true } }),
  ])
  const by = (kind: string) => new Map(rows.filter(r => r.kind === kind).map(r => [r.fsId, r.name]))
  return {
    pipeline: by('DEAL_PIPELINE'),
    stage: new Map(rows.filter(r => r.kind === 'DEAL_STAGE').map(r => [r.fsId, {
      name: r.name,
      type: ((r.extra as Record<string, unknown> | null)?.forecast_type as string | undefined) ?? null,
      pipelineFsId: r.parentFsId,
      position: r.position,
    }])),
    reason: by('DEAL_REASON'),
    currency: new Map(rows.filter(r => r.kind === 'CURRENCY').map(r => [r.fsId, String((r.extra as Record<string, unknown> | null)?.currency_code ?? r.name)])),
    leadSource: by('LEAD_SOURCE'),
    activityType: by('ACTIVITY_TYPE'),
    activityOutcome: by('ACTIVITY_OUTCOME'),
    owner: new Map(users.map(u => [u.id, u.name ?? u.email ?? u.id])),
  }
}

/** Open / Won / Lost from the stage's Freshsales forecast type. */
export function stageStatus(type: string | null | undefined): 'OPEN' | 'WON' | 'LOST' {
  if (type === 'Closed Won') return 'WON'
  if (type === 'Closed Lost') return 'LOST'
  return 'OPEN'
}

export type TimelineItem =
  | { kind: 'email'; id: string; at: string | null; direction: string | null; subject: string | null; preview: string | null; from: string | null; to: string[]; messageCount: number | null; attachments: { fileName: string; size: number | null }[]; dealFsIds: string[] }
  | { kind: 'activity'; id: string; at: string | null; activityKind: string; title: string | null; body: string | null; type: string | null; outcome: string | null; status: string | null; owner: string | null }
  | { kind: 'event'; id: string; at: string; actionType: string; label: string; detail: string | null; targetType: string | null }

type Participant = { field?: string; email?: string; name?: string | null }

// Human label for a timeline event — the raw action types are Freshsales constants.
const EVENT_LABEL: Record<string, string> = {
  CREATE: 'Created', STAGE_CHANGE: 'Stage changed', OWNER_CHANGE: 'Owner changed',
  CONTACT_STATUS_CHANGED: 'Status changed', CONTACT_SUBSCRIBED: 'Subscribed', CONTACT_UNSUBSCRIBED: 'Unsubscribed',
  CONTACT_TERRITORY_UPDATED: 'Territory updated', EMAIL_SENT: 'Email sent', EMAIL_REPLIED: 'Email replied',
  FM_PAGE_VIEWS: 'Website visit', FM_ENTERED_JOURNEY: 'Entered journey', FM_DELIVERED_JOURNEY_EMAIL: 'Journey email delivered',
}

/**
 * Merged, newest-first history for a set of contacts and/or deals: emails, activities/notes
 * and timeline events. Email-type timeline events are skipped — the email rows themselves
 * already show those.
 */
export async function buildTimeline(db: PrismaClient, lk: Lookups, opts: { contactFsIds: string[]; dealFsIds: string[]; limit?: number }): Promise<TimelineItem[]> {
  const limit = opts.limit ?? 400
  const { contactFsIds, dealFsIds } = opts
  const linkWhere = [
    ...(contactFsIds.length ? [{ contactFsIds: { hasSome: contactFsIds } }] : []),
    ...(dealFsIds.length ? [{ dealFsIds: { hasSome: dealFsIds } }] : []),
  ]
  if (!linkWhere.length) return []

  const [emails, activities, events] = await Promise.all([
    db.freshsalesConversation.findMany({
      where: { OR: linkWhere },
      select: { id: true, occurredAt: true, direction: true, subject: true, bodyText: true, participants: true, messageCount: true, attachments: true, dealFsIds: true },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    }),
    db.freshsalesActivity.findMany({
      where: { OR: linkWhere },
      select: { id: true, kind: true, title: true, body: true, typeFsId: true, outcomeFsId: true, status: true, ownerFsId: true, startAt: true, dueAt: true, fsCreatedAt: true },
      orderBy: { fsCreatedAt: 'desc' },
      take: limit,
    }),
    contactFsIds.length || dealFsIds.length
      ? db.freshsalesTimelineEvent.findMany({
          where: {
            OR: [
              ...(contactFsIds.length ? [{ contactFsId: { in: contactFsIds } }] : []),
              ...(dealFsIds.length ? [{ targetType: 'Deal', targetFsId: { in: dealFsIds } }] : []),
            ],
            actionType: { notIn: ['EMAIL_SENT', 'EMAIL_REPLIED'] },
          },
          select: { id: true, occurredAt: true, actionType: true, actionData: true, targetType: true },
          orderBy: { occurredAt: 'desc' },
          take: limit,
        })
      : Promise.resolve([]),
  ])

  const items: TimelineItem[] = [
    ...emails.map(e => {
      const parts = (e.participants as Participant[] | null) ?? []
      const from = parts.find(p => p.field === 'from')
      return {
        kind: 'email' as const,
        id: e.id,
        at: e.occurredAt?.toISOString() ?? null,
        direction: e.direction,
        subject: e.subject,
        preview: e.bodyText,
        from: from ? (from.name ? `${from.name} <${from.email}>` : from.email ?? null) : null,
        to: parts.filter(p => p.field !== 'from').map(p => p.email ?? '').filter(Boolean),
        messageCount: e.messageCount,
        attachments: ((e.attachments as { fileName?: string; size?: number }[] | null) ?? []).map(a => ({ fileName: a.fileName ?? 'file', size: a.size ?? null })),
        dealFsIds: e.dealFsIds,
      }
    }),
    ...activities.map(a => ({
      kind: 'activity' as const,
      id: a.id,
      at: (a.startAt ?? a.dueAt ?? a.fsCreatedAt)?.toISOString() ?? null,
      activityKind: a.kind,
      title: a.title,
      body: a.body,
      type: a.typeFsId ? lk.activityType.get(a.typeFsId) ?? null : null,
      outcome: a.outcomeFsId ? lk.activityOutcome.get(a.outcomeFsId) ?? null : null,
      status: a.status,
      owner: a.ownerFsId ? lk.owner.get(a.ownerFsId) ?? null : null,
    })),
    ...events.map(ev => ({
      kind: 'event' as const,
      id: ev.id,
      at: ev.occurredAt.toISOString(),
      actionType: ev.actionType,
      label: EVENT_LABEL[ev.actionType] ?? ev.actionType.replace(/_/g, ' ').toLowerCase(),
      detail: eventDetail(ev.actionData),
      targetType: ev.targetType,
    })),
  ]
  return items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, limit)
}

// Best-effort one-liner from a timeline event's action_data (shape varies per action type).
function eventDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.stage_name === 'string' && typeof d.pipeline_name === 'string') return `${d.pipeline_name} → ${d.stage_name}`
  if (typeof d.status_name === 'string') return d.status_name
  if (Array.isArray(d.subscription_types_added) && d.subscription_types_added.length) return d.subscription_types_added.join(', ')
  const pick = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>).name ?? (v as Record<string, unknown>).display_name : v)
  if ('from' in d || 'to' in d) {
    const from = pick(d.from), to = pick(d.to)
    if (from || to) return `${from ?? '—'} → ${to ?? '—'}`
  }
  for (const k of ['name', 'subject', 'title', 'status', 'url', 'page_title']) {
    if (typeof d[k] === 'string' && d[k]) return String(d[k])
  }
  return null
}
