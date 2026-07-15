import { Resend } from 'resend'

export interface BulkRecipient {
  email: string
  htmlFor: string // final per-recipient HTML (unsubscribe link already injected)
  unsubscribeUrl?: string // adds a List-Unsubscribe header (one-click) when present
}

export interface BulkSendResult {
  sentIds: Record<string, string> // email -> resend message id
  failures: Record<string, string> // email -> error message
}

// Strips tags for a plain-text alternative — Gmail/Yahoo weigh HTML-only mail as spammier.
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Resend's default plan allows 2 requests/second — stay under that with a fixed
// gap between sends, and back off + retry the rare request that still trips it
// (e.g. when a prior call runs slow and two sends land in the same window).
const MIN_GAP_MS = 550
const RATE_LIMIT_RETRIES = 3
const RATE_LIMIT_BACKOFF_MS = 1100

function isRateLimitError(error: { name?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.name === 'rate_limit_exceeded' || /too many requests/i.test(error.message ?? '')
}

/**
 * Sends one at a time (not a single multi-recipient email) so one bad address
 * doesn't block the rest, and each recipient's "To" line stays private —
 * same approach as the original single-blast Newsletter tool.
 */
export async function sendBulkEmail(params: {
  apiKey: string
  from: string
  fromName?: string
  subject: string
  recipients: BulkRecipient[]
}): Promise<BulkSendResult> {
  const resend = new Resend(params.apiKey)
  const from = params.fromName ? `${params.fromName} <${params.from}>` : params.from
  const result: BulkSendResult = { sentIds: {}, failures: {} }

  for (let i = 0; i < params.recipients.length; i++) {
    const r = params.recipients[i]
    if (i > 0) await sleep(MIN_GAP_MS)

    let data, error
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
      ;({ data, error } = await resend.emails.send({
        from,
        to: r.email,
        subject: params.subject,
        html: r.htmlFor,
        text: htmlToText(r.htmlFor),
        headers: r.unsubscribeUrl
          ? {
              'List-Unsubscribe': `<${r.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            }
          : undefined,
      }))
      if (!isRateLimitError(error) || attempt === RATE_LIMIT_RETRIES) break
      await sleep(RATE_LIMIT_BACKOFF_MS * (attempt + 1))
    }

    if (error || !data) {
      result.failures[r.email] = error?.message ?? 'unknown error'
    } else {
      result.sentIds[r.email] = data.id
    }
  }

  return result
}
