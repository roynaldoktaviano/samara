import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'
import { requireRole } from '@/lib/auth-guard'
import { canAccessLead } from '@/lib/lead-access'
import { logActivity } from '@/lib/activity'
import { isMatchConfidence, MATCH_CONFIDENCE_LABEL } from '@/lib/wa-match-confidence'

// PATCH { matchConfidence: 'CONFIDENT' | 'MEDIUM' | 'LOW' } — sales correct how sure the
// WhatsApp-click match is (the "Click ID match" dropdown). LOW is never uploaded to
// Google/Meta; uploads read the current value at run time (src/lib/ad-consent.ts).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)
  const { id } = await params
  const role = (auth.session.user as { role?: string }).role
  const userId = auth.session.user.id

  const body = await request.json().catch(() => ({}))
  if (!isMatchConfidence(body.matchConfidence)) {
    return NextResponse.json({ error: 'matchConfidence must be CONFIDENT, MEDIUM or LOW' }, { status: 400 })
  }

  const inquiry = await db.inquiry.findUnique({ where: { id }, select: { id: true, leadId: true, customerId: true, waTapId: true, matchConfidence: true } })
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (inquiry.leadId && !(await canAccessLead(db, role, userId, inquiry.leadId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!inquiry.waTapId && !inquiry.matchConfidence) {
    return NextResponse.json({ error: 'Only a WhatsApp click match has a confidence' }, { status: 400 })
  }

  const updated = await db.inquiry.update({
    where: { id },
    data: { matchConfidence: body.matchConfidence, matchConfidenceById: userId, matchConfidenceAt: new Date() },
  })

  logActivity({
    userId, userName: auth.session.user.name ?? auth.session.user.email ?? 'Unknown', userRole: role ?? '',
    action: 'UPDATE', entity: inquiry.leadId ? 'Lead' : 'Customer', entityId: inquiry.leadId ?? inquiry.customerId ?? id,
    detail: `WhatsApp click match: ${inquiry.matchConfidence ? MATCH_CONFIDENCE_LABEL[inquiry.matchConfidence as keyof typeof MATCH_CONFIDENCE_LABEL] ?? inquiry.matchConfidence : '—'} → ${MATCH_CONFIDENCE_LABEL[body.matchConfidence as keyof typeof MATCH_CONFIDENCE_LABEL]}`,
  }, db).catch(() => {})

  return NextResponse.json(updated)
}
