import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { isHttpUrl } from '@/lib/url-safety'
import { logWebhookFailure } from '@/lib/webhook-log'

// Called from the client-side tracker on every page load of the tenant's
// website (not just on form submit) — same trust model as /api/webhooks/cf7:
// public + CORS-open, auth is the ?secret= query param (shared with cf7,
// since both come from the same WordPress site).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')

  let data: Record<string, unknown> = {}
  try {
    data = await request.json()
  } catch { /* leave empty — validated below */ }

  try {
    const resolved = await resolveTenantBySlugFull(rawTenantSlug)
    if (!resolved) {
      logWebhookFailure({ source: 'PageView', tenantSlug: rawTenantSlug, reason: 'unknown_tenant' })
      return json({ error: 'Unknown or inactive tenant' }, 400)
    }
    const { db, tenant } = resolved

    const secret   = request.nextUrl.searchParams.get('secret')
    const expected = await getTenantSecret(tenant.id, 'cf7WebhookSecret')
    if (!expected || secret !== expected) {
      logWebhookFailure({ source: 'PageView', tenantSlug: tenant.slug, reason: 'unauthorized' })
      return json({ error: 'Unauthorized' }, 401)
    }

    const visitorId = typeof data.visitorId === 'string' ? data.visitorId.trim() : ''
    const rawUrl    = typeof data.url === 'string' ? data.url.trim() : ''
    if (!visitorId || !isHttpUrl(rawUrl)) {
      return json({ error: 'Missing visitorId or url' }, 400)
    }

    const rawReferrer = typeof data.referrer === 'string' ? data.referrer.trim() : ''
    const title        = typeof data.title === 'string' ? data.title.trim().slice(0, 300) : ''
    const occurredAt   = (() => {
      const d = new Date(typeof data.occurredAt === 'string' ? data.occurredAt : '')
      return isNaN(d.getTime()) ? new Date() : d
    })()

    await db.pageView.create({
      data: {
        visitorId,
        url:        rawUrl,
        referrer:   isHttpUrl(rawReferrer) ? rawReferrer : null,
        title:      title || null,
        occurredAt,
      },
    })

    return json({ ok: true })
  } catch (error) {
    logWebhookFailure({ source: 'PageView', tenantSlug: rawTenantSlug, reason: 'exception', detail: String(error) })
    console.error('[pageview webhook]', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
