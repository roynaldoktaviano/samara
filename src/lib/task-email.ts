import type { PrismaClient } from '@prisma/client'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { sendBulkEmail } from '@/lib/resend-mailer'

// Email side of My Works notifications (the bell + push live in src/lib/todo.ts).
//
// Anti-spam: sub tasks save instantly on every inline edit, so assigning someone to five sub
// tasks one by one is five saves. Instead of one email per save, events are queued per
// (tenant, actor, recipient) and flushed as ONE digest email once the actor has been quiet for
// QUIET_MS (capped at MAX_WAIT_MS so a long editing session still sends). The queue is
// in-memory — fine for the single long-running Node server; a restart drops pending digests
// (the bell notifications are already saved, so nothing is lost there).
const QUIET_MS = 2 * 60_000
const MAX_WAIT_MS = 10 * 60_000

export type TaskEmailEvent =
  | { kind: 'assigned'; todoId: string; taskTitle: string; subtask?: string }
  | { kind: 'completed'; todoId: string; taskTitle: string }

interface Pending {
  db: PrismaClient
  tenantId: string
  actorName: string
  recipientId: string
  events: TaskEmailEvent[]
  timer: ReturnType<typeof setTimeout>
  firstAt: number
}

const g = globalThis as unknown as { __taskEmailQueue?: Map<string, Pending> }
const queue = (g.__taskEmailQueue ??= new Map())

export function queueTaskEmail(
  db: PrismaClient,
  tenantId: string | undefined,
  actor: { id: string; name?: string | null },
  recipientId: string,
  event: TaskEmailEvent,
) {
  if (!tenantId || recipientId === actor.id) return
  const key = `${tenantId}:${actor.id}:${recipientId}`
  const now = Date.now()
  const existing = queue.get(key)
  if (existing) clearTimeout(existing.timer)
  const p: Pending = existing ?? { db, tenantId, actorName: actor.name || 'Someone', recipientId, events: [], timer: undefined as never, firstAt: now }
  p.events.push(event)
  const wait = Math.max(0, Math.min(QUIET_MS, p.firstAt + MAX_WAIT_MS - now))
  p.timer = setTimeout(() => { queue.delete(key); flush(p).catch(e => console.error('[task-email]', e)) }, wait)
  queue.set(key, p)
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// Noreply on the same (already Resend-verified) domain as the inbox sender.
function noreplyFrom(inboxFrom: string | null) {
  const domain = inboxFrom?.match(/@([^\s>]+)/)?.[1] ?? 'samarayachting.com'
  return `noreply@${domain}`
}

async function flush(p: Pending) {
  const user = await p.db.user.findUnique({ where: { id: p.recipientId }, select: { email: true, taskEmailOptOut: true } })
  if (!user?.email || user.taskEmailOptOut) return

  // A task ticked DONE then reopened inside the quiet window shouldn't announce "completed".
  const doneIds = [...new Set(p.events.filter(e => e.kind === 'completed').map(e => e.todoId))]
  const stillDone = new Set(doneIds.length
    ? (await p.db.todo.findMany({ where: { id: { in: doneIds }, status: 'DONE' }, select: { id: true } })).map(t => t.id)
    : [])
  const events = p.events.filter(e => e.kind !== 'completed' || stillDone.has(e.todoId))
  if (!events.length) return

  // Group per task: one line per task, with its assigned sub tasks listed under it.
  const tasks = new Map<string, { title: string; assigned: boolean; subs: string[]; completed: boolean }>()
  for (const e of events) {
    const t = tasks.get(e.todoId) ?? { title: e.taskTitle, assigned: false, subs: [], completed: false }
    t.title = e.taskTitle
    if (e.kind === 'completed') t.completed = true
    else if (e.subtask) { if (!t.subs.includes(e.subtask)) t.subs.push(e.subtask) }
    else t.assigned = true
    tasks.set(e.todoId, t)
  }
  const list = [...tasks.values()]
  const assignedList = list.filter(t => t.assigned || t.subs.length)
  const completedList = list.filter(t => t.completed)

  const who = p.actorName
  const first = (assignedList[0] ?? completedList[0]).title
  const more = list.length > 1 ? ` (+${list.length - 1} more)` : ''
  const subject = assignedList.length
    ? `[Samara ERP] ${who} assigned you: ${first}${more}`
    : `[Samara ERP] ${who} completed: ${first}${more}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.samarayachting.com'
  const row = (t: typeof list[number]) => `
    <li style="margin:0 0 10px;">
      <strong style="color:#1a252f;">${esc(t.title)}</strong>
      ${t.subs.length ? `<ul style="margin:4px 0 0;padding-left:18px;color:#5c5648;">${t.subs.map(s => `<li>Sub task: ${esc(s)}</li>`).join('')}</ul>` : ''}
    </li>`
  const section = (heading: string, items: typeof list) => items.length ? `
    <p style="margin:18px 0 8px;color:#1a252f;">${heading}</p>
    <ul style="margin:0;padding-left:18px;">${items.map(row).join('')}</ul>` : ''

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a252f;">
      <h2 style="color:#a8956a;margin:0 0 4px;">My Works</h2>
      ${section(`<strong>${esc(who)}</strong> assigned you:`, assignedList)}
      ${section(`<strong>${esc(who)}</strong> marked as done:`, completedList)}
      <p style="margin:24px 0;">
        <a href="${appUrl}" style="background:#d97706;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Open in My Works</a>
      </p>
      <p style="color:#8a8378;font-size:12px;border-top:1px solid #ece6d8;padding-top:12px;">
        Automated email from Samara ERP — please don't reply. To stop these emails, open My Works → Email notifications.
      </p>
    </div>`

  const [apiKey, inboxFrom] = await Promise.all([
    getTenantSecret(p.tenantId, 'resendApiKey'),
    getTenantSecret(p.tenantId, 'emailInboxFromAddress'),
  ])
  if (!apiKey) return
  const res = await sendBulkEmail({ apiKey, from: noreplyFrom(inboxFrom), fromName: 'Samara ERP', subject, recipients: [{ email: user.email, htmlFor: html }] })
  if (res.failures[user.email]) console.error('[task-email] send failed', user.email, res.failures[user.email])
}
