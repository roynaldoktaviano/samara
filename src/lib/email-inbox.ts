import { Resend } from 'resend'
import { getTenantSecret } from '@/lib/tenant-secrets'

// Unlike WhatsApp/Instagram, actually sendable today — reuses the same Resend
// API key already wired up for marketing campaigns (src/lib/resend-mailer.ts).
// Only needs a From address configured (Super Admin → tenant secrets) to work.
// Replies come back through Resend Inbound: Reply-To points at an address on a
// Resend receiving subdomain, whose email.received webhook lands in
// /api/webhooks/email-inbox.
//
// Per-rep identity: a sales rep whose login email is on the From domain sends as
// themselves ("Rina – Samara Yachting <rina@samarayachting.com>") with Reply-To
// rina@<reply domain>, so the webhook can route the answer back to their thread.
// Anyone else (or no sender) falls back to the shared From / Reply-To addresses.
export interface SendEmailReplyResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export interface EmailSender {
  name?: string | null
  email?: string | null
}

export interface SendEmailReplyOptions {
  attachmentUrls?: string[]
  /** The rep sending — used for their personal From / Reply-To when on the company domain. */
  sender?: EmailSender | null
  /** Message-ID of the guest email being answered — threads the reply in their mail client. */
  inReplyTo?: string | null
}

/** "Samara Yachting <inquiry@samarayachting.com>" → { name: 'Samara Yachting', email: 'inquiry@samarayachting.com' } */
export function parseAddress(raw: string | undefined | null): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null }
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: raw.trim().toLowerCase() }
}

const domainOf = (email: string | null | undefined) => email?.split('@')[1]?.toLowerCase() ?? null
const localPartOf = (email: string) => email.split('@')[0].toLowerCase()

/** Personal From / Reply-To for `sender`, or the shared ones when they're not on the From domain. */
export function resolveSenderAddresses(sharedFrom: string, sharedReplyTo: string | null, sender?: EmailSender | null) {
  const shared = parseAddress(sharedFrom)
  const fromDomain = domainOf(shared.email)
  const senderEmail = sender?.email?.trim().toLowerCase()
  if (!senderEmail || !fromDomain || domainOf(senderEmail) !== fromDomain) {
    return { from: sharedFrom, replyTo: sharedReplyTo }
  }
  const brand = shared.name
  const displayName = [sender?.name?.trim(), brand].filter(Boolean).join(' – ').replace(/"/g, '')
  const replyDomain = domainOf(parseAddress(sharedReplyTo).email)
  return {
    from: displayName ? `"${displayName}" <${senderEmail}>` : senderEmail,
    replyTo: replyDomain ? `${localPartOf(senderEmail)}@${replyDomain}` : senderEmail,
  }
}

/**
 * Maps the address a guest replied to (rina@<reply domain>) back to the rep's login email
 * (rina@<from domain>). Null for the shared Reply-To or anything not on the reply domain.
 */
export function repEmailForInboundAddress(recipients: string[], sharedFrom: string | null, sharedReplyTo: string | null): string | null {
  const fromDomain = domainOf(parseAddress(sharedFrom).email)
  const shared = parseAddress(sharedReplyTo).email
  const replyDomain = domainOf(shared)
  if (!fromDomain || !replyDomain) return null
  for (const r of recipients) {
    const addr = parseAddress(r).email
    if (!addr || addr === shared || domainOf(addr) !== replyDomain) continue
    return `${localPartOf(addr)}@${fromDomain}`
  }
  return null
}

/** Sales see only their own threads (new mail is auto-distributed); ADMIN sees everything. */
export function emailConversationScope(role: string, userId: string) {
  return role === 'ADMIN' ? {} : { assignedToId: userId }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function filenameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    return last.replace(/^\d+-/, '') || 'attachment'
  } catch { return 'attachment' }
}

export async function sendEmailInboxReply(
  tenantId: string, to: string, subject: string, body: string, opts: SendEmailReplyOptions = {},
): Promise<SendEmailReplyResult> {
  const [apiKey, sharedFrom, sharedReplyTo] = await Promise.all([
    getTenantSecret(tenantId, 'resendApiKey'),
    getTenantSecret(tenantId, 'emailInboxFromAddress'),
    getTenantSecret(tenantId, 'emailInboxReplyToAddress'),
  ])
  if (!apiKey || !sharedFrom) {
    return { ok: false, error: 'Email inbox is not configured for this tenant yet (Resend API Key / From Address)' }
  }
  const { from, replyTo } = resolveSenderAddresses(sharedFrom, sharedReplyTo, opts.sender)

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from, to, subject,
      ...(replyTo ? { replyTo } : {}),
      ...(opts.inReplyTo ? { headers: { 'In-Reply-To': opts.inReplyTo, References: opts.inReplyTo } } : {}),
      ...(opts.attachmentUrls?.length ? { attachments: opts.attachmentUrls.map(path => ({ path, filename: filenameFromUrl(path) })) } : {}),
      html: escapeHtml(body).replace(/\n/g, '<br>'),
      text: body,
    })
    if (error || !data) return { ok: false, error: error?.message ?? 'Send failed' }
    return { ok: true, providerMessageId: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reach Resend' }
  }
}
