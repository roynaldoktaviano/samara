import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { listWhatsappTemplates } from '@/lib/whatsapp-templates'
import { parseTemplateInput } from './parse'

function parseBrand(value: string | null): WhatsappBrand | null {
  return (WHATSAPP_BRANDS as readonly string[]).includes(value ?? '') ? (value as WhatsappBrand) : null
}

// GET ?brand=X — templates offered in the compose UIs (admin-registered + the built-in
// hello_world sample). `?manage=1` (ADMIN) returns just the registered rows, with ids,
// for the Chat > WhatsApp Templates settings screen.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = parseBrand(req.nextUrl.searchParams.get('brand'))
  if (!brand) return NextResponse.json({ error: 'Invalid or missing brand' }, { status: 400 })
  const db = await getDb(session)

  if (req.nextUrl.searchParams.get('manage') === '1') {
    if (role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(await db.whatsappTemplate.findMany({ where: { brand }, orderBy: { label: 'asc' } }))
  }
  return NextResponse.json(await listWhatsappTemplates(db, brand))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const brand = parseBrand(typeof body.brand === 'string' ? body.brand : null)
  if (!brand) return NextResponse.json({ error: 'Invalid or missing brand' }, { status: 400 })
  const parsed = parseTemplateInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = await getDb(session)
  const clash = await db.whatsappTemplate.findUnique({ where: { brand_name_language: { brand, name: parsed.name, language: parsed.language } } })
  if (clash) return NextResponse.json({ error: 'This template (name + language) is already registered for this brand' }, { status: 409 })

  const template = await db.whatsappTemplate.create({ data: { brand, ...parsed } })
  return NextResponse.json(template)
}
