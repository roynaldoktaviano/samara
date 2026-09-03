import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Reviewing content (approve / send back for revision) is reserved for Marketing Director and
// above — plain MARKETING can produce and submit content but not sign off on its own queue.
const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR']

// The only edges the content lifecycle can move along. REVISION always loops back to
// IN_PRODUCTION rather than straight to WAITING_APPROVAL, so the owner has to actually
// touch the item (upload a new version, address the note) before it goes up for review again.
const TRANSITIONS: Record<string, { from: string; to: string; requiresComment?: boolean; approverOnly?: boolean }> = {
  start_production:  { from: 'IDEA',             to: 'IN_PRODUCTION' },
  submit_approval:   { from: 'IN_PRODUCTION',    to: 'WAITING_APPROVAL' },
  approve:           { from: 'WAITING_APPROVAL',  to: 'APPROVED', approverOnly: true },
  request_changes:   { from: 'WAITING_APPROVAL',  to: 'REVISION', requiresComment: true, approverOnly: true },
  resubmit:          { from: 'REVISION',          to: 'IN_PRODUCTION' },
  publish:           { from: 'APPROVED',          to: 'PUBLISHED' },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { action, comment, liveUrl } = await req.json()
  const transition = TRANSITIONS[action]
  if (!transition) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (transition.requiresComment && !comment?.trim()) {
    return NextResponse.json({ error: 'A comment explaining the requested changes is required' }, { status: 400 })
  }
  if (transition.approverOnly && !roleMatches(role, APPROVER_ROLES)) {
    return NextResponse.json({ error: 'Only a Marketing Director can approve or request changes' }, { status: 403 })
  }

  const existing = await db.contentItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== transition.from) {
    return NextResponse.json({ error: `Cannot ${action} from status ${existing.status}` }, { status: 409 })
  }

  const authorName = session!.user.name ?? session!.user.email ?? 'Unknown'
  const [item] = await db.$transaction([
    db.contentItem.update({
      where: { id },
      data: {
        status: transition.to as never,
        ...(action === 'publish' && liveUrl !== undefined && { liveUrl: liveUrl?.trim() || null }),
      },
    }),
    db.contentComment.create({
      data: { contentItemId: id, authorUserId: session!.user.id, authorName, text: comment?.trim() || '', action: action.toUpperCase() },
    }),
  ])

  logActivity({
    userId: session!.user.id, userName: authorName, userRole: role,
    action: 'UPDATE', entity: 'ContentItem', entityId: id,
    detail: `Content "${existing.title}": ${existing.status} → ${transition.to}`,
  }, db).catch(() => {})

  return NextResponse.json(item)
}
