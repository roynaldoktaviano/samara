import crypto from 'crypto'
import type { NextRequest } from 'next/server'

// Shared-secret auth for the website webhooks (cf7, pageview). Reads the
// X-Webhook-Secret header (server-to-server callers, keeps the secret out of
// access logs). `allowQueryParam` additionally accepts ?secret= — only for the
// browser page-view tracker, since sendBeacon can't set headers.
export function providedWebhookSecret(request: NextRequest, { allowQueryParam = false } = {}): string | null {
  return request.headers.get('x-webhook-secret')
    || (allowQueryParam ? request.nextUrl.searchParams.get('secret') : null)
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
