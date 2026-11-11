import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { salesCanAccessConversation } from '@/lib/whatsapp-distribution'
import { ensureLeadForMetaDm } from '@/lib/lead-contact'

// The Instagram/Messenger chat's "Edit lead" button on a chat with no Lead yet — links an
// existing Lead by IG handle or creates one, so the rep can then edit it right there.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = await getDb(session)
  const conv = await db.instagramConversation.findUnique({ where: { id }, select: { assignedToId: true } })
  if (!conv || (role === 'SALES' && !salesCanAccessConversation(conv, session.user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // SALES only edit their own Leads (lead-access.ts) — an unassigned chat must be claimed first
  if (role === 'SALES' && conv.assignedToId !== session.user.id) return NextResponse.json({ error: 'Claim this chat first' }, { status: 403 })
  const { leadId } = await ensureLeadForMetaDm(db, id)
  if (!leadId) return NextResponse.json({ error: 'Could not create lead' }, { status: 500 })
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json({ leadId })
}
