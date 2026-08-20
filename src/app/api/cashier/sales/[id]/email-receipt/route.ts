import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { sendBulkEmail } from '@/lib/resend-mailer'

const fmt = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }

  const sale = await db.cashierSale.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      yacht: { select: { name: true } },
      booking: { select: { bookingCode: true } },
    },
  })
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
  if (sale.status !== 'closed') return NextResponse.json({ error: 'Only a closed bill can be emailed' }, { status: 400 })

  const [apiKey, fromAddress] = await Promise.all([
    getTenantSecret(session.user.tenantId, 'resendApiKey'),
    getTenantSecret(session.user.tenantId, 'emailInboxFromAddress'),
  ])
  if (!apiKey || !fromAddress) {
    return NextResponse.json({ error: 'Email sending is not configured for this account yet — contact an admin.' }, { status: 500 })
  }

  const itemRows = sale.items.map(i =>
    `<tr><td style="padding:6px 0;color:#1a252f;">${i.name} <span style="color:#8a8378;">×${i.qty}</span></td><td style="padding:6px 0;text-align:right;color:#7a7468;">${fmt(i.price * i.qty)}</td></tr>`
  ).join('')

  const html = `
    <div style="font-family:'DM Sans',sans-serif;max-width:420px;margin:0 auto;">
      <h2 style="color:#a8956a;margin-bottom:4px;">Receipt${sale.booking ? ` · ${sale.booking.bookingCode}` : ''}</h2>
      <p style="color:#8a8378;margin-top:0;">${sale.yacht.name}${sale.guestName ? ` · ${sale.guestName}` : ''}</p>
      <table style="width:100%;border-collapse:collapse;">${itemRows}</table>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:18px;border-top:1px solid #ece6d8;padding-top:10px;margin-top:6px;">
        <span>TOTAL</span><span>${fmt(sale.total)}</span>
      </div>
      <p style="color:#8a8378;font-size:13px;">Payment: ${sale.payMethod ?? '-'}</p>
    </div>`

  const result = await sendBulkEmail({
    apiKey,
    from: fromAddress,
    fromName: sale.yacht.name,
    subject: `Your receipt — ${sale.yacht.name}${sale.booking ? ` (${sale.booking.bookingCode})` : ''}`,
    recipients: [{ email, htmlFor: html }],
  })

  if (result.failures[email]) {
    return NextResponse.json({ error: result.failures[email] }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
