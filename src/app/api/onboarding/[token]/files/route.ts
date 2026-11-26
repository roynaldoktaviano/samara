import { NextRequest, NextResponse } from 'next/server'
import { isAcceptableUpload, resolveOnboardingSession } from '@/lib/onboarding-access'
import { persistDataUrls } from '@/lib/private-files-server'
import { ONBOARDING_MAX_FILES_PER_FIELD, visibleDocFields, type OnboardingDocField } from '@/lib/onboarding-fields'

// Per-document upload/remove for the public Onboarding Form — one field per request so a
// handful of scans never has to travel in a single huge Save Draft body. Files are stored as
// in private R2 storage (/api/files/private/… refs, same as Employee documents), never on the
// public R2 host.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = await resolveOnboardingSession(req, token)
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status })
  const { db, form } = s

  const body = await req.json().catch(() => null) as { field?: string; add?: unknown[]; removeIndex?: unknown } | null
  const field = body?.field as OnboardingDocField | undefined
  if (!field || !visibleDocFields({ formType: form.formType, isCrew: form.isCrew }).includes(field)) {
    return NextResponse.json({ error: 'Invalid document field' }, { status: 400 })
  }

  let files = [...form[field]]
  if (typeof body?.removeIndex === 'number') {
    if (body.removeIndex < 0 || body.removeIndex >= files.length) return NextResponse.json({ error: 'File not found' }, { status: 400 })
    files.splice(body.removeIndex, 1)
  }
  if (Array.isArray(body?.add) && body.add.length) {
    if (!body.add.every(isAcceptableUpload)) {
      return NextResponse.json({ error: 'Only photos or PDF files up to 10 MB are accepted' }, { status: 400 })
    }
    // Stored privately in R2 (never the public files host) — keeps the form row small.
    files = [...files, ...(await persistDataUrls(body.add, 'hr-employee', field.replace(/Files$/, '')))]
    if (files.length > ONBOARDING_MAX_FILES_PER_FIELD) {
      return NextResponse.json({ error: `Maximum ${ONBOARDING_MAX_FILES_PER_FIELD} files per document` }, { status: 400 })
    }
  }

  const updated = await db.onboardingForm.update({ where: { id: form.id }, data: { [field]: files, lastSavedAt: new Date() } })
  return NextResponse.json({ ok: true, count: updated[field].length })
}
