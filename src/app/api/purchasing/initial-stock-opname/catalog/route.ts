import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR', 'WAREHOUSE']

// What the Add/Edit Product popups need — item types (+ categories/SKU prefixes) and the
// catalog — scoped to the opname roles, since /api/purchasing/items and /item-types are
// Purchasing-only and would 401 for Finance Director / Warehouse.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [types, items] = await Promise.all([
    db.purchaseItemTypeConfig.findMany({
      orderBy: { createdAt: 'asc' },
      select: { code: true, label: true, isActive: true, categories: { orderBy: { createdAt: 'asc' }, select: { name: true, skuPrefix: true, isActive: true } } },
    }),
    db.purchaseItem.findMany({
      where: { isStockTracked: true },
      orderBy: { name: 'asc' },
      select: { id: true, sku: true, name: true, category: true, baseUnit: true, purchaseUnit: true },
    }),
  ])
  return NextResponse.json({ types, items })
}
