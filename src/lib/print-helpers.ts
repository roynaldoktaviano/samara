import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import type { PrismaClient } from '@prisma/client'

export interface CompanyInfo {
  name:    string
  logoUrl: string
  tagline: string
  address: string
  phone:   string
  website: string
  email:   string
  showTnc: boolean
}

const DEFAULTS: CompanyInfo = {
  name:    'Samara Yachting',
  logoUrl: 'https://samaraliveaboard.com/wp-content/uploads/2025/08/Logo-Samara-icon-192x192-1.png',
  tagline: 'PREMIUM YACHT EXPERIENCES',
  address: 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234',
  phone:   '+62 859-5495-1085',
  website: 'samaraliveaboard.com',
  email:   'inquiry@samaraliveaboard.com',
  showTnc: true,
}

/** Returns { db, company } scoped to the current tenant session. */
export async function getPrintContext(): Promise<{ db: PrismaClient; company: CompanyInfo }> {
  const session = await getServerSession(authOptions)
  const db = await getDb(session)

  const row = await db.systemSetting.findUnique({ where: { key: 'company_info' } }).catch(() => null)
  let company = DEFAULTS
  if (row?.textValue) {
    try { company = { ...DEFAULTS, ...JSON.parse(row.textValue) } } catch { /* use defaults */ }
  }

  return { db, company }
}
