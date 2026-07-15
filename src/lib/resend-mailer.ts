import { Resend } from 'resend'

export interface BulkRecipient {
  email: string
  htmlFor: string // final per-recipient HTML (unsubscribe link already injected)
}

export interface BulkSendResult {
  sentIds: Record<string, string> // email -> resend message id
  failures: Record<string, string> // email -> error message
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

  for (const r of params.recipients) {
    const { data, error } = await resend.emails.send({
      from,
      to: r.email,
      subject: params.subject,
      html: r.htmlFor,
    })
    if (error || !data) {
      result.failures[r.email] = error?.message ?? 'unknown error'
    } else {
      result.sentIds[r.email] = data.id
    }
  }

  return result
}
