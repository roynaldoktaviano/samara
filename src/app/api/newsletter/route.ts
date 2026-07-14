import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { Resend } from 'resend'

const ALLOWED_ROLES = ['ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = await getDb(session)
  const sends = await withRetry(db, () => db.newsletterEmail.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  }))
  return NextResponse.json(sends)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })

  const body = await request.json()
  const { subject, bodyHtml, fromEmail, recipients } = body as {
    subject?: string; bodyHtml?: string; fromEmail?: string; recipients?: string[]
  }

  if (!subject || !bodyHtml || !fromEmail || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'subject, bodyHtml, fromEmail, and at least one recipient are required' }, { status: 400 })
  }

  const cleanRecipients = [...new Set(recipients.map(r => r.trim()).filter(Boolean))]
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const invalid = cleanRecipients.filter(r => !emailPattern.test(r))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Invalid email address(es): ${invalid.join(', ')}` }, { status: 400 })
  }

  const resend = new Resend(apiKey)
  const resendIds: string[] = []
  const failures: string[] = []

  // Sent one at a time (not a single multi-recipient email) so one bad address
  // doesn't block the rest, and each recipient's "To" line stays private.
  for (const to of cleanRecipients) {
    const { data, error } = await resend.emails.send({ from: fromEmail, to, subject, html: bodyHtml })
    if (error || !data) {
      failures.push(`${to}: ${error?.message ?? 'unknown error'}`)
    } else {
      resendIds.push(data.id)
    }
  }

  const status = failures.length === 0 ? 'sent' : (resendIds.length === 0 ? 'failed' : 'partial')

  const db = await getDb(session)
  const record = await withRetry(db, () => db.newsletterEmail.create({
    data: {
      subject,
      bodyHtml,
      fromEmail,
      recipients: cleanRecipients,
      status,
      resendIds,
      errorMessage: failures.length > 0 ? failures.join('; ') : null,
      sentByUserId: session?.user?.id ?? null,
      sentByName: session?.user?.name ?? session?.user?.email ?? null,
    },
  }))

  return NextResponse.json({ ok: status !== 'failed', status, sent: resendIds.length, failed: failures.length, failures, record })
}
