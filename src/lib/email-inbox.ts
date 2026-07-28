import { Resend } from 'resend'
import { getTenantSecret } from '@/lib/tenant-secrets'

// Unlike WhatsApp/Instagram, actually sendable today — reuses the same Resend
// API key already wired up for marketing campaigns (src/lib/resend-mailer.ts).
// Only needs a From address configured (Super Admin → tenant secrets) to work.
export interface SendEmailReplyResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export async function sendEmailInboxReply(tenantId: string, to: string, subject: string, body: string): Promise<SendEmailReplyResult> {
  const [apiKey, from] = await Promise.all([
    getTenantSecret(tenantId, 'resendApiKey'),
    getTenantSecret(tenantId, 'emailInboxFromAddress'),
  ])
  if (!apiKey || !from) {
    return { ok: false, error: 'Email inbox is not configured for this tenant yet (Resend API Key / From Address)' }
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from, to, subject,
      html: body.replace(/\n/g, '<br>'),
      text: body,
    })
    if (error || !data) return { ok: false, error: error?.message ?? 'Send failed' }
    return { ok: true, providerMessageId: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reach Resend' }
  }
}
