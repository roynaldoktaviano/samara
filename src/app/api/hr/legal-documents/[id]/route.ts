import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/module-access'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']
// Legal docs are managed from Entities & Assignments, Boat Documents and Yachts — any role
// granted one of those menus in Roles & Permissions gets full access to the documents too.
const LEGAL_DOC_MODULES = ['hr-entities-assignments', 'hr-boat-documents', 'yachts']

// Only fields needed to resolve a LEGAL_DOC_EXPIRING notification's legalDocumentId back
// to whichever parent (legal entity or yacht) its detail lives under — there's no
// per-document modal to open.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireModuleAccess(LEGAL_DOC_MODULES, ALLOWED)
  if ('error' in access) return access.error
  const { db } = access
  const doc = await db.legalDocument.findUnique({ where: { id }, select: { id: true, legalEntityId: true, yachtId: true } })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(doc)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireModuleAccess(LEGAL_DOC_MODULES, ALLOWED)
  if ('error' in access) return access.error
  const { db } = access
  const {
    section, name, category, period, subDetail, fileKey,
    establishDate, expiryDate, issuer, vendor, notes,
  } = await req.json()

  const updated = await db.legalDocument.update({
    where: { id },
    data: {
      ...(section !== undefined && { section: section?.trim() || null }),
      ...(name !== undefined && { name: name.trim() }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(period !== undefined && { period: period?.trim() || null }),
      ...(subDetail !== undefined && { subDetail: subDetail?.trim() || null }),
      ...(fileKey !== undefined && { fileKey: fileKey || null }),
      ...(establishDate !== undefined && { establishDate: establishDate ? new Date(establishDate) : null }),
      ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      ...(issuer !== undefined && { issuer: issuer?.trim() || null }),
      ...(vendor !== undefined && { vendor: vendor?.trim() || null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireModuleAccess(LEGAL_DOC_MODULES, ALLOWED)
  if ('error' in access) return access.error
  const { db } = access
  await db.legalDocument.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
