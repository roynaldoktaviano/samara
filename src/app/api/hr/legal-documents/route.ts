import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/module-access'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']
// Legal docs are managed from Entities & Assignments, Boat Documents and Yachts — any role
// granted one of those menus in Roles & Permissions gets full access to the documents too.
const LEGAL_DOC_MODULES = ['hr-entities-assignments', 'hr-boat-documents', 'yachts']

export async function GET(req: NextRequest) {
  const access = await requireModuleAccess(LEGAL_DOC_MODULES, ALLOWED)
  if ('error' in access) return access.error
  const { db } = access
  const legalEntityId = req.nextUrl.searchParams.get('legalEntityId')
  const yachtId = req.nextUrl.searchParams.get('yachtId')
  const documents = await db.legalDocument.findMany({
    where: legalEntityId ? { legalEntityId } : yachtId ? { yachtId } : undefined,
    orderBy: [{ section: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(documents)
}

export async function POST(req: NextRequest) {
  const access = await requireModuleAccess(LEGAL_DOC_MODULES, ALLOWED)
  if ('error' in access) return access.error
  const { db } = access
  const {
    legalEntityId, yachtId, section, name, category, period, subDetail, fileKey,
    establishDate, expiryDate, issuer, vendor, notes,
  } = await req.json()

  if (!legalEntityId && !yachtId) return NextResponse.json({ error: 'legalEntityId or yachtId is required' }, { status: 400 })
  if (legalEntityId && yachtId) return NextResponse.json({ error: 'A document belongs to either a legal entity or a yacht, not both' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'Document name is required' }, { status: 400 })

  if (legalEntityId) {
    const entity = await db.legalEntity.findUnique({ where: { id: legalEntityId }, select: { id: true } })
    if (!entity) return NextResponse.json({ error: 'Legal entity not found' }, { status: 404 })
  } else {
    const yacht = await db.yacht.findUnique({ where: { id: yachtId }, select: { id: true } })
    if (!yacht) return NextResponse.json({ error: 'Yacht not found' }, { status: 404 })
  }

  const created = await db.legalDocument.create({
    data: {
      id: crypto.randomUUID(),
      legalEntityId: legalEntityId || null,
      yachtId: yachtId || null,
      section: section?.trim() || null,
      name: name.trim(),
      category: category?.trim() || null,
      period: period?.trim() || null,
      subDetail: subDetail?.trim() || null,
      fileKey: fileKey || null,
      establishDate: establishDate ? new Date(establishDate) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      issuer: issuer?.trim() || null,
      vendor: vendor?.trim() || null,
      notes: notes?.trim() || null,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
