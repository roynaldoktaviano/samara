import { NextRequest, NextResponse } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'
import { receiveTransferLeg } from '@/lib/purchasing/transferActions'

// No-login, per-shipment token link crew use to confirm receiving a StockTransfer — see
// src/app/crew-receive/[token]/page.tsx. Mirrors src/app/api/guest-form/[token]/route.ts:
// there's no session here to know which tenant DB to use, so the token is looked up by
// scanning tenants via resolveTenantByLookup.
async function findTransfer(client: PrismaClient, token: string) {
  return client.stockTransfer.findUnique({
    where: { receiveToken: token },
    select: {
      id: true, transferNumber: true, status: true, receiveTokenExpiresAt: true,
      receivedByName: true, receivedAt: true,
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
      items: { select: { itemId: true, itemName: true, dispatchedQty: true } },
    },
  })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await resolveTenantByLookup(client => findTransfer(client, token))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { record: transfer } = found
  if (transfer.receiveTokenExpiresAt && new Date(transfer.receiveTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }
  return NextResponse.json(transfer)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await resolveTenantByLookup(client => findTransfer(client, token))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: transfer } = found
  if (transfer.receiveTokenExpiresAt && new Date(transfer.receiveTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }
  if (transfer.status !== 'DISPATCHED') return NextResponse.json({ error: 'Sudah diterima sebelumnya' }, { status: 409 })

  const full = await db.stockTransfer.findUnique({ where: { id: transfer.id }, select: { dispatchedById: true } })
  if (!full?.dispatchedById) return NextResponse.json({ error: 'Transfer ini belum punya catatan dispatch yang valid' }, { status: 400 })

  const body = await req.json()
  const { receivePhotoKey, receivedByName } = body as { receivePhotoKey?: string; receivedByName?: string }
  if (!receivedByName?.trim()) return NextResponse.json({ error: 'Nama penerima wajib diisi' }, { status: 400 })

  const result = await receiveTransferLeg(db, transfer.id, {
    items: transfer.items.map(i => ({ itemId: i.itemId, itemName: i.itemName, receivedQty: i.dispatchedQty })),
    receivePhotoKey: receivePhotoKey ?? '',
    receivedByName: receivedByName.trim(),
    receivedById: null,
    movementCreatedById: full.dispatchedById,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
