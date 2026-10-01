import type { Prisma } from '@prisma/client'
import { keyFromR2Url, deleteFromR2 } from '@/lib/r2'

export const TODO_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export const TODO_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const

export interface TodoAttachment { url: string; name: string; size: number; contentType: string; uploadedAt: string }

export interface TodoSubtask { id: string; title: string; done: boolean; dueDate: string | null; priority: string | null }
export const TODO_SUBTASK_MAX_COUNT = 100

export const TODO_ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024 // 25MB per file
export const TODO_ATTACHMENT_MAX_COUNT = 20
export const todoUploadPrefix = (userId: string) => `my-works/${userId}/`

// Only accept files that live in the caller's own R2 folder, so a task can't be pointed at
// someone else's upload (or an arbitrary external URL).
function parseAttachments(v: unknown, userId: string): TodoAttachment[] | null {
  if (!Array.isArray(v) || v.length > TODO_ATTACHMENT_MAX_COUNT) return null
  const out: TodoAttachment[] = []
  for (const a of v) {
    if (!a || typeof a !== 'object') return null
    const { url, name, size, contentType, uploadedAt } = a as Record<string, unknown>
    if (typeof url !== 'string' || !keyFromR2Url(url)?.startsWith(todoUploadPrefix(userId))) return null
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

function parseSubtasks(v: unknown): TodoSubtask[] | null {
  if (!Array.isArray(v) || v.length > TODO_SUBTASK_MAX_COUNT) return null
  const out: TodoSubtask[] = []
  for (const st of v) {
    if (!st || typeof st !== 'object') return null
    const { id, title, done, dueDate, priority } = st as Record<string, unknown>
    if (typeof title !== 'string' || !title.trim()) continue // blank rows are dropped, not an error
    out.push({
      id: typeof id === 'string' && id ? id.slice(0, 64) : Math.random().toString(36).slice(2, 12),
      title: title.trim().slice(0, 500),
      done: done === true,
      // Plain YYYY-MM-DD, same convention as the task dates on the client.
      dueDate: typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
      priority: TODO_PRIORITIES.includes(priority as never) ? priority as string : null,
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
export function parseTodoInput(body: Record<string, unknown>, userId: string, existingCompletedAt?: Date | null):
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
    data.completedAt = done ? (existingCompletedAt ?? new Date()) : null
  }
  if ('attachments' in body) {
    const files = parseAttachments(body.attachments, userId)
    if (!files) return { error: 'Invalid attachments' }
    data.attachments = files as unknown as Prisma.InputJsonValue
  }
  if ('subtasks' in body) {
    const subtasks = parseSubtasks(body.subtasks)
    if (!subtasks) return { error: 'Invalid sub tasks' }
    data.subtasks = subtasks as unknown as Prisma.InputJsonValue
  }
  if ('sortOrder' in body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder as number
  return { data }
}
