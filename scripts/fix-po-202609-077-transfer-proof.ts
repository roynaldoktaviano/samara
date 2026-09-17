/**
 * Finance uploaded the wrong transfer-proof screenshot on PO-202609-077's payment
 * request. Replaces POPaymentRequest.transferProofKeys with the correct screenshot
 * (public/icons/buktitf.jpeg, base64-encoded the same way the app's own upload flow
 * does it — see src/lib/fileUpload.ts::readUploadFile) since the normal
 * PATCH /api/finance/purchase-order-payments/[id] route refuses to touch a request
 * that's already PAID.
 *
 * Run: npx tsx scripts/fix-po-202609-077-transfer-proof.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const db = new PrismaClient()

const PO_NUMBER = 'PO-202609-077'
const IMAGE_PATH = join(process.cwd(), 'public/icons/buktitf.jpeg')

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const order = await db.purchaseOrder.findUnique({
    where: { poNumber: PO_NUMBER },
    select: {
      id: true, poNumber: true,
      paymentRequests: {
        select: { id: true, amount: true, status: true, paidAt: true, paidNotes: true, transferProofKeys: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!order) throw new Error(`PO ${PO_NUMBER} not found`)

  console.log(`Found ${order.poNumber} (${order.id}) with ${order.paymentRequests.length} payment request(s):`)
  for (const p of order.paymentRequests) {
    console.log(`  - ${p.id} | status=${p.status} | amount=${p.amount} | paidAt=${p.paidAt?.toISOString() ?? '—'} | proofs=${p.transferProofKeys.length}`)
  }

  const paid = order.paymentRequests.filter(p => p.status === 'PAID')
  if (paid.length !== 1) {
    throw new Error(`Expected exactly 1 PAID payment request, found ${paid.length} — resolve manually before running the update.`)
  }
  const target = paid[0]

  const bytes = readFileSync(IMAGE_PATH)
  const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`
  console.log(`\nRead ${IMAGE_PATH} (${bytes.length} bytes) -> data URL (${dataUrl.length} chars)`)
  console.log(`Target payment request ${target.id}: will replace ${target.transferProofKeys.length} existing proof(s) with 1 new one.`)

  if (dryRun) {
    console.log('\n--dry-run: no changes written.')
    return
  }

  await db.pOPaymentRequest.update({
    where: { id: target.id },
    data: { transferProofKeys: [dataUrl] },
  })
  console.log('\nDone — transferProofKeys updated.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
