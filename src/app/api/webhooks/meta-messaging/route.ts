import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import type { TenantSecretKey } from '@/lib/tenant-secrets-definitions'
import { logWebhookFailure } from '@/lib/webhook-log'
import { handleMetaMessagingEvents, hasMetaMessagingEvents, type MetaMessagingBody } from '@/lib/meta-dm'
import { IG_LOGIN_APP_SECRET_KEYS } from '@/lib/instagram-login'

// Facebook Messenger + Instagram Direct webhook (see src/lib/meta-dm.ts).
//
// In the Meta App dashboard → Webhooks, for BOTH the "Page" and the "Instagram" object:
//   Callback URL:  https://<app-domain>/api/webhooks/meta-messaging?tenant=<slug>
//   Verify token:  "Meta DM Webhook Verify Token" in Super Admin → Secrets
//   Fields:        messages, message_echoes, message_reactions, messaging_postbacks,
//                  message_deliveries + message_reads (Page) / messaging_seen (Instagram)
// Each brand's Page must also have the app installed (POST /{page-id}/subscribed_apps).
//
// If the Page object already points at /api/webhooks/meta-leads (same Meta App — one URL
// per object), that endpoint forwards DM events here too.
//
// The brands' Pages may sit in separate Meta Apps (Mischief/Otium have their own, as for
// WhatsApp) — they all use this same URL; a delivery is accepted if it's signed by any of
// the configured apps, and the brand is resolved from the Page / IG account id as usual.

const SOURCE = 'META_DM'
const VERIFY_TOKEN_KEYS: TenantSecretKey[] = ['metaDmVerifyToken', 'metaDmMischiefVerifyToken', 'metaDmOtiumVerifyToken']
// Instagram Login deliveries are signed with the Instagram App Secret (src/lib/instagram-login.ts).
const APP_SECRET_KEYS: TenantSecretKey[] = ['metaDmAppSecret', 'metaDmMischiefAppSecret', 'metaDmOtiumAppSecret', ...IG_LOGIN_APP_SECRET_KEYS]

async function configured(tenantId: string, keys: TenantSecretKey[]): Promise<string[]> {
  const values = await Promise.all(keys.map(k => getTenantSecret(tenantId, k)))
  return values.filter((v): v is string => !!v)
}

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const provided = header.slice('sha256='.length)
  if (expected.length !== provided.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

// Subscription handshake — Meta calls this once when the callback URL is saved.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const resolved = await resolveTenantBySlugFull(params.get('tenant'))
  if (!resolved) return new NextResponse('Unknown tenant', { status: 400 })

  const tokens = await configured(resolved.tenant.id, VERIFY_TOKEN_KEYS)
  const given = params.get('hub.verify_token')
  if (params.get('hub.mode') === 'subscribe' && given && tokens.includes(given)) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')
  const rawBody = await request.text()

  const resolved = await resolveTenantBySlugFull(rawTenantSlug)
  if (!resolved) {
    logWebhookFailure({ source: SOURCE, tenantSlug: rawTenantSlug, reason: 'unknown_tenant' })
    return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  }
  const { db, tenant } = resolved

  // Only Meta can produce this signature — no shared secret in URLs.
  const appSecrets = await configured(tenant.id, APP_SECRET_KEYS)
  const signature = request.headers.get('x-hub-signature-256')
  if (!appSecrets.some(secret => verifySignature(rawBody, signature, secret))) {
    logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'unauthorized', detail: appSecrets.length ? 'signature matches no configured Meta DM App Secret' : 'Meta DM App Secret not set' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: MetaMessagingBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!hasMetaMessagingEvents(body)) return NextResponse.json({ ok: true, ignored: true })

  try {
    await handleMetaMessagingEvents(db, tenant.id, body)
  } catch (error) {
    logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'exception', detail: String(error), rawPayload: { body: rawBody.slice(0, 5000) } })
    console.error('[meta-messaging webhook]', error)
    // Non-2xx so Meta redelivers; already-stored messages are skipped by their mid.
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
