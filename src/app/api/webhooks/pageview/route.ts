import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/geo-country'
import { exceedsRateLimit } from '@/lib/rate-limit'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { isHttpUrl } from '@/lib/url-safety'
import { logWebhookFailure } from '@/lib/webhook-log'
import { providedWebhookSecret, webhookSecretMatches } from '@/lib/webhook-secret'

// Called server-to-server only, by the tenant's WordPress site: the browser
// beacons each page load to the site's own /wp-json/samara/v1/pv, and WordPress
// forwards it here with the secret in the X-Webhook-Secret header plus the
// visitor's IP as visitor_ip — so the secret never reaches page source or a URL.
// No CORS and no ?secret=, same as the cf7 webhook. Its own
// pageviewWebhookSecret, separate from the cf7 (lead) secret, which is never
// accepted here.
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

// A real visitor loads a few pages a minute at most; 120 per 10 min per visitor IP
// leaves room for an office/hotel sharing one IP while still capping a script.
const VISITOR_RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
// Every legitimate call comes from a WordPress server's IP, carrying all of that
// site's visitors, so the pre-auth cap per caller IP is much higher.
const CALLER_RATE_LIMIT_MAX = 20_000

const MAX_URL_LENGTH = 2000
// samara_vid cookie is a UUID; allow a little slack for other trackers' ids.
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
// A page view is reported as it happens — anything far off is forged or a broken clock.
const MAX_PAST_MS = 60 * 60 * 1000
const MAX_FUTURE_MS = 5 * 60 * 1000

/** "https://www.Example.com/x, otiumyacht.com" → ["example.com", "otiumyacht.com"] */
function parseAllowedDomains(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',')
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
    .filter(Boolean)
}

function hostAllowed(url: string, allowed: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return allowed.some(d => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')

  // Before any DB work, so a flood (or secret guessing) costs us nothing. Not logged — it
  // would just turn the flood into log spam.
  if (exceedsRateLimit(`pageview:${rawTenantSlug}:${getClientIp(request) ?? 'unknown'}`, CALLER_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return json({ error: 'Too many requests' }, 429)
  }

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

    const expected = await getTenantSecret(tenant.id, 'pageviewWebhookSecret')
    if (!webhookSecretMatches(providedWebhookSecret(request), expected)) {
      logWebhookFailure({ source: 'PageView', tenantSlug: tenant.slug, reason: 'unauthorized' })
      return json({ error: 'Unauthorized' }, 401)
    }

    // Per real visitor: WordPress forwards the visitor's IP (trusted only now that the
    // secret has matched).
    const visitorIp = typeof data.visitor_ip === 'string' ? data.visitor_ip.trim().slice(0, 64) : ''
    if (visitorIp && exceedsRateLimit(`pageview:visitor:${tenant.slug}:${visitorIp}`, VISITOR_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      return json({ error: 'Too many requests' }, 429)
    }

    const visitorId = typeof data.visitorId === 'string' ? data.visitorId.trim() : ''
    const rawUrl    = typeof data.url === 'string' ? data.url.trim() : ''
    if (!VISITOR_ID_RE.test(visitorId) || rawUrl.length > MAX_URL_LENGTH || !isHttpUrl(rawUrl)) {
      return json({ error: 'Invalid visitorId or url' }, 400)
    }

    // The reported page URL must be one of the tenant's own sites — stops a WordPress
    // install (or anyone holding the secret) from filling the journey with other sites.
    const allowedDomains = parseAllowedDomains(await getTenantSecret(tenant.id, 'pageviewAllowedDomains'))
    if (allowedDomains.length > 0 && !hostAllowed(rawUrl, allowedDomains)) {
      logWebhookFailure({ source: 'PageView', tenantSlug: tenant.slug, reason: 'domain_not_allowed', detail: `url=${rawUrl.slice(0, 200)}` })
      return json({ error: 'Domain not allowed' }, 403)
    }

    const rawReferrer = typeof data.referrer === 'string' ? data.referrer.trim() : ''
    const title        = typeof data.title === 'string' ? data.title.trim().slice(0, 300) : ''
    const occurredAt   = (() => {
      const now = Date.now()
      const t = new Date(typeof data.occurredAt === 'string' ? data.occurredAt : '').getTime()
      return isNaN(t) || t < now - MAX_PAST_MS || t > now + MAX_FUTURE_MS ? new Date(now) : new Date(t)
    })()

    await db.pageView.create({
      data: {
        visitorId,
        url:        rawUrl,
        referrer:   rawReferrer.length <= MAX_URL_LENGTH && isHttpUrl(rawReferrer) ? rawReferrer : null,
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
