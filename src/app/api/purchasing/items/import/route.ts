import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    rows.push(fields)
  }
  return rows
}

function col(headers: string[], ...names: string[]): number {
  const clean = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
  for (const name of names) {
    const idx = headers.findIndex(h => clean(h) === clean(name))
    if (idx >= 0) return idx
  }
  return -1
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'File CSV dibutuhkan' }, { status: 400 })

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length < 2) return NextResponse.json({ error: 'File CSV kosong atau tidak valid' }, { status: 400 })

  const headers = rows[0]
  const iSKU      = col(headers, 'SKU', 'sku')
  const iName     = col(headers, 'Nama', 'name', 'nama barang')
  const iCat      = col(headers, 'Kategori', 'category')
  const iBase     = col(headers, 'Satuan Dasar', 'baseUnit', 'satuan dasar')
  const iPurch    = col(headers, 'Satuan Beli', 'purchaseUnit', 'satuan beli')
  const iConv     = col(headers, 'Konversi', 'conversionFactor', 'konversi')
  const iCost     = col(headers, 'Harga Standar', 'standardCost', 'harga standar', 'harga')
  const iMin      = col(headers, 'Min Stok', 'minStock', 'min stok')
  const iReorder  = col(headers, 'Qty Reorder', 'reorderQty', 'reorder')

  if (iSKU < 0 || iName < 0) {
    return NextResponse.json({ error: 'Kolom SKU dan Nama wajib ada di header CSV' }, { status: 400 })
  }

  let imported = 0
  let updated = 0
  const errors: { row: number; sku: string; error: string }[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(r => !r)) continue

    const sku  = row[iSKU]?.trim().toUpperCase()
    const name = row[iName]?.trim()

    if (!sku || !name) {
      errors.push({ row: i + 1, sku: sku || '—', error: 'SKU dan Nama wajib diisi' })
      continue
    }

    const category       = (iCat >= 0     ? row[iCat]    : '') || 'Umum'
    const baseUnit       = (iBase >= 0    ? row[iBase]   : '') || 'pcs'
    const purchaseUnit   = (iPurch >= 0   ? row[iPurch]  : '') || baseUnit
    const conversionFactor = parseFloat(iConv >= 0   ? row[iConv]   : '') || 1
    const standardCost     = parseFloat(iCost >= 0   ? row[iCost]   : '') || 0
    const minStock         = parseFloat(iMin >= 0    ? row[iMin]    : '') || 0
    const reorderQty       = parseFloat(iReorder >= 0 ? row[iReorder] : '') || 0

    try {
      const existing = await db.purchaseItem.findUnique({ where: { sku } })
      if (existing) {
        await db.purchaseItem.update({
          where: { sku },
          data: { name, category, baseUnit, purchaseUnit, conversionFactor, standardCost, minStock, reorderQty, updatedAt: new Date() },
        })
        updated++
      } else {
        await db.purchaseItem.create({
          data: { id: crypto.randomUUID(), sku, name, category, baseUnit, purchaseUnit, conversionFactor, standardCost, minStock, reorderQty, updatedAt: new Date() },
        })
        imported++
      }
    } catch (e) {
      errors.push({ row: i + 1, sku, error: (e as Error).message })
    }
  }

  return NextResponse.json({ imported, updated, errors, total: imported + updated })
}
