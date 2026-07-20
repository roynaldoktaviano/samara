import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { renderBlocksToHtml, injectUnsubscribeUrl, injectPreviewText, normalizeDesign } from '@/lib/email-builder'
import { sendBulkEmail } from '@/lib/resend-mailer'
import { getTenantSecret } from '@/lib/tenant-secrets'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = (session?.user as { tenantId?: string })?.tenantId ?? ''
  const apiKey = await getTenantSecret(tenantId, 'resendApiKey')
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { testEmail, subject, previewText, fromEmail, fromName, blocksJson } = await request.json()
  if (!testEmail?.trim() || !subject?.trim() || !fromEmail?.trim() || !blocksJson) {
    return NextResponse.json({ error: 'testEmail, subject, fromEmail, and blocksJson are required' }, { status: 400 })
  }

  const design = normalizeDesign(blocksJson)
  let html = renderBlocksToHtml(design.blocks, design.settings)
  html = injectUnsubscribeUrl(html, '#')
  if (previewText?.trim()) html = injectPreviewText(html, previewText.trim())

  const result = await sendBulkEmail({
    apiKey,
    from: fromEmail.trim(),
    fromName: fromName?.trim() || undefined,
    subject: `[TEST] ${subject.trim()}`,
    recipients: [{ email: testEmail.trim(), htmlFor: html }],
  })

  if (result.failures[testEmail.trim()]) {
    return NextResponse.json({ error: result.failures[testEmail.trim()] }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
