import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/geo-country'
import { exceedsRateLimit } from '@/lib/rate-limit'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { logWebhookFailure } from '@/lib/webhook-log'
import { providedWebhookSecret, webhookSecretMatches } from '@/lib/webhook-secret'
import { recordWaTap } from '@/lib/wa-tap'
import { withoutDeniedMetaCookies } from '@/lib/inquiry-tracking'
import { runLateTapChatDeal } from '@/lib/deal-chat'

// WhatsApp-button taps from the website (Button Click to Chat, ref "SL-XXXXX"), forwarded
// server-to-server by WordPress — the samara-erp-tracking plugin relays every tap the site
// logs at /wp-json/gb/v1/wa-tap (docs/wordpress-cf7-webhook.php). Same lead secret as the
// cf7 webhook in X-Webhook-Secret. Body: one tap object, an array, or { taps: [...] }.
// Each tap is stored and matched to its WhatsApp chat (src/lib/wa-tap.ts).
const RATE_LIMIT_MAX = 5_000
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const MAX_TAPS_PER_CALL = 500

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')
  if (exceedsRateLimit(`wa-tap:${rawTenantSlug}:${getClientIp(request) ?? 'unknown'}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return json({ error: 'Too many requests' }, 429)
  }

  let body: unknown = null
  try { body = await request.json() } catch { /* validated below */ }

  try {
    const resolved = await resolveTenantBySlugFull(rawTenantSlug)
    if (!resolved) {
      logWebhookFailure({ source: 'WA_TAP', tenantSlug: rawTenantSlug, reason: 'unknown_tenant' })
      return json({ error: 'Unknown or inactive tenant' }, 400)
    }
    const { db, tenant } = resolved

    const expected = await getTenantSecret(tenant.id, 'cf7WebhookSecret')
    if (!webhookSecretMatches(providedWebhookSecret(request), expected)) {
      logWebhookFailure({ source: 'WA_TAP', tenantSlug: tenant.slug, reason: 'unauthorized' })
      return json({ error: 'Unauthorized' }, 401)
    }

    const taps = (Array.isArray(body) ? body
      : body && typeof body === 'object' && Array.isArray((body as { taps?: unknown }).taps) ? (body as { taps: unknown[] }).taps
      : body && typeof body === 'object' ? [body]
      : []).filter((t): t is Record<string, unknown> => !!t && typeof t === 'object').slice(0, MAX_TAPS_PER_CALL)
    if (taps.length === 0) return json({ error: 'No taps' }, 400)

    let stored = 0, matched = 0, rejected = 0
    for (const tap of taps) {
      const r = await recordWaTap(db, tap)
      if (!r.ok) { rejected++; continue }
      stored++
      if (r.matched) matched++
      // The chat came in before its tap, so it was "direct" — mark its deal as a website enquiry now (src/lib/deal-chat.ts).
      if (r.lateMatchConversationId) await runLateTapChatDeal(db, r.lateMatchConversationId).catch(e => console.error('[wa-tap] late deal failed', e))
    }
    if (rejected) {
      logWebhookFailure({ source: 'WA_TAP', tenantSlug: tenant.slug, reason: 'invalid_ref', rawPayload: { rejected: String(rejected), sample: JSON.stringify(withoutDeniedMetaCookies(taps[0], 'tap')).slice(0, 2000) } })
    }
    return json({ ok: true, stored, matched, rejected })
  } catch (error) {
    logWebhookFailure({ source: 'WA_TAP', tenantSlug: rawTenantSlug, reason: 'exception', detail: String(error) })
    console.error('[WA tap webhook]', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
