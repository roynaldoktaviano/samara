import crypto from 'crypto'
import { getTenantSecret, setTenantSecrets } from '@/lib/tenant-secrets'
import type { TenantSecretKey } from '@/lib/tenant-secrets-definitions'
import { WHATSAPP_BRANDS, WHATSAPP_GRAPH_VERSION, type WhatsappBrand } from '@/lib/whatsapp-brands'

// Instagram API with Instagram Login — the brand's Instagram professional account logs in
// straight from Super Admin (no Facebook Page needed). The callback stores a long-lived
// Instagram user token per brand, and the IG account id that routes inbound DMs
// (metaDm<Brand>IgAccountId, shared with the Page-based setup in src/lib/meta-dm.ts).
// When a brand has this token, Instagram replies go out through graph.instagram.com
// instead of the Page Send API. Tokens live 60 days; refreshIgLoginTokens() keeps them alive.
//
// Meta App → Instagram → API setup with Instagram login → Business login settings:
//   OAuth redirect URI:  <NEXT_PUBLIC_APP_URL>/api/meta/instagram/callback
// Webhooks (same section): callback /api/webhooks/meta-messaging?tenant=<slug>, verify token =
// "Meta DM Webhook Verify Token" — signatures are checked against the Instagram App Secret.

export const IG_GRAPH = `https://graph.instagram.com/${WHATSAPP_GRAPH_VERSION}`
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages']
const SUBSCRIBED_FIELDS = ['messages', 'messaging_postbacks', 'messaging_seen', 'message_reactions']
const DAY_MS = 24 * 60 * 60 * 1000
// Refresh once a token is within this long of expiring (Meta only refreshes tokens ≥ 24h old).
const REFRESH_WITHIN_MS = 15 * DAY_MS
const STATE_TTL_MS = 10 * 60 * 1000

export const IG_LOGIN_BRAND_KEYS: Record<WhatsappBrand, {
  token: TenantSecretKey; expiresAt: TenantSecretKey; username: TenantSecretKey; igAccountId: TenantSecretKey
  appId?: TenantSecretKey; appSecret?: TenantSecretKey
}> = {
  SAMARA:   { token: 'igLoginSamaraToken',   expiresAt: 'igLoginSamaraTokenExpiresAt',   username: 'igLoginSamaraUsername',   igAccountId: 'metaDmSamaraIgAccountId' },
  MISCHIEF: { token: 'igLoginMischiefToken', expiresAt: 'igLoginMischiefTokenExpiresAt', username: 'igLoginMischiefUsername', igAccountId: 'metaDmMischiefIgAccountId', appId: 'igLoginMischiefAppId', appSecret: 'igLoginMischiefAppSecret' },
  OTIUM:    { token: 'igLoginOtiumToken',    expiresAt: 'igLoginOtiumTokenExpiresAt',    username: 'igLoginOtiumUsername',    igAccountId: 'metaDmOtiumIgAccountId',    appId: 'igLoginOtiumAppId',    appSecret: 'igLoginOtiumAppSecret' },
}

/** Every Instagram App Secret configured — the webhook accepts a signature from any of them. */
export const IG_LOGIN_APP_SECRET_KEYS: TenantSecretKey[] = ['igLoginAppSecret', 'igLoginMischiefAppSecret', 'igLoginOtiumAppSecret']

/** The OAuth redirect URI — shared by Instagram Login and Facebook Login for Business. */
export function igLoginRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  return `${base}/api/meta/instagram/callback`
}

/** The brand's own Instagram app when it sits in a separate Meta App, else the shared one. */
async function appCredentials(tenantId: string, brand: WhatsappBrand) {
  const keys = IG_LOGIN_BRAND_KEYS[brand]
  if (keys.appId && keys.appSecret) {
    const [appId, appSecret] = await Promise.all([getTenantSecret(tenantId, keys.appId), getTenantSecret(tenantId, keys.appSecret)])
    if (appId && appSecret) return { appId, appSecret }
  }
  const [appId, appSecret] = await Promise.all([getTenantSecret(tenantId, 'igLoginAppId'), getTenantSecret(tenantId, 'igLoginAppSecret')])
  return appId && appSecret ? { appId, appSecret } : null
}

// ── OAuth state ─────────────────────────────────────────────────────────────────
// Signed so the callback knows which tenant/brand it's for and that this server started it;
// the nonce is also set as a cookie, tying the callback to the browser that clicked Connect.

function stateKey() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return secret
}

// Which login the state belongs to — Instagram Login here, or Facebook Login for Business
// (src/lib/facebook-login.ts); both come back to the same callback URL.
export type MetaLoginVia = 'instagram' | 'facebook'

export function signIgLoginState(payload: { tenantId: string; brand: WhatsappBrand; nonce: string; via: MetaLoginVia }) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })).toString('base64url')
  const sig = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyIgLoginState(state: string | null): { tenantId: string; brand: WhatsappBrand; nonce: string; via: MetaLoginVia } | null {
  if (!state) return null
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url')
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { tenantId?: string; brand?: string; nonce?: string; via?: string; exp?: number }
    if (!p.tenantId || !p.nonce || !p.exp || p.exp < Date.now()) return null
    if (!WHATSAPP_BRANDS.includes(p.brand as WhatsappBrand)) return null
    return { tenantId: p.tenantId, brand: p.brand as WhatsappBrand, nonce: p.nonce, via: p.via === 'facebook' ? 'facebook' : 'instagram' }
  } catch {
    return null
  }
}

/** Instagram's login page for this brand, or null when no Instagram App ID/Secret is set. */
export async function igLoginAuthorizeUrl(tenantId: string, brand: WhatsappBrand, state: string) {
  const app = await appCredentials(tenantId, brand)
  if (!app) return null
  const params = new URLSearchParams({
    enable_fb_login: '0',
    // Always ask which account — one browser connects all three brands in turn.
    force_reauth: 'true',
    client_id: app.appId,
    redirect_uri: igLoginRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${params}`
}

// ── Token exchange ──────────────────────────────────────────────────────────────

type GraphError = { error?: { message?: string; code?: number } | string; error_message?: string; error_type?: string }

function graphError(data: GraphError, status: number) {
  if (typeof data.error === 'object' && data.error?.message) return data.error.message
  return data.error_message || (typeof data.error === 'string' ? data.error : null) || `Instagram returned ${status}`
}

async function igJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & GraphError
  if (!res.ok || (typeof data.error === 'object' && data.error)) throw new Error(graphError(data, res.status))
  return data
}

/**
 * Login code → long-lived token → account details; stores them for the brand and subscribes
 * the account to DM webhooks. A failed subscription doesn't undo the connection (it's reported).
 */
export async function connectIgLogin(tenantId: string, brand: WhatsappBrand, rawCode: string) {
  const app = await appCredentials(tenantId, brand)
  if (!app) throw new Error('Instagram App ID / App Secret is not set (Super Admin → Secrets → Instagram Login)')
  // Meta appends "#_" to the code in some browsers.
  const code = rawCode.replace(/#_$/, '')

  const short = await igJson<{ access_token?: string; data?: { access_token?: string }[] }>(await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, grant_type: 'authorization_code', redirect_uri: igLoginRedirectUri(), code }),
  }))
  const shortToken = short.access_token ?? short.data?.[0]?.access_token
  if (!shortToken) throw new Error('Instagram did not return an access token')

  const long = await igJson<{ access_token: string; expires_in?: number }>(await fetch(
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: app.appSecret, access_token: shortToken })}`,
  ))
  const token = long.access_token
  const expiresAt = new Date(Date.now() + (long.expires_in ?? 60 * 24 * 3600) * 1000)

  // user_id is the professional account id Instagram puts in webhook entries (entry.id).
  const me = await igJson<{ user_id?: string; id?: string; username?: string }>(await fetch(
    `${IG_GRAPH}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${token}` } },
  ))
  const igAccountId = me.user_id ?? me.id
  if (!igAccountId) throw new Error('Instagram did not return the account id')

  const keys = IG_LOGIN_BRAND_KEYS[brand]
  await setTenantSecrets(tenantId, {
    [keys.token]: token,
    [keys.expiresAt]: expiresAt.toISOString(),
    [keys.username]: me.username ?? igAccountId,
    [keys.igAccountId]: String(igAccountId),
  })

  let subscribeError: string | null = null
  try {
    const sub = await igJson<{ success?: boolean }>(await fetch(
      `${IG_GRAPH}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: SUBSCRIBED_FIELDS.join(',') })}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    ))
    if (!sub.success) subscribeError = 'Instagram did not confirm the webhook subscription'
  } catch (e) {
    subscribeError = e instanceof Error ? e.message : 'Webhook subscription failed'
  }
  return { username: me.username ?? null, igAccountId: String(igAccountId), expiresAt, subscribeError }
}

/** The brand's Instagram Login token while it's still valid, else null (→ Page-based sending). */
export async function getIgLoginToken(tenantId: string, brand: WhatsappBrand): Promise<string | null> {
  const keys = IG_LOGIN_BRAND_KEYS[brand]
  const [token, expiresAt] = await Promise.all([getTenantSecret(tenantId, keys.token), getTenantSecret(tenantId, keys.expiresAt)])
  if (!token) return null
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null
  return token
}

export async function igLoginStatus(tenantId: string) {
  const brands = await Promise.all(WHATSAPP_BRANDS.map(async brand => {
    const keys = IG_LOGIN_BRAND_KEYS[brand]
    const [token, expiresAt, username, igAccountId, app] = await Promise.all([
      getTenantSecret(tenantId, keys.token), getTenantSecret(tenantId, keys.expiresAt),
      getTenantSecret(tenantId, keys.username), getTenantSecret(tenantId, keys.igAccountId),
      appCredentials(tenantId, brand),
    ])
    const expired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now()
    return { brand, connected: !!token && !expired, expired, username, igAccountId, expiresAt, appConfigured: !!app }
  }))
  return { redirectUri: igLoginRedirectUri(), brands }
}

/**
 * Extends every brand token that's within REFRESH_WITHIN_MS of expiring (each refresh gives
 * another 60 days). Run daily from src/instrumentation-node.ts — an expired token can't be
 * refreshed, only reconnected.
 */
export async function refreshIgLoginTokens(tenantId: string) {
  for (const brand of WHATSAPP_BRANDS) {
    const keys = IG_LOGIN_BRAND_KEYS[brand]
    const [token, expiresAt] = await Promise.all([getTenantSecret(tenantId, keys.token), getTenantSecret(tenantId, keys.expiresAt)])
    if (!token || !expiresAt) continue
    const left = new Date(expiresAt).getTime() - Date.now()
    if (left <= 0 || left > REFRESH_WITHIN_MS) continue
    try {
      const fresh = await igJson<{ access_token: string; expires_in?: number }>(await fetch(
        `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`,
      ))
      await setTenantSecrets(tenantId, {
        [keys.token]: fresh.access_token,
        [keys.expiresAt]: new Date(Date.now() + (fresh.expires_in ?? 60 * 24 * 3600) * 1000).toISOString(),
      })
    } catch (e) {
      console.error(`[instagram-login] refresh failed for ${brand} (tenant ${tenantId}):`, e)
    }
  }
}
