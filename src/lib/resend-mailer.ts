import { Resend } from 'resend'

export interface BulkRecipient {
  email: string
  // Final per-recipient HTML (unsubscribe link already injected). Accepts a thunk
  // so a large batch (thousands of recipients) doesn't have to hold every
  // recipient's fully-rendered HTML string in memory at once for the whole send —
  // pass a function and it's only materialized right before that recipient's send,
  // then eligible for GC again immediately after.
  htmlFor: string | (() => string)
  unsubscribeUrl?: string // adds a List-Unsubscribe header (one-click) when present
}

export interface BulkSendItemResult {
  resendId?: string
  error?: string
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
// The Resend SDK's fetch call has no built-in timeout — if the request to
// api.resend.com ever hangs (network blip, DNS, etc.) with neither a response nor
// a thrown error, the whole bulk loop stalls forever on that one recipient with no
// error ever recorded. Force it to fail out after this long so the loop moves on.
const REQUEST_TIMEOUT_MS = 20_000

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
  /** Invoked right after each individual send resolves — lets the caller persist
   * per-recipient status immediately instead of waiting for the whole batch to finish. */
  onSent?: (email: string, result: BulkSendItemResult) => void | Promise<void>
}): Promise<BulkSendResult> {
  const resend = new Resend(params.apiKey)
  const from = params.fromName ? `${params.fromName} <${params.from}>` : params.from
  const result: BulkSendResult = { sentIds: {}, failures: {} }

  for (let i = 0; i < params.recipients.length; i++) {
    const r = params.recipients[i]
    if (i > 0) await sleep(MIN_GAP_MS)

    const html = typeof r.htmlFor === 'function' ? r.htmlFor() : r.htmlFor
    let data, error
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
      ;({ data, error } = await resend.emails.send({
        from,
        to: r.email,
        subject: params.subject,
        html,
        text: htmlToText(html),
        headers: r.unsubscribeUrl
          ? {
              'List-Unsubscribe': `<${r.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            }
          : undefined,
      // `signal` isn't in the SDK's PostOptions type, but it spreads options straight
      // into the underlying fetch() call — this works at runtime despite the cast.
      }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } as Parameters<typeof resend.emails.send>[1]))
      if (!isRateLimitError(error) || attempt === RATE_LIMIT_RETRIES) break
      await sleep(RATE_LIMIT_BACKOFF_MS * (attempt + 1))
    }

    if (error || !data) {
      const message = error?.message ?? 'unknown error'
      result.failures[r.email] = message
      await params.onSent?.(r.email, { error: message })
    } else {
      result.sentIds[r.email] = data.id
      await params.onSent?.(r.email, { resendId: data.id })
    }
  }

  return result
}
