import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { normalizeWhatsappPhone, sendWhatsappTemplateMessage } from '@/lib/whatsapp'
import { findWhatsappTemplate, renderWhatsappTemplateBody } from '@/lib/whatsapp-templates'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { claimWhatsappConversation, pickNextSalesUserId } from '@/lib/whatsapp-distribution'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  // A SALES rep sees chats assigned to them plus unassigned ones they can claim; ADMIN sees everything.
  const conversations = await db.whatsappConversation.findMany({
    where: role === 'SALES' ? { OR: [{ assignedToId: session.user.id }, { assignedToId: null }] } : undefined,
    orderBy: { lastMessageAt: 'desc' },
  })
  return NextResponse.json(conversations)
}

// Starts a brand-new WhatsApp thread — for a lead/contact who has never messaged in, the
// Cloud API only accepts an approved Message Template as the very first outbound message
// (see src/lib/whatsapp-templates.ts). This is the only place a conversation gets created
// other than the inbound webhook (src/app/api/webhooks/whatsapp/route.ts).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone: rawPhone, brand, templateName, templateLanguage, templateParams, contactName } = await req.json()
  const phone = normalizeWhatsappPhone(rawPhone ?? '')
  if (!phone) return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  if (!WHATSAPP_BRANDS.includes(brand)) return NextResponse.json({ error: 'Invalid brand' }, { status: 400 })

  const db = await getDb(session)
  const templateDef = await findWhatsappTemplate(db, brand as WhatsappBrand, templateName ?? '', templateLanguage)
  if (!templateDef) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

  // Threads are per (number, brand) — the same number on another brand is a separate thread.
  const existing = await db.whatsappConversation.findUnique({ where: { phone_brand: { phone, brand } } })
  if (existing && role === 'SALES' && !(await claimWhatsappConversation(db, existing.id, session.user.id))) {
    return NextResponse.json({ error: 'This number already has a conversation assigned to another sales rep' }, { status: 409 })
  }

  const conversation = existing ?? await db.whatsappConversation.create({
    data: {
      phone,
      contactName: contactName || null,
      brand,
      assignedToId: role === 'SALES' ? session.user.id : await pickNextSalesUserId(db, brand),
    },
  })

  const renderedBody = renderWhatsappTemplateBody(templateDef, templateParams ?? [])
  const message = await db.whatsappMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      body: renderedBody,
      templateName: templateDef.name,
      status: 'PENDING',
      sentByUserId: session.user.id,
      sentByName: session.user.name ?? session.user.email ?? 'Admin',
    },
  })
  await db.whatsappConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: renderedBody },
  })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const result = tenantId
    ? await sendWhatsappTemplateMessage(tenantId, brand, phone, templateDef.name, templateDef.language, templateParams)
    : { ok: false, error: 'No tenant on session' }

  await db.whatsappMessage.update({
    where: { id: message.id },
    data: result.ok ? { status: 'SENT', providerMessageId: result.providerMessageId } : { status: 'FAILED' },
  })

  return NextResponse.json({ conversationId: conversation.id, providerError: result.ok ? undefined : result.error })
}
