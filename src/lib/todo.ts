import type { Prisma, PrismaClient } from '@prisma/client'
import { sendPushToUser } from '@/lib/push'
import { keyFromR2Url, deleteFromR2 } from '@/lib/r2'

export const TODO_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export const TODO_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const

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
  if ('sortOrder' in body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder as number
  return { data }
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
 * An assignee (not the owner) may only update progress: the task's status and files if they're
 * on the task itself, and the done ticks of sub tasks they're on (or under one they're on).
 * Everything else in the body is ignored rather than rejected, so a stale client can't
 * accidentally overwrite the owner's edits. Attachments can only be added, never removed.
 */
export function restrictToProgress(
  body: Record<string, unknown>,
  existing: { assigneeIds: string[]; subtasks: Prisma.JsonValue; attachments: Prisma.JsonValue },
  userId: string,
): Record<string, unknown> {
  const onTask = existing.assigneeIds.includes(userId)
  const out: Record<string, unknown> = {}
  if (onTask && 'status' in body) out.status = body.status

  if (onTask && Array.isArray(body.attachments)) {
    const have = attachmentsOf(existing.attachments)
    const urls = new Set(have.map(a => a.url))
    const added = (body.attachments as TodoAttachment[]).filter(a => a && typeof a.url === 'string' && !urls.has(a.url))
    out.attachments = [...have, ...added]
  }

  if (Array.isArray(body.subtasks)) {
    const wanted = new Map(walk(body.subtasks as TodoSubtask[]).map(s => [s.id, s.done === true]))
    const apply = (subs: TodoSubtask[], allowed: boolean): TodoSubtask[] => subs.map(s => {
      const mine = allowed || (s.assigneeIds ?? []).includes(userId)
      const done = mine && wanted.has(s.id) ? wanted.get(s.id)! : s.done
      return { ...s, done, children: apply(s.children ?? [], mine) }
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

/** In-app + push notification for everyone newly assigned to the task or one of its sub tasks. */
export async function notifyNewAssignees(
  db: PrismaClient,
  actor: { id: string; name?: string | null },
  before: { assigneeIds: string[]; subtasks: Prisma.JsonValue } | null,
  after: { title: string; assigneeIds: string[]; subtasks: Prisma.JsonValue },
) {
  const who = actor.name || 'Someone'
  const prevTask = new Set(before?.assigneeIds ?? [])
  const msgs: { userId: string; title: string; body: string }[] = []
  for (const uid of after.assigneeIds) {
    if (uid !== actor.id && !prevTask.has(uid)) msgs.push({ userId: uid, title: `Task assigned to you: ${after.title}`, body: `${who} assigned you a task.` })
  }
  for (const [uid, sub] of newSubAssignments(subtasksOf(before?.subtasks ?? []), subtasksOf(after.subtasks))) {
    if (uid !== actor.id) msgs.push({ userId: uid, title: `Sub task assigned to you: ${sub}`, body: `${who} assigned you a sub task in "${after.title}".` })
  }
  if (!msgs.length) return
  await db.notification.createMany({ data: msgs.map(m => ({ ...m, type: 'TASK_ASSIGNED' })) }).catch(() => {})
  await Promise.all(msgs.map(m => sendPushToUser(db, m.userId, { title: m.title, body: m.body, url: '/' }).catch(() => {})))
}
