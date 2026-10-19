import crypto from 'crypto'
import type { NextRequest } from 'next/server'

// Shared-secret auth for the website webhooks (cf7, pageview). Header only — both
// are called server-to-server by WordPress, and a header keeps the secret out of
// URLs and access logs.
export function providedWebhookSecret(request: NextRequest): string | null {
  return request.headers.get('x-webhook-secret')
}

/** Constant-time compare; false when either side is missing. */
export function webhookSecretMatches(provided: string | null, ...expected: (string | null)[]): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  return expected.some(e => {
    if (!e) return false
    const b = Buffer.from(e)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}
