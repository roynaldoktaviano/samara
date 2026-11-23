import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { WhatsappBrand } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { leadOwnerScope } from '@/lib/lead-access'
import { chatRole } from '@/lib/role-utils'
import { createDealFromLead } from '@/lib/deal-chat'
import { emitTenantEvent } from '@/lib/realtime-bus'

// "Create deal" in the chat lead panel: opens a deal for this lead from the lead's own data (trip
// type, yacht, dates, pax, amount) — used for chats that don't open one by themselves, e.g. a guest
// who WhatsApps the number directly (src/lib/deal-chat.ts). Body: { channel: 'whatsapp' | 'instagram',
// conversationId } — the chat decides the brand and the deal's channel.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = chatRole((session.user as { role?: string }).role)
  if (!['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const lead = await db.lead.findFirst({ where: { id, deletedAt: null, ...leadOwnerScope(role, session.user.id) }, select: { id: true, name: true } })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as { channel?: string; conversationId?: string }
    let brand: WhatsappBrand = 'SAMARA'
    let channel: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'MANUAL' = 'MANUAL'
    let whatsappConversationId: string | null = null
    if (body.channel === 'whatsapp' && body.conversationId) {
      const conv = await db.whatsappConversation.findFirst({ where: { id: body.conversationId, leadId: id }, select: { id: true, brand: true } })
      if (!conv) return NextResponse.json({ error: 'Chat not linked to this lead' }, { status: 400 })
      brand = conv.brand ?? 'SAMARA'
      channel = 'WHATSAPP'
      whatsappConversationId = conv.id
    } else if (body.channel === 'instagram' && body.conversationId) {
      const conv = await db.instagramConversation.findFirst({ where: { id: body.conversationId, leadId: id }, select: { brand: true, platform: true } })
      if (!conv) return NextResponse.json({ error: 'Chat not linked to this lead' }, { status: 400 })
      brand = conv.brand ?? 'SAMARA'
      channel = conv.platform === 'MESSENGER' ? 'MESSENGER' : 'INSTAGRAM'
    }

    const r = await createDealFromLead(db, { leadId: id, brand, channel, whatsappConversationId, actingUserId: session.user.id })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

    if (r.created) {
      logActivity({
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        userRole: role,
        action: 'CREATE', entity: 'Lead', entityId: id,
        detail: `Create deal from chat (${lead.name})`,
      }, db).catch(() => {})
      emitTenantEvent(session.user.tenantId, 'chat')
    }
    return NextResponse.json({ dealId: r.dealId, created: r.created })
  } catch (error) {
    console.error('Error creating deal from lead:', error)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
}
