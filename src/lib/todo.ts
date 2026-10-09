import type { Prisma, PrismaClient } from '@prisma/client'
import { sendPushToUser } from '@/lib/push'
import { keyFromR2Url, deleteFromR2 } from '@/lib/r2'
import { queueTaskEmail } from '@/lib/task-email'

export const TODO_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export const TODO_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const
export const TODO_RECURRENCES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const

export interface TodoAttachment { url: string; name: string; size: number; contentType: string; uploadedAt: string }

export interface TodoSubtask {
  id: string; title: string; done: boolean; notes: string | null; type: string | null
  startDate: string | null; dueDate: string | null; priority: string | null
  children: TodoSubtask[]
  assigneeIds: string[]
}
// Sub tasks nest up to 3 levels below the task; the cap counts every node in the tree.
export const TODO_SUBTASK_MAX_DEPTH = 3
export const TODO_SUBTASK_MAX_COUNT = 300

export const TODO_ASSIGNEE_MAX = 20

export const TODO_ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024 // 25MB per file
export const TODO_ATTACHMENT_MAX_COUNT = 20
export const todoUploadPrefix = (userId: string) => `my-works/${userId}/`

// Only accept files that are already on the task or live in the caller's own R2 folder, so a
// task can't be pointed at someone else's upload (or an arbitrary external URL). Files already
// on the task may sit in an assignee's folder, since assignees can attach files too.
function parseAttachments(v: unknown, userId: string, existingUrls: Set<string>): TodoAttachment[] | null {
  if (!Array.isArray(v) || v.length > TODO_ATTACHMENT_MAX_COUNT) return null
  const out: TodoAttachment[] = []
  for (const a of v) {
    if (!a || typeof a !== 'object') return null
    const { url, name, size, contentType, uploadedAt } = a as Record<string, unknown>
    if (typeof url !== 'string') return null
    if (!existingUrls.has(url) && !keyFromR2Url(url)?.startsWith(todoUploadPrefix(userId))) return null
    out.push({
      url,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 255) : 'file',
      size: typeof size === 'number' ? size : 0,
      contentType: typeof contentType === 'string' ? contentType : 'application/octet-stream',
      uploadedAt: typeof uploadedAt === 'string' ? uploadedAt : new Date().toISOString(),
    })
  }
  return out
}

function parseIds(v: unknown): string[] | null {
  if (v == null) return []
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string' && x.length <= 64)) return null
  return [...new Set(v as string[])].slice(0, TODO_ASSIGNEE_MAX)
}

function parseSubtasks(v: unknown, depth = 1, seen = { n: 0 }): TodoSubtask[] | null {
  if (v == null && depth > 1) return []
  if (!Array.isArray(v)) return null
  seen.n += v.length
  if (seen.n > TODO_SUBTASK_MAX_COUNT) return null
  const out: TodoSubtask[] = []
  for (const st of v) {
    if (!st || typeof st !== 'object') return null
    const { id, title, done, notes, type, startDate, dueDate, priority, children, assigneeIds } = st as Record<string, unknown>
    const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    const start = day(startDate), due = day(dueDate)
    if (start && due && due < start) return null
    if (typeof title !== 'string' || !title.trim()) continue // blank rows are dropped, not an error
    // Anything nested deeper than the max depth is dropped.
    const kids = depth < TODO_SUBTASK_MAX_DEPTH ? parseSubtasks(children, depth + 1, seen) : []
    if (!kids) return null
    const assignees = parseIds(assigneeIds)
    if (!assignees) return null
    out.push({
      id: typeof id === 'string' && id ? id.slice(0, 64) : Math.random().toString(36).slice(2, 12),
      title: title.trim().slice(0, 500),
      done: done === true,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 5000) : null,
      type: typeof type === 'string' && type.trim() ? type.trim().slice(0, 100) : null,
      // Plain YYYY-MM-DD, same convention as the task dates on the client.
      startDate: start,
      dueDate: due,
      priority: TODO_PRIORITIES.includes(priority as never) ? priority as string : null,
      children: kids,
      assigneeIds: assignees,
    })
  }
  return out
}

export const TODO_COMMENT_MAX_FILES = 10
/** Files on a new comment — must be fresh uploads in the author's own folder. */
export function parseCommentAttachments(v: unknown, userId: string): TodoAttachment[] | null {
  if (v == null) return []
  if (Array.isArray(v) && v.length > TODO_COMMENT_MAX_FILES) return null
  return parseAttachments(v, userId, new Set())
}

export function attachmentsOf(v: Prisma.JsonValue): TodoAttachment[] {
  return Array.isArray(v) ? (v as unknown as TodoAttachment[]) : []
}

/** Best-effort cleanup of R2 objects no longer referenced by a task. */
export async function deleteTodoFiles(files: TodoAttachment[]) {
  await Promise.all(files.map(f => {
    const key = keyFromR2Url(f.url)
    return key ? deleteFromR2(key) : Promise.resolve()
  }))
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

function parseDate(v: unknown): Date | null | 'invalid' {
  if (!v) return null
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? 'invalid' : d
}

/**
 * Validates the editable fields of a My Works task out of a request body. Only keys present
 * in `body` are returned, so the same parser serves both create and partial PATCH. Setting
 * `status` also keeps the legacy `completed`/`completedAt` pair in sync.
 */
export function parseTodoInput(body: Record<string, unknown>, userId: string, existing?: { completedAt: Date | null; attachments: Prisma.JsonValue }):
  { error: string } | { data: Prisma.TodoUncheckedUpdateInput } {
  const data: Prisma.TodoUncheckedUpdateInput = {}
  if ('title' in body) {
    const title = str(body.title)
    if (!title) return { error: 'Title is required' }
    data.title = title
  }
  if ('notes' in body) data.notes = str(body.notes)
  if ('type' in body) data.type = str(body.type)
  for (const key of ['startDate', 'dueDate'] as const) {
    if (!(key in body)) continue
    const d = parseDate(body[key])
    if (d === 'invalid') return { error: `Invalid ${key === 'startDate' ? 'start' : 'due'} date` }
    data[key] = d
  }
  if (data.startDate instanceof Date && data.dueDate instanceof Date && data.dueDate < data.startDate) {
    return { error: 'End date must be on or after the start date' }
  }
  if ('priority' in body && TODO_PRIORITIES.includes(body.priority as never)) data.priority = body.priority as never
  if ('status' in body && TODO_STATUSES.includes(body.status as never)) {
    data.status = body.status as never
    const done = body.status === 'DONE'
    data.completed = done
    data.completedAt = done ? (existing?.completedAt ?? new Date()) : null
  }
  if ('attachments' in body) {
    const files = parseAttachments(body.attachments, userId, new Set(attachmentsOf(existing?.attachments ?? []).map(a => a.url)))
    if (!files) return { error: 'Invalid attachments' }
    data.attachments = files as unknown as Prisma.InputJsonValue
  }
  if ('subtasks' in body) {
    const subtasks = parseSubtasks(body.subtasks)
    if (!subtasks) return { error: 'Invalid sub tasks' }
    data.subtasks = subtasks as unknown as Prisma.InputJsonValue
    data.subAssigneeIds = collectSubAssignees(subtasks)
  }
  if ('assigneeIds' in body) {
    const ids = parseIds(body.assigneeIds)
    if (!ids) return { error: 'Invalid assignees' }
    data.assigneeIds = ids
  }
  if ('recurrence' in body) {
    if (body.recurrence != null && !TODO_RECURRENCES.includes(body.recurrence as never)) return { error: 'Invalid repeat' }
    data.recurrence = (body.recurrence as string | null) ?? null
  }
  if ('sortOrder' in body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder as number
  return { data }
}

// ── Recurring tasks ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** `n` weeks/months/years after `d` (a UTC-midnight date), clamped to the month's last day. */
function addPeriod(d: Date, recurrence: string, n: number): Date {
  if (recurrence === 'WEEKLY') return new Date(d.getTime() + n * 7 * DAY_MS)
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + (recurrence === 'YEARLY' ? n * 12 : n)
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)))
}

// Task dates are plain days; "today" is the business's day (Indonesia, WIB UTC+7, no DST).
const businessToday = () => new Date(new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T00:00:00Z')

/**
 * Restarts a task's repeat schedule from its current dates — call whenever recurrence or the
 * dates change. Adds the recurrence* fields to `data`, or an error if a repeat has no date.
 */
export function applyRecurrenceSchedule(
  data: Prisma.TodoUncheckedUpdateInput,
  existing?: { recurrence: string | null; startDate: Date | null; dueDate: Date | null },
): string | null {
  if (!('recurrence' in data || 'startDate' in data || 'dueDate' in data)) return null
  const recurrence = 'recurrence' in data ? data.recurrence as string | null : existing?.recurrence ?? null
  const start = 'startDate' in data ? data.startDate as Date | null : existing?.startDate ?? null
  const due = 'dueDate' in data ? data.dueDate as Date | null : existing?.dueDate ?? null
  const anchor = start ?? due
  if (!recurrence) {
    if ('recurrence' in data) Object.assign(data, { recurrenceAnchor: null, recurrenceIndex: 0, recurrenceNextAt: null })
    return null
  }
  if (!anchor) return 'A repeating task needs a start or end date'
  Object.assign(data, { recurrenceAnchor: anchor, recurrenceIndex: 0, recurrenceNextAt: addPeriod(anchor, recurrence, 1) })
  return null
}

const shiftDay = (k: string | null, days: number) => k ? new Date(Date.parse(k + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10) : null
const freshSubtasks = (subs: TodoSubtask[], days: number): TodoSubtask[] => subs.map(s => ({
  ...s, done: false, startDate: shiftDay(s.startDate, days), dueDate: shiftDay(s.dueDate, days), children: freshSubtasks(s.children ?? [], days),
}))

/**
 * Creates the next copy of every repeating task (matching `where`) whose next date has
 * arrived: same title/notes/type/priority/assignees/sub tasks, status To-do, sub tasks
 * unticked, all dates moved to the new occurrence. Files and comments stay on the old task.
 * If several periods were missed only the latest one is created. The recurrence then moves
 * onto the copy, so the series always continues from its newest task. Runs from the hourly
 * tick (src/instrumentation-node.ts) and on every board load; the conditional claim below
 * makes concurrent runs safe.
 */
export async function spawnRecurringTodos(db: PrismaClient, tenantId: string | undefined, where: Prisma.TodoWhereInput = {}): Promise<number> {
  const today = businessToday()
  const due = await db.todo.findMany({
    where: { AND: [where, { recurrence: { not: null }, recurrenceNextAt: { lte: today } }] },
    include: { user: { select: { id: true, name: true } } },
  })
  let spawned = 0
  for (const t of due) {
    const rec = t.recurrence!, anchor = t.recurrenceAnchor ?? t.startDate ?? t.dueDate
    if (!anchor) continue
    let n = t.recurrenceIndex + 1
    while (n < t.recurrenceIndex + 1000 && addPeriod(anchor, rec, n + 1) <= today) n++
    const occurrence = addPeriod(anchor, rec, n)
    const base = t.startDate ?? t.dueDate ?? anchor
    const days = Math.round((occurrence.getTime() - base.getTime()) / DAY_MS)
    const shift = (d: Date | null) => d ? new Date(d.getTime() + days * DAY_MS) : null

    const copy = await db.$transaction(async tx => {
      // Claim the series — only the run that flips recurrenceNextAt gets to create the copy.
      const claimed = await tx.todo.updateMany({
        where: { id: t.id, recurrenceNextAt: t.recurrenceNextAt },
        data: { recurrence: null, recurrenceNextAt: null },
      })
      if (!claimed.count) return null
      const first = await tx.todo.findFirst({ where: { userId: t.userId, status: 'TODO' }, orderBy: { sortOrder: 'asc' }, select: { sortOrder: true } })
      return tx.todo.create({
        data: {
          userId: t.userId, title: t.title, notes: t.notes, type: t.type, priority: t.priority,
          startDate: shift(t.startDate), dueDate: shift(t.dueDate),
          subtasks: freshSubtasks(subtasksOf(t.subtasks), days) as unknown as Prisma.InputJsonValue,
          assigneeIds: t.assigneeIds, subAssigneeIds: t.subAssigneeIds,
          sortOrder: (first?.sortOrder ?? 1) - 1,
          recurrence: rec, recurrenceAnchor: anchor, recurrenceIndex: n, recurrenceNextAt: addPeriod(anchor, rec, n + 1),
        },
      })
    })
    if (!copy) continue
    spawned++
    await notifyNewAssignees(db, { id: t.userId, name: t.user.name, tenantId }, null, copy).catch(() => {})
  }
  return spawned
}

// ── Assignees ────────────────────────────────────────────────────────────────

export function subtasksOf(v: Prisma.JsonValue): TodoSubtask[] {
  return Array.isArray(v) ? (v as unknown as TodoSubtask[]) : []
}

const walk = (subs: TodoSubtask[]): TodoSubtask[] => subs.flatMap(s => [s, ...walk(s.children ?? [])])

export function collectSubAssignees(subs: TodoSubtask[]): string[] {
  return [...new Set(walk(subs).flatMap(s => s.assigneeIds ?? []))]
}

/** Every user id referenced as an assignee in a parsed update (task + sub tasks). */
export function referencedAssignees(data: Prisma.TodoUncheckedUpdateInput): string[] {
  const ids = new Set<string>()
  if (Array.isArray(data.assigneeIds)) data.assigneeIds.forEach(i => ids.add(i))
  if (Array.isArray(data.subAssigneeIds)) data.subAssigneeIds.forEach(i => ids.add(i))
  return [...ids]
}

/**
 * An assignee (not the owner) may only update progress: the task's status, estimation dates and
 * files if they're on the task itself, and the done ticks + dates of sub tasks they're on (or
 * under one they're on). Everything else in the body is ignored rather than rejected, so a
 * stale client can't accidentally overwrite the owner's edits. Attachments can only be added,
 * never removed. Date changes are logged to the task's Activity — see logEstimationChanges.
 */
export function restrictToProgress(
  body: Record<string, unknown>,
  existing: { assigneeIds: string[]; subtasks: Prisma.JsonValue; attachments: Prisma.JsonValue },
  userId: string,
): Record<string, unknown> {
  const onTask = existing.assigneeIds.includes(userId)
  const out: Record<string, unknown> = {}
  if (onTask && 'status' in body) out.status = body.status
  if (onTask && 'startDate' in body) out.startDate = body.startDate
  if (onTask && 'dueDate' in body) out.dueDate = body.dueDate

  if (onTask && Array.isArray(body.attachments)) {
    const have = attachmentsOf(existing.attachments)
    const urls = new Set(have.map(a => a.url))
    const added = (body.attachments as TodoAttachment[]).filter(a => a && typeof a.url === 'string' && !urls.has(a.url))
    out.attachments = [...have, ...added]
  }

  if (Array.isArray(body.subtasks)) {
    const wanted = new Map(walk(body.subtasks as TodoSubtask[]).map(s => [s.id, s]))
    const apply = (subs: TodoSubtask[], allowed: boolean): TodoSubtask[] => subs.map(s => {
      const mine = allowed || (s.assigneeIds ?? []).includes(userId)
      const w = mine ? wanted.get(s.id) : undefined
      const progress = w ? { done: w.done === true, startDate: w.startDate ?? null, dueDate: w.dueDate ?? null } : {}
      return { ...s, ...progress, children: apply(s.children ?? [], mine) }
    })
    out.subtasks = apply(subtasksOf(existing.subtasks), onTask)
  }
  return out
}

/** Assigned sub tasks the user wasn't on before, as [userId, subtask title] pairs. */
function newSubAssignments(before: TodoSubtask[], after: TodoSubtask[]): [string, string][] {
  const prev = new Map(walk(before).map(s => [s.id, new Set(s.assigneeIds ?? [])]))
  const out: [string, string][] = []
  for (const s of walk(after)) for (const uid of s.assigneeIds ?? []) if (!prev.get(s.id)?.has(uid)) out.push([uid, s.title])
  return out
}

type Actor = { id: string; name?: string | null; tenantId?: string }

/** In-app + push notification (and a digest email, see task-email.ts) for everyone newly
 * assigned to the task or one of its sub tasks. */
export async function notifyNewAssignees(
  db: PrismaClient,
  actor: Actor,
  before: { assigneeIds: string[]; subtasks: Prisma.JsonValue } | null,
  after: { id: string; title: string; assigneeIds: string[]; subtasks: Prisma.JsonValue },
) {
  const who = actor.name || 'Someone'
  const prevTask = new Set(before?.assigneeIds ?? [])
  const msgs: { userId: string; title: string; body: string }[] = []
  for (const uid of after.assigneeIds) {
    if (uid !== actor.id && !prevTask.has(uid)) {
      msgs.push({ userId: uid, title: `Task assigned to you: ${after.title}`, body: `${who} assigned you a task.` })
      queueTaskEmail(db, actor.tenantId, actor, uid, { kind: 'assigned', todoId: after.id, taskTitle: after.title })
    }
  }
  for (const [uid, sub] of newSubAssignments(subtasksOf(before?.subtasks ?? []), subtasksOf(after.subtasks))) {
    if (uid !== actor.id) {
      msgs.push({ userId: uid, title: `Sub task assigned to you: ${sub}`, body: `${who} assigned you a sub task in "${after.title}".` })
      queueTaskEmail(db, actor.tenantId, actor, uid, { kind: 'assigned', todoId: after.id, taskTitle: after.title, subtask: sub })
    }
  }
  if (!msgs.length) return
  await db.notification.createMany({ data: msgs.map(m => ({ ...m, type: 'TASK_ASSIGNED' })) }).catch(() => {})
  await Promise.all(msgs.map(m => sendPushToUser(db, m.userId, { title: m.title, body: m.body, url: '/' }).catch(() => {})))
}

/** An assignee moved the task to DONE — tell the owner (the one who assigned it). */
export async function notifyTaskCompleted(db: PrismaClient, actor: Actor, todo: { id: string; title: string; userId: string }) {
  if (todo.userId === actor.id) return
  const title = `Task completed: ${todo.title}`
  const body = `${actor.name || 'Someone'} marked your task as done.`
  await db.notification.create({ data: { userId: todo.userId, type: 'TASK_COMPLETED', title, body } }).catch(() => {})
  await sendPushToUser(db, todo.userId, { title, body, url: '/' }).catch(() => {})
  queueTaskEmail(db, actor.tenantId, actor, todo.userId, { kind: 'completed', todoId: todo.id, taskTitle: todo.title })
}

// ── Activity ─────────────────────────────────────────────────────────────────

const dayOf = (d: Date | string | null) => d ? (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null
const fmtLogDay = (k: string | null) => k
  ? new Date(k + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : 'none'
const fmtLogRange = (start: string | null, due: string | null) => `${fmtLogDay(start)} – ${fmtLogDay(due)}`

/**
 * An assignee changed estimation dates: write one ESTIMATION activity entry per changed task /
 * sub task and ring the owner's bell once for the whole save.
 */
export async function logEstimationChanges(
  db: PrismaClient,
  actor: Actor,
  before: { startDate: Date | null; dueDate: Date | null; subtasks: Prisma.JsonValue },
  after: { id: string; userId: string; title: string; startDate: Date | null; dueDate: Date | null; subtasks: Prisma.JsonValue },
) {
  const entries: string[] = []
  const [s0, d0, s1, d1] = [dayOf(before.startDate), dayOf(before.dueDate), dayOf(after.startDate), dayOf(after.dueDate)]
  if (s0 !== s1 || d0 !== d1) entries.push(`changed the estimation: ${fmtLogRange(s0, d0)} → ${fmtLogRange(s1, d1)}`)
  const prev = new Map(walk(subtasksOf(before.subtasks)).map(s => [s.id, s]))
  for (const s of walk(subtasksOf(after.subtasks))) {
    const p = prev.get(s.id)
    if (p && (p.startDate !== s.startDate || p.dueDate !== s.dueDate)) {
      entries.push(`changed the estimation of sub task "${s.title}": ${fmtLogRange(p.startDate, p.dueDate)} → ${fmtLogRange(s.startDate, s.dueDate)}`)
    }
  }
  if (!entries.length) return
  await db.todoActivity.createMany({ data: entries.map(body => ({ todoId: after.id, userId: actor.id, kind: 'ESTIMATION', body })) })
  if (after.userId !== actor.id) {
    await db.notification.create({
      data: {
        userId: after.userId, type: 'TASK_ESTIMATION_CHANGED',
        title: `Estimation changed: ${after.title}`,
        body: `${actor.name || 'Someone'} ${entries.length === 1 ? entries[0] : `changed ${entries.length} estimations`}.`,
      },
    }).catch(() => {})
  }
}

/** Owner + everyone assigned to the task or one of its sub tasks. */
export const taskParticipants = (t: { userId: string; assigneeIds: string[]; subAssigneeIds: string[] }) =>
  [...new Set([t.userId, ...t.assigneeIds, ...t.subAssigneeIds])]
