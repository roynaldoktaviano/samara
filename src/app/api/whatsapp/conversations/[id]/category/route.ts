import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { logActivity } from '@/lib/activity'
import { roleMatches } from '@/lib/role-utils'
import { salesCanAccessConversation } from '@/lib/whatsapp-distribution'
import { ensureLeadForConversation, isWhatsappChatCategory, WHATSAPP_CHAT_CATEGORY_LABEL } from '@/lib/whatsapp-lead'

// Triage a chat into SALES / GUEST / VENDOR / SPAM (or back to UNSORTED). Moving it to
// SALES creates/links its Lead so it shows up in the WhatsApp Pipeline. Moving it out of
// SALES keeps the Lead link (history stays) — the pipeline just stops listing it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ['ADMIN', 'SALES'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { category } = await req.json()
  if (!isWhatsappChatCategory(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })

  const db = await getDb(session)
  const conversation = await db.whatsappConversation.findUnique({ where: { id }, select: { assignedToId: true, category: true, contactName: true, phone: true } })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!roleMatches(role, ['ADMIN']) && !salesCanAccessConversation(conversation, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.whatsappConversation.update({ where: { id }, data: { category } })
  const leadId = category === 'SALES' ? await ensureLeadForConversation(db, id, session.user.id) : null

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'UPDATE', entity: 'WhatsappConversation', entityId: id,
    detail: `WhatsApp chat ${conversation.contactName || conversation.phone}: ${WHATSAPP_CHAT_CATEGORY_LABEL[conversation.category]} → ${WHATSAPP_CHAT_CATEGORY_LABEL[category]}`,
  }, db).catch(() => {})
  emitTenantEvent(session.user.tenantId, 'chat')

  return NextResponse.json({ ok: true, category, leadId })
}
