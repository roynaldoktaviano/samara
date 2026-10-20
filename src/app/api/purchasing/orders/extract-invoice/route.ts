import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

// Create PO → "Import from invoice": reads a supplier invoice / quotation (photo or PDF)
// with Claude and maps each line to a catalog PurchaseItem where one clearly matches, so
// Purchasing only has to review the prefilled rows instead of typing them in. Nothing is
// saved here — the client drops the result into the (still editable) PO form.

const CREATE_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
const MAX_BYTES = 20 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const ExtractedInvoice = z.object({
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unit: z.string().nullable(),
    unitPrice: z.number(),
    discountType: z.enum(['NONE', 'PERCENT', 'FIXED']),
    discountValue: z.number(),
    catalogItemId: z.string().nullable(),
    catalogUnit: z.enum(['PURCHASE', 'BASE']).nullable(),
  })),
  invoiceDiscountAmount: z.number().nullable(),
  extraCharges: z.array(z.object({ label: z.string(), amount: z.number() })),
})
export type ExtractedInvoice = z.infer<typeof ExtractedInvoice>

const SYSTEM = `You read supplier invoices, receipts and quotations for a yacht-charter company in Indonesia and turn them into purchase-order lines.

For every purchased line on the document, return:
- description: the item as written on the document.
- quantity and unitPrice as plain numbers. Indonesian documents use "." as thousands separator and "," as decimal ("Rp 1.250.000,50" = 1250000.5). If only a line total is printed, derive unitPrice = total / quantity.
- unit: the unit as written (pcs, btl, krt, kg, box...), or null.
- discountType / discountValue: a discount printed on that specific line — PERCENT with the % value, or FIXED with the Rupiah amount off the whole line. NONE with 0 when there is none.
- catalogItemId: the id of the catalog item below that is clearly the same product (same product, brand and size — not merely the same category). Use null when unsure; a wrong match is worse than none.
- catalogUnit: when matched, PURCHASE if the document's unit is the catalog item's purchase unit (e.g. carton/case), BASE if it is the base unit (e.g. bottle/can). Null when unmatched.

Also return supplierName (the seller, not the buyer), invoiceNumber, invoiceDiscountAmount (a discount on the whole invoice in Rupiah, else null) and extraCharges (tax/PPN, shipping, service fees as separate { label, amount }; empty when none). Skip subtotal/total rows — they are not lines. If the file is not an invoice/receipt/quotation, return empty lines.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, CREATE_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Invoice import is not configured (ANTHROPIC_API_KEY missing)' }, { status: 503 })

  const { file } = await req.json() as { file?: string }
  const match = typeof file === 'string' ? /^data:([^;]+);base64,(.+)$/.exec(file) : null
  if (!match) return NextResponse.json({ error: 'Upload an image or PDF' }, { status: 400 })
  const [, mediaType, data] = match
  if (data.length * 0.75 > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 20 MB)' }, { status: 400 })

  let fileBlock: Anthropic.Beta.BetaContentBlockParam
  if (mediaType === 'application/pdf') {
    fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  } else if ((IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType as typeof IMAGE_TYPES[number], data } }
  } else {
    return NextResponse.json({ error: 'Only images (JPG/PNG/WebP) or PDF are supported' }, { status: 400 })
  }

  const db = await getDb(session)
  const catalog = await db.purchaseItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sku: true, baseUnit: true, purchaseUnit: true, conversionFactor: true },
    orderBy: { name: 'asc' },
  })
  const catalogText = catalog.map(i =>
    `${i.id} | ${i.name} | sku ${i.sku} | base ${i.baseUnit}` + (i.purchaseUnit && i.purchaseUnit !== i.baseUnit ? ` | purchase ${i.purchaseUnit} = ${i.conversionFactor} ${i.baseUnit}` : ''),
  ).join('\n')

  const client = new Anthropic()
  let response
  try {
    response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(ExtractedInvoice) },
      // Catalog is the big stable chunk — cached so repeat imports in a session are cheap.
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: `Catalog (id | name | sku | units):\n${catalogText || '(empty)'}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Extract the purchase lines from this document.' }] }],
    })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'AI is busy, try again in a moment' }, { status: 429 })
    if (e instanceof Anthropic.BadRequestError) return NextResponse.json({ error: `Could not read this file: ${e.message}` }, { status: 400 })
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI request failed (${e.status})` }, { status: 502 })
    throw e
  }

  if (response.stop_reason === 'refusal') return NextResponse.json({ error: 'The AI declined to read this file' }, { status: 422 })
  if (response.stop_reason === 'max_tokens') return NextResponse.json({ error: 'Document has too many lines to import at once — split it and try again' }, { status: 422 })
  const parsed = response.parsed_output
  if (!parsed) return NextResponse.json({ error: 'Could not read the invoice' }, { status: 422 })

  // Never trust an id the model made up — only ids that are really in this tenant's catalog.
  const byId = new Map(catalog.map(i => [i.id, i]))
  const lines = parsed.lines
    .filter(l => l.description.trim() && l.quantity > 0)
    .map(l => {
      const item = l.catalogItemId ? byId.get(l.catalogItemId) : undefined
      return { ...l, catalogItemId: item ? item.id : null, catalogUnit: item ? l.catalogUnit ?? 'PURCHASE' : null }
    })

  return NextResponse.json({ ...parsed, lines })
}
