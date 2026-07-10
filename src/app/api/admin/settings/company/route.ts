import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const KEY = 'company_info'

export interface CompanyInfo {
  name:     string
  logoUrl:  string
  tagline:  string
  address:  string
  phone:    string
  website:  string
  email:    string
  showTnc:  boolean
}

const DEFAULT: CompanyInfo = {
  name:    'Samara Yachting',
  logoUrl: 'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png',
  tagline: 'PREMIUM YACHT EXPERIENCES',
  address: 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234',
  phone:   '+62 859-5495-1085',
  website: 'samaraliveaboard.com',
  email:   'inquiry@samaraliveaboard.com',
  showTnc: true,
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  const row = await db.systemSetting.findUnique({ where: { key: KEY } })
  if (!row?.textValue) return NextResponse.json(DEFAULT)

  try {
    return NextResponse.json({ ...DEFAULT, ...JSON.parse(row.textValue) })
  } catch {
    return NextResponse.json(DEFAULT)
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as Partial<CompanyInfo>
  const merged: CompanyInfo = { ...DEFAULT, ...body }

  const db = await getDb(session)
  await db.systemSetting.upsert({
    where:  { key: KEY },
    create: { key: KEY, textValue: JSON.stringify(merged), updatedBy: session!.user.name ?? session!.user.email ?? 'Admin' },
    update: { textValue: JSON.stringify(merged), updatedBy: session!.user.name ?? session!.user.email ?? 'Admin' },
  })

  return NextResponse.json({ ok: true, data: merged })
}
